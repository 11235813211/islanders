import { assignNumbers, generateBoard } from '../board';
import { firstFreeColor } from '../colors';
import { developmentDeck } from '../rules';
import { DEFAULT_SETTINGS, guestName } from '../settings';
import { DEFAULT_BOT_LEVEL, type GameState, type Player } from '../types';
import {
  addLog,
  emptyBag,
  emptyDiceCounts,
  emptyStats,
  type Handlers,
  humanPlayers,
  MAX_PLAYERS,
  needPhase,
  requireRule,
} from './core';
import { SCHEMA_VERSION } from './migrations';

export function createGame(
  roomId: string,
  random: () => number = Math.random,
  options: { testMode?: boolean; now?: number } = {},
): GameState {
  const board = generateBoard(random, DEFAULT_SETTINGS.numberLayout);
  return {
    schemaVersion: SCHEMA_VERSION,
    roomId,
    version: 0,
    board,
    players: [],
    spectators: [],
    hostId: '',
    phase: 'lobby',
    buildings: {},
    roads: {},
    robber: board.hexes.find(hex => hex.terrain === 'desert')!.id,
    bank: { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 },
    setupOrder: [],
    setupIndex: 0,
    lastSettlement: null,
    turnIndex: 0,
    turn: 0,
    dice: null,
    pendingDiscards: {},
    winnerId: null,
    log: [],
    settings: { ...DEFAULT_SETTINGS },
    rollDeadline: null,
    diceCounts: emptyDiceCounts(),
    tradeOffer: null,
    testMode: options.testMode === true,
    developmentDeck: developmentDeck(random),
    developmentPlayed: false,
    freeRoads: 0,
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
  };
}

export function addPlayer(state: GameState, input: { id: string; name: string }): GameState {
  requireRule(state.phase === 'lobby', 'This game has already started.');
  requireRule(state.players.length < MAX_PLAYERS, 'This island already has four players.');
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
  const next = structuredClone(state);
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
  const next = structuredClone(state);
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
  const next = structuredClone(state);
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

export const lobbyHandlers: Pick<
  Handlers,
  | 'configure'
  | 'choose-color'
  | 'start'
  | 'leave'
  | 'remove-player'
  | 'transfer-host'
  | 'add-bot'
  | 'set-bot-level'
  | 'play-again'
> = {
  configure({ state, next, player, playerId, random }, action) {
    needPhase(next, 'lobby');
    requireHost(next, playerId, 'change room settings');
    next.settings = { ...next.settings, ...action.settings };
    if (state.settings.numberLayout !== next.settings.numberLayout)
      assignNumbers(next.board, next.settings.numberLayout, random);
    addLog(next, `${player.name} updated the room settings.`);
  },

  'choose-color'({ next, player, playerId }, action) {
    needPhase(next, 'lobby');
    requireRule(
      !next.players.some(other => other.id !== playerId && other.color === action.color),
      'Another player already has that color.',
    );
    player.color = action.color;
  },

  start({ next, playerId }) {
    needPhase(next, 'lobby');
    requireHost(next, playerId, 'start the game');
    requireRule(
      next.players.length >= 2 && next.players.length <= MAX_PLAYERS,
      'Invite at least one friend before starting.',
    );
    const ids = next.players.map(candidate => candidate.id);
    next.setupOrder = [...ids, ...[...ids].reverse()];
    next.phase = 'setup-settlement';
    addLog(next, 'Setup: each player places two settlements and roads, in snake order.');
  },

  /** In the lobby the seat is removed; mid-game a bot takes it over so the game can continue. */
  leave({ next, player }) {
    if (next.phase === 'lobby') {
      next.players = next.players.filter(p => p.id !== player.id);
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
    requireRule(next.players.length < MAX_PLAYERS, 'This island already has four players.');
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
    assignNumbers(fresh.board, next.settings.numberLayout, random);
    const players = next.players.map(p => ({
      ...p,
      resources: emptyBag(),
      development: [],
      knights: 0,
    }));
    Object.assign(next, {
      ...fresh,
      version: next.version,
      players,
      spectators: next.spectators,
      hostId: next.hostId,
      settings: next.settings,
      chat: next.chat,
      stats: Object.fromEntries(players.map(p => [p.id, emptyStats()])),
    });
    addLog(next, 'New game. Same seats, new board.');
  },
};
