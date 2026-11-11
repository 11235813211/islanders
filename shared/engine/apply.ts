import { parseAction } from '../actions';
import type { BoardDesign } from '../maps/types';
import { updateAwards, victoryPoints } from '../rules';
import type { GameAction, GameState } from '../types';
import {
  type ActionContext,
  addLog,
  cloneState,
  GOLD_SECONDS,
  getActivePlayerId,
  type Handlers,
  ROBBER_SECONDS,
  requireRule,
  SPECIAL_BUILD_SECONDS,
} from './core';
import { developmentHandlers } from './development';
import { legalMoves } from './legal';
import { lobbyHandlers, switchRole } from './lobby';
import { seaHandlers } from './sea';
import { socialAction } from './social';
import { pruneTradeOffer, tradeHandlers } from './trade';
import { turnHandlers } from './turn';

const HANDLERS: Handlers = {
  ...lobbyHandlers,
  ...turnHandlers,
  ...seaHandlers,
  ...tradeHandlers,
  ...developmentHandlers,
} as Handlers;

/** Actions a player may take when it is not their turn. */
const OFF_TURN = new Set<GameAction['type']>([
  'start',
  'configure',
  'choose-color',
  'leave',
  'remove-player',
  'transfer-host',
  'add-bot',
  'set-bot-level',
  'play-again',
  'choose-map',
  'discard',
  'choose-gold',
  'request-special-build',
  'accept-trade',
  'decline-trade',
  'counter-trade',
]);
/** Allowed while paused or after the game ends. */
const ALWAYS = new Set<GameAction['type']>(['leave', 'transfer-host', 'play-again']);
/** Moves players can vote to undo. */
const REVERSIBLE = new Set<GameAction['type']>([
  'place-settlement',
  'place-road',
  'place-ship',
  'build-road',
  'build-ship',
  'move-ship',
  'build-settlement',
  'build-city',
  'trade',
  'confirm-trade',
  'accept-counter',
  'end-turn',
]);
/** Moves that neither create nor clear undo history. */
const PASSIVE = new Set<GameAction['type']>([
  'offer-trade',
  'accept-trade',
  'decline-trade',
  'cancel-trade',
  'counter-trade',
  // Another player asking to build after this turn mustn't take the active player's undo away.
  'request-special-build',
  'leave',
  'transfer-host',
]);

/** Every accepted command returns a new state; rejected commands throw GameError and leave input intact. */
export function applyAction(
  state: GameState,
  playerId: string,
  rawAction: GameAction,
  random: () => number = Math.random,
  now = Date.now(),
  context: { online?: string[]; design?: BoardDesign } = {},
): GameState {
  const action = parseAction(rawAction);
  const social = socialAction(state, playerId, action, now, context.online);
  if (social) return social;

  // Spectators are not players, so the two actions they can take skip the player checks below.
  if (action.type === 'switch-role') return switchRole(state, playerId);
  if (action.type === 'leave' && state.spectators.some(s => s.id === playerId)) {
    const next = cloneState(state);
    next.spectators = next.spectators.filter(s => s.id !== playerId);
    next.version++;
    return next;
  }
  if (!ALWAYS.has(action.type))
    requireRule(state.pausedAt === null, 'The game is paused. Propose resuming to continue.');
  requireRule(
    state.players.some(player => player.id === playerId),
    'You are not a player in this room.',
  );
  if (!ALWAYS.has(action.type)) requireRule(state.phase !== 'finished', 'This game has finished.');
  if (!OFF_TURN.has(action.type)) requireRule(getActivePlayerId(state) === playerId, 'Wait for your turn.');

  const next = cloneState(state);
  const ctx: ActionContext = {
    state,
    next,
    playerId,
    player: next.players.find(candidate => candidate.id === playerId)!,
    now,
    random,
    design: context.design,
  };
  (HANDLERS[action.type] as (ctx: ActionContext, action: GameAction) => void)(ctx, action);
  afterAction(state, next, playerId, action, now);
  return next;
}

/** Bookkeeping shared by every move: awards, winning, trade validity, clocks, and undo history. */
function afterAction(state: GameState, next: GameState, playerId: string, action: GameAction, now: number): void {
  if (next.phase === 'robber' && !legalMoves(next, getActivePlayerId(next)!).robberHexes.length) {
    next.phase = next.resumePhase ?? 'build';
    next.resumePhase = null;
    addLog(next, 'No legal robber destination is available.');
  }
  updateAwards(next);
  const activeId = getActivePlayerId(next);
  if (next.turn > 0 && activeId && victoryPoints(next, activeId) >= next.settings.victoryPoints) {
    const points = victoryPoints(next, activeId);
    next.phase = 'finished';
    next.winnerId = activeId;
    next.tradeOffer = null;
    next.proposal = null;
    addLog(next, `${next.players.find(p => p.id === activeId)!.name} reached ${points} points and won.`, {
      kind: 'win',
      playerId: activeId,
      points,
    });
  }
  pruneTradeOffer(next);

  const playing = !['lobby', 'finished'].includes(next.phase);
  // The dice and the volcano dice both roll themselves after the room's auto-roll wait.
  const rolling = (phase: GameState['phase']) => phase === 'roll' || phase === 'eruption';
  if (rolling(next.phase) && next.phase !== state.phase) {
    next.rollDeadline = next.settings.autoRollSeconds ? now + next.settings.autoRollSeconds * 1000 : null;
  } else if (!rolling(next.phase)) next.rollDeadline = null;
  if (next.phase === 'gold' && state.phase !== 'gold') next.goldDeadline = now + GOLD_SECONDS * 1000;
  else if (next.phase !== 'gold') next.goldDeadline = null;
  if (next.phase === 'robber' && state.phase !== 'robber') next.robberDeadline = now + ROBBER_SECONDS * 1000;
  else if (next.phase !== 'robber') next.robberDeadline = null;
  const newSeat =
    action.type === 'start' ||
    next.setupIndex !== state.setupIndex ||
    next.turn !== state.turn ||
    next.specialBuilder !== state.specialBuilder;
  if (playing && newSeat) {
    const seconds =
      next.phase === 'special-build'
        ? Math.min(SPECIAL_BUILD_SECONDS, next.settings.turnSeconds)
        : next.settings.turnSeconds;
    next.turnDeadline = now + seconds * 1000;
    next.turnExpired = false;
  }
  if (!playing) {
    next.turnDeadline = null;
    next.rollDeadline = null;
    next.undo = null;
    next.undoHistory = [];
  }
  if (next.phase === 'finished' && state.phase !== 'finished') next.finishedAt = now;

  if (!PASSIVE.has(action.type)) {
    next.proposal = null;
    // Revealing fog shows hidden tiles, so that move can't be taken back.
    const revealed = next.board.hexes.some((h, i) => state.board.hexes[i]?.terrain === 'fog' && h.terrain !== 'fog');
    if (REVERSIBLE.has(action.type) && next.phase !== 'finished' && !revealed) {
      const {
        undo: _undo,
        undoHistory: _history,
        proposal: _proposal,
        board: _board,
        roomId: _room,
        hostId: _host,
        version: _version,
        chat: _chat,
        log: _log,
        spectators: _spectators,
        settings: _settings,
        setupOrder: _setup,
        developmentDeck: _deck,
        testMode: _test,
        design: _design,
        map: _map,
        ...rest
      } = state;
      const snapshot = structuredClone(rest);
      next.undoHistory = [...state.undoHistory, ...(state.undo ? [state.undo] : [])];
      next.undo = { actorId: playerId, at: now, description: next.log.at(-1)?.text ?? action.type, snapshot };
    } else {
      next.undo = null;
      next.undoHistory = [];
    }
  }
  next.updatedAt = now;
  next.version++;
}
