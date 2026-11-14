import { assignNumbers, generateBoard, shuffled } from '../board';
import { firstFreeColor } from '../colors';
import { buildBoard } from '../maps/generate';
import { DEFAULT_SETUP, setupPieces, setupSequence } from '../maps/special';
import { type BoardDesign, boardExpansions, designFor, layoutsOf, playerRange, playerRanges } from '../maps/types';
import { developmentDeck } from '../rules';
import { DEFAULT_SETTINGS, guestName } from '../settings';
import { type Board, DEFAULT_BOT_LEVEL, type GameSettings, type GameState, type Player } from '../types';
import {
  addLog,
  bankFor,
  cartographersRules,
  cloneState,
  emptyBag,
  emptyDiceCounts,
  emptyStats,
  type Handlers,
  humanPlayers,
  isLargeGame,
  MAX_PLAYERS,
  needPhase,
  ownBoard,
  requireRule,
} from './core';
import { SCHEMA_VERSION } from './migrations';

/** A fresh board for the room's map: the standard island, or a new draw of the chosen design. */
export function boardFor(
  design: BoardDesign | null,
  layout: GameSettings['numberLayout'],
  random: () => number,
  players = 4,
  seafarers = !!design,
  /** Play the layout made for this many players instead of the one that fits `players`. */
  layoutFor?: number,
): { board: Board; robber: string; pirate: string | null; fog: GameState['fog'] } {
  if (design) {
    const built = buildBoard(designFor(design, layoutFor ?? players), random);
    return seafarers ? built : { ...built, pirate: null };
  }
  const board = generateBoard(random, layout, isLargeGame(players), seafarers);
  return {
    board,
    robber: board.hexes.find(hex => hex.terrain === 'desert')!.id,
    // One ring of sea is all coast, so the pirate starts off the board until a 7 or a knight.
    pirate: null,
    fog: {},
  };
}

/**
 * How many players the map's layout is picked for: the host's chosen layout, or the table's size
 * (designFor then plays the layout that fits it).
 */
const layoutCount = (next: GameState) => next.map?.layout?.min ?? next.players.length;

/** The log line that opens setup: the usual two settlements, or what this map places instead. */
function setupLogLine(pieces: string[]): string {
  if (pieces.join() === DEFAULT_SETUP.join())
    return 'Setup: each player places two settlements and roads, in snake order.';
  return `Setup: each player places ${pieces.length} pieces (${pieces.join(', ')}), each with a road.`;
}

/** The board, bank, and development deck for the seats at the table (five or six get more of each). */
function dealTable(next: GameState, random: () => number): void {
  const players = next.players.length;
  Object.assign(
    next,
    boardFor(next.design, next.settings.numberLayout, random, players, next.settings.seafarers, layoutCount(next)),
  );
  // A version for this many players brings its own points to win, unless the host changed them.
  const played = next.design && designFor(next.design, layoutCount(next));
  if (played && next.settings.victoryPoints === next.design!.victoryPoints)
    next.settings.victoryPoints = played.victoryPoints;
  next.bank = bankFor(players, cartographersRules(next));
  next.developmentDeck = developmentDeck(random, isLargeGame(players));
}

export function createGame(
  roomId: string,
  random: () => number = Math.random,
  options: { testMode?: boolean; now?: number } = {},
): GameState {
  const { board, robber, pirate } = boardFor(null, DEFAULT_SETTINGS.numberLayout, random);
  return {
    schemaVersion: SCHEMA_VERSION,
    roomId,
    version: 0,
    board,
    players: [],
    spectators: [],
    hostId: '',
    colorSwaps: [],
    phase: 'lobby',
    buildings: {},
    roads: {},
    ships: {},
    relays: [],
    surveys: [],
    robber,
    pirate,
    stealHex: null,
    bank: bankFor(4),
    setupOrder: [],
    setupIndex: 0,
    lastSettlement: null,
    turnIndex: 0,
    turn: 0,
    dice: null,
    pendingDiscards: {},
    pendingGold: {},
    pendingSplit: {},
    goldDeadline: null,
    robberDeadline: null,
    eruption: null,
    volcanoDecks: {},
    diceDeck: [],
    lastRollTotal: null,
    fog: {},
    shipsBuilt: [],
    shipMoved: false,
    islands: {},
    bonusPoints: {},
    routeOf: {},
    peakPoints: {},
    handGuess: { seen: {}, likely: {}, logId: 0 },
    winnerId: null,
    log: [],
    settings: { ...DEFAULT_SETTINGS },
    design: null,
    map: null,
    rollDeadline: null,
    diceCounts: emptyDiceCounts(),
    tradeOffer: null,
    deferredTrades: [],
    fogPeeks: {},
    testMode: options.testMode === true,
    developmentDeck: developmentDeck(random),
    developmentPlayed: false,
    freeRoads: 0,
    specialBuilder: null,
    specialQueue: [],
    specialAsked: [],
    resumePhase: null,
    longestRoadId: null,
    largestArmyId: null,
    turnDeadline: null,
    turnExpired: false,
    pausedAt: null,
    pauseReason: null,
    updatedAt: options.now ?? 0,
    finishedAt: null,
    stats: {},
    proposal: null,
    undo: null,
    undoHistory: [],
    chat: [],
  };
}

function newSeat(state: GameState, id: string, name: string): Player {
  return {
    id,
    name,
    color: firstFreeColor(state.players.map(p => p.color)),
    resources: emptyBag(),
    development: [],
    knights: 0,
    discoveries: 0,
  };
}

export function addPlayer(state: GameState, input: { id: string; name: string }): GameState {
  requireRule(state.phase === 'lobby', 'This game has already started.');
  requireRule(state.players.length < MAX_PLAYERS, 'This island already has six players.');
  requireRule(
    typeof input?.id === 'string' &&
      /^[\w-]{1,128}$/.test(input.id) &&
      !['__proto__', 'constructor', 'prototype'].includes(input.id),
    'Invalid player identity.',
  );
  requireRule(!state.players.some(player => player.id === input.id), 'This player has already joined.');
  requireRule(typeof input.name === 'string', 'Enter a player name.');
  const name = input.name.trim();
  requireRule(
    name.length >= 1 && name.length <= 24 && !/[\u0000-\u001f\u007f]/.test(name),
    'Use a name between 1 and 24 characters.',
  );
  const next = cloneState(state);
  next.players.push(newSeat(next, input.id, name));
  next.stats[input.id] = emptyStats();
  if (!next.hostId) next.hostId = input.id;
  next.version++;
  addLog(next, `${name} joined.`);
  return next;
}

export function addSpectator(state: GameState, input: { id: string; name: string }): GameState {
  requireRule(state.spectators.length < 16, 'This room already has sixteen spectators.');
  requireRule(
    !state.players.some(p => p.id === input.id) && !state.spectators.some(p => p.id === input.id),
    'Already in this room.',
  );
  const next = cloneState(state);
  next.spectators.push(input);
  next.version++;
  return next;
}

/** Lobby only: a player gives up their seat to watch, or a spectator takes an open seat. */
export function switchRole(state: GameState, id: string): GameState {
  requireRule(state.phase === 'lobby', 'Seats are fixed once the game starts.');
  requireRule(!state.testMode, 'Solo test rooms have fixed seats.');
  const seat = state.players.find(p => p.id === id);
  if (!seat) {
    const watcher = state.spectators.find(p => p.id === id);
    requireRule(watcher, 'You are not a member of this room.');
    return addPlayer({ ...state, spectators: state.spectators.filter(p => p.id !== id) }, watcher);
  }
  requireRule(humanPlayers(state).length > 1, 'Someone has to keep a seat. Invite another player first.');
  requireRule(state.spectators.length < 16, 'This room already has sixteen spectators.');
  const next = cloneState(state);
  next.players = next.players.filter(p => p.id !== id);
  delete next.stats[id];
  next.spectators.push({ id, name: seat.name });
  addLog(next, `${seat.name} is now watching.`);
  reassignHost(next);
  next.version++;
  return next;
}

const requireHost = (next: GameState, playerId: string, what: string) =>
  requireRule(next.hostId === playerId, `Only the host can ${what}.`);

/** Hand the host role to the first remaining human, or clear it if none are left. */
function reassignHost(next: GameState): void {
  if (next.players.some(p => p.id === next.hostId && !p.bot)) return;
  next.hostId = humanPlayers(next)[0]?.id ?? '';
  const host = next.players.find(p => p.id === next.hostId);
  if (host) addLog(next, `${host.name} is now the host.`);
}

/** Trade two players' colors and drop any requests the swap makes stale. */
function swapColors(a: Player, b: Player, next: GameState): void {
  [a.color, b.color] = [b.color, a.color];
  next.colorSwaps = next.colorSwaps.filter(s => ![a.id, b.id].includes(s.from) && ![a.id, b.id].includes(s.to));
}

export const lobbyHandlers: Pick<
  Handlers,
  | 'configure'
  | 'choose-color'
  | 'ask-color-swap'
  | 'answer-color-swap'
  | 'start'
  | 'leave'
  | 'remove-player'
  | 'transfer-host'
  | 'add-bot'
  | 'set-bot-level'
  | 'play-again'
  | 'choose-map'
> = {
  configure({ state, next, player, playerId, random }, action) {
    needPhase(next, 'lobby');
    requireHost(next, playerId, 'change room settings');
    next.settings = { ...next.settings, ...action.settings };
    // Turning Seafarers on or off redraws the preview (the standard island gains or loses its sea).
    if (state.settings.seafarers !== next.settings.seafarers)
      Object.assign(
        next,
        boardFor(
          next.design,
          next.settings.numberLayout,
          random,
          next.players.length,
          next.settings.seafarers,
          next.map?.layout?.min,
        ),
      );
    else if (state.settings.numberLayout !== next.settings.numberLayout && !next.design) {
      ownBoard(next);
      assignNumbers(next.board, next.settings.numberLayout, random);
    }
    addLog(next, `${player.name} updated the room settings.`);
  },

  /** Switch maps (or draw the same map again). The server looks up the design and passes it in. */
  'choose-map'({ next, player, playerId, random, design }, action) {
    needPhase(next, 'lobby');
    requireHost(next, playerId, 'choose the map');
    const base = action.mapId === 'base';
    requireRule(base || design?.id === action.mapId, 'That map is not available.');
    const chosen = base ? null : design!;
    const layouts = chosen ? layoutsOf(chosen) : [];
    const layout =
      action.layoutFor === undefined
        ? null
        : layouts.find(l => action.layoutFor! >= l.players.min && action.layoutFor! <= l.players.max)?.players;
    requireRule(layout !== undefined && (!layout || !base), 'That map has no layout for that many players.');
    const before = next.map;
    next.design = chosen;
    next.map = chosen ? { id: chosen.id, name: chosen.name, layouts: playerRanges(chosen), layout } : null;
    const newMap = (before?.id ?? 'base') !== action.mapId;
    if (newMap || before?.layout?.min !== layout?.min)
      next.settings.victoryPoints = chosen
        ? designFor(chosen, layoutCount(next)).victoryPoints
        : DEFAULT_SETTINGS.victoryPoints;
    // Sea maps start with Seafarers on; the host may still turn it off.
    if (newMap) next.settings.seafarers = !!chosen && boardExpansions(chosen).includes('seafarers');
    Object.assign(
      next,
      boardFor(
        chosen,
        next.settings.numberLayout,
        random,
        next.players.length,
        next.settings.seafarers,
        next.map?.layout?.min,
      ),
    );
    const which = layout && layouts.length > 1 ? ` (the ${playerRange(layout)} player map)` : '';
    addLog(next, `${player.name} chose ${chosen ? chosen.name : 'the standard island'}${which}.`);
  },

  'choose-color'({ next, player, playerId }, action) {
    needPhase(next, 'lobby');
    requireRule(
      !next.players.some(other => other.id !== playerId && other.color === action.color),
      'Another player already has that color.',
    );
    player.color = action.color;
    next.colorSwaps = next.colorSwaps.filter(swap => swap.from !== playerId);
  },

  /** Ask another player for their color. A bot always agrees. */
  'ask-color-swap'({ next, player, playerId }, action) {
    needPhase(next, 'lobby');
    const target = next.players.find(other => other.id === action.playerId);
    requireRule(!!target && target.id !== playerId, 'Choose another player.');
    next.colorSwaps = next.colorSwaps.filter(swap => swap.from !== playerId);
    if (target!.bot) return swapColors(player, target!, next);
    next.colorSwaps.push({ from: playerId, to: target!.id });
  },

  /** The asked player accepts (colors swap) or declines. */
  'answer-color-swap'({ next, player, playerId }, action) {
    needPhase(next, 'lobby');
    const swap = next.colorSwaps.find(s => s.from === action.playerId && s.to === playerId);
    requireRule(!!swap, 'That request is gone.');
    const asker = next.players.find(other => other.id === action.playerId);
    next.colorSwaps = next.colorSwaps.filter(s => s !== swap);
    if (action.accept && asker) swapColors(asker, player, next);
  },

  /** The board is drawn here, so nobody sees the layout before the game begins. */
  start({ next, playerId, random }) {
    needPhase(next, 'lobby');
    requireHost(next, playerId, 'start the game');
    requireRule(
      next.players.length >= 2 && next.players.length <= MAX_PLAYERS,
      'Invite at least one friend before starting.',
    );
    dealTable(next, random);
    // Seats are drawn at random so the host (or whoever joined first) does not always go first.
    next.players = shuffled(next.players, random);
    const ids = next.players.map(candidate => candidate.id);
    const pieces = setupPieces(next.board.rules);
    next.setupOrder = setupSequence(ids, pieces.length);
    next.phase = 'setup-settlement';
    addLog(next, setupLogLine(pieces));
  },

  /** In the lobby the seat is removed; mid-game a bot takes it over so the game can continue. */
  leave({ next, player }) {
    if (next.phase === 'lobby') {
      next.players = next.players.filter(p => p.id !== player.id);
      next.colorSwaps = next.colorSwaps.filter(s => s.from !== player.id && s.to !== player.id);
      delete next.stats[player.id];
      addLog(next, `${player.name} left.`);
    } else {
      player.bot = DEFAULT_BOT_LEVEL;
      addLog(next, `${player.name} left. A bot is playing their seat.`);
      if (next.proposal?.required.includes(player.id)) next.proposal = null;
      if (next.phase !== 'finished' && !humanPlayers(next).length) {
        next.phase = 'finished';
        next.winnerId = null;
        addLog(next, 'Everyone left, so the game ended.');
      }
    }
    reassignHost(next);
  },

  'remove-player'({ next, playerId }, action) {
    needPhase(next, 'lobby');
    requireHost(next, playerId, 'remove players');
    requireRule(action.playerId !== playerId, 'Use Leave room to leave.');
    const target = next.players.find(p => p.id === action.playerId);
    requireRule(target, 'That player is not in this room.');
    next.players = next.players.filter(p => p.id !== target.id);
    next.colorSwaps = next.colorSwaps.filter(s => s.from !== target.id && s.to !== target.id);
    delete next.stats[target.id];
    addLog(next, `${target.name} was removed.`);
  },

  'transfer-host'({ next, playerId }, action) {
    requireHost(next, playerId, 'hand over hosting');
    const target = next.players.find(p => p.id === action.playerId);
    requireRule(target && !target.bot && target.id !== playerId, 'Choose another person to host.');
    next.hostId = target.id;
    addLog(next, `${target.name} is now the host.`);
  },

  'add-bot'({ next, playerId, random }, action) {
    needPhase(next, 'lobby');
    requireHost(next, playerId, 'add bots');
    requireRule(next.players.length < MAX_PLAYERS, 'This island already has six players.');
    let id: string;
    do id = `bot-${Math.floor(random() * 2 ** 32).toString(36)}`;
    while (next.players.some(p => p.id === id));
    const seat = newSeat(
      next,
      id,
      guestName(
        next.players.map(p => p.name),
        random,
      ),
    );
    seat.bot = action.level;
    next.players.push(seat);
    next.stats[id] = emptyStats();
    addLog(next, `${seat.name} (bot) joined.`);
  },

  'set-bot-level'({ next, playerId }, action) {
    needPhase(next, 'lobby');
    requireHost(next, playerId, 'change bots');
    const target = next.players.find(p => p.id === action.playerId);
    requireRule(target?.bot, 'That seat is not a bot.');
    target.bot = action.level;
  },

  /** Same seats, settings, and chat; fresh board and hands. */
  'play-again'({ next, playerId, random, now }) {
    needPhase(next, 'finished');
    requireHost(next, playerId, 'start a new game');
    const fresh = createGame(next.roomId, random, { testMode: next.testMode, now });
    const players = next.players.map(p => ({
      ...p,
      resources: emptyBag(),
      development: [],
      knights: 0,
      discoveries: 0,
    }));
    Object.assign(next, {
      ...fresh,
      design: next.design,
      map: next.map,
      version: next.version,
      players,
      spectators: next.spectators,
      hostId: next.hostId,
      settings: next.settings,
      chat: next.chat,
      stats: Object.fromEntries(players.map(p => [p.id, emptyStats()])),
    });
    dealTable(next, random);
    addLog(next, 'New game. Same seats, new board.');
  },
};
