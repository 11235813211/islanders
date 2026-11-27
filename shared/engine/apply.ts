import { parseAction } from '../actions';
import { copyData } from '../copy';
import { TUNING } from '../default-settings';
import type { BoardDesign } from '../maps/types';
import { timedChoosers, timeFactor, updateAwards, victoryPoints } from '../rules';
import type { GameAction, GameState } from '../types';
import { candyHandlers } from './candy';
import { cartographersHandlers } from './cartographers';
import {
  type ActionContext,
  addLog,
  cloneState,
  getActivePlayerId,
  type Handlers,
  requireRule,
  SPECIAL_BUILD_SECONDS,
} from './core';
import { developmentHandlers } from './development';
import { routeMet, updatePeaks } from './goals';
import { trackHands } from './hands';
import { knightHandlers } from './knights-actions';
import { legalMoves } from './legal';
import { lobbyHandlers, switchRole } from './lobby';
import { progressHandlers } from './progress';
import { mapProposalHandlers, pruneMapProposals } from './proposals';
import { santaHandlers } from './santa';
import { seaHandlers } from './sea';
import { reclaimSeat, seatHandlers } from './seats';
import { socialAction } from './social';
import { pruneTradeOffers, reproposeDeferred, tradeHandlers } from './trade';
import { afterRobber, turnHandlers } from './turn';

const HANDLERS: Handlers = {
  ...lobbyHandlers,
  ...turnHandlers,
  ...seaHandlers,
  ...tradeHandlers,
  ...developmentHandlers,
  ...cartographersHandlers,
  ...knightHandlers,
  ...progressHandlers,
  ...seatHandlers,
  ...mapProposalHandlers,
  ...santaHandlers,
  ...candyHandlers,
} as Handlers;

/** Actions a player may take when it is not their turn. */
const OFF_TURN = new Set<GameAction['type']>([
  'start',
  'new-board',
  'show-board',
  'configure',
  'choose-color',
  'ask-color-swap',
  'answer-color-swap',
  'leave',
  'remove-player',
  'transfer-host',
  'seat-to-bot',
  'seat-spectator',
  'add-bot',
  'set-bot-level',
  'play-again',
  'choose-map',
  'propose-map',
  'decline-map',
  'set-board-players',
  'discard',
  'choose-gold',
  'take-candy',
  'give-cards',
  'request-special-build',
  'cancel-special-build',
  'give-time',
  'set-double-time',
  'accept-trade',
  'decline-trade',
  'counter-trade',
  // Anyone may offer a trade during someone's turn (see engine/trade.ts).
  'offer-trade',
  'confirm-trade',
  'accept-counter',
  'cancel-trade',
]);
/** Allowed while paused or after the game ends. */
const ALWAYS = new Set<GameAction['type']>([
  'leave',
  'transfer-host',
  'seat-to-bot',
  'seat-spectator',
  'set-double-time',
  'play-again',
]);
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
  'build-relay',
  'build-megacity',
  'trade',
  'bank-trade',
  'confirm-trade',
  'accept-counter',
  'end-turn',
  'build-knight',
  'activate-knight',
  'promote-knight',
  'move-knight',
  'build-wall',
  'improve-city',
]);
/** Moves that neither create nor clear undo history. */
const PASSIVE = new Set<GameAction['type']>([
  'offer-trade',
  'accept-trade',
  'decline-trade',
  'cancel-trade',
  'counter-trade',
  // Another player asking to build after this turn, or giving time, mustn't take the active player's undo away.
  'request-special-build',
  'cancel-special-build',
  'give-time',
  'set-double-time',
  // Thinking about a card before rolling isn't a move either.
  'hold-roll',
  'leave',
  'transfer-host',
]);

/** Moves during the build phase or Road Building that give the turn more time (TUNING.actionBonusSeconds). */
const TIME_BONUS = new Set<GameAction['type']>([
  'trade',
  'bank-trade',
  'offer-trade',
  'counter-trade',
  'accept-trade',
  'confirm-trade',
  'accept-counter',
  'build-road',
  'build-ship',
  'move-ship',
  'build-settlement',
  'build-city',
  'build-relay',
  'build-megacity',
  'buy-development',
  'play-knight',
  'play-road-building',
  'build-knight',
  'activate-knight',
  'promote-knight',
  'move-knight',
  'build-wall',
  'improve-city',
  'play-progress',
  'play-monopoly',
  'play-plenty',
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
  if (action.type === 'reclaim-seat') return reclaimSeat(state, playerId);
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

/** This move adds to the turn clock: a build-phase move, a free road, or having a setup road to place. */
function earnsTime(state: GameState, next: GameState, action: GameAction): boolean {
  if (next.phase === 'setup-road') return state.phase !== 'setup-road';
  return (next.phase === 'build' || next.phase === 'free-roads') && TIME_BONUS.has(action.type);
}

/** Phases where others may be the ones choosing, on their own short clock. */
const HELD_PHASES: readonly GameState['phase'][] = ['discard', 'gold', 'gift', 'candy'];

/**
 * The turn clock stops while players discard or pick gold, so their choices never use up the
 * mover's turn; it starts again, with the same time left, when the choosing is done.
 */
function holdTurnClock(next: GameState, now: number): void {
  const held = HELD_PHASES.includes(next.phase);
  if (held && next.turnHeldAt === null && next.turnDeadline !== null) next.turnHeldAt = now;
  else if (!held && next.turnHeldAt !== null) {
    if (next.turnDeadline !== null) next.turnDeadline += now - next.turnHeldAt;
    next.turnHeldAt = null;
  }
}

/** Bookkeeping shared by every move: awards, winning, trade validity, clocks, and undo history. */
function afterAction(state: GameState, next: GameState, playerId: string, action: GameAction, now: number): void {
  if (next.phase === 'robber' && !legalMoves(next, getActivePlayerId(next)!).robberHexes.length) {
    afterRobber(next);
    addLog(next, 'No legal robber destination is available.');
  }
  pruneMapProposals(next);
  // A megacity's mark goes with its city (barbarians, eruptions, and cards can take the city away).
  next.megacities = next.megacities.filter(id => next.buildings[id]?.kind === 'city');
  updateAwards(next);
  updatePeaks(next);
  trackHands(next);
  const activeId = getActivePlayerId(next);
  if (
    next.turn > 0 &&
    activeId &&
    victoryPoints(next, activeId) >= next.settings.victoryPoints &&
    routeMet(next, activeId)
  ) {
    const points = victoryPoints(next, activeId);
    next.phase = 'finished';
    next.winnerId = activeId;
    next.tradeOffers = [];
    next.proposal = null;
    addLog(next, `${next.players.find(p => p.id === activeId)!.name} reached ${points} points and won.`, {
      kind: 'win',
      playerId: activeId,
      points,
    });
  }
  pruneTradeOffers(next, now);
  reproposeDeferred(next, now);

  const playing = !['lobby', 'pick-board', 'finished'].includes(next.phase);
  // People the host gave double time get twice as long on each clock they are on.
  const mover = getActivePlayerId(next);
  const moverFactor = timeFactor(next.players, [mover]);
  const choosersFactor = timeFactor(next.players, timedChoosers(next, mover));
  // The dice and the volcano dice both roll themselves after the room's auto-roll wait.
  const rolling = (phase: GameState['phase']) => phase === 'roll' || phase === 'eruption';
  if (rolling(next.phase) && next.phase !== state.phase) {
    next.rollDeadline = next.settings.autoRollSeconds ? now + next.settings.autoRollSeconds * 1000 * moverFactor : null;
  } else if (!rolling(next.phase)) next.rollDeadline = null;
  // Gold picks and the robber share the room's short-choice clock.
  const decision = next.settings.decisionSeconds * 1000 * choosersFactor;
  if (next.phase === 'gold' && state.phase !== 'gold') next.goldDeadline = now + decision;
  else if (next.phase !== 'gold') next.goldDeadline = null;
  // Each candy pick gets the short-choice clock of its own.
  const candyPicked = state.candyLoad?.picks.length !== next.candyLoad?.picks.length;
  if (next.phase === 'candy' && (state.phase !== 'candy' || candyPicked)) next.candyDeadline = now + decision;
  else if (next.phase !== 'candy') next.candyDeadline = null;
  // Sending Santa is a short choice like the robber's, on the same clock.
  const aiming = (phase: GameState['phase']) => phase === 'robber' || phase === 'santa';
  if (aiming(next.phase) && next.phase !== state.phase) next.robberDeadline = now + decision;
  else if (!aiming(next.phase)) next.robberDeadline = null;
  // Wedding gifts are picked like discards, on the same clock.
  const picking = (phase: GameState['phase']) => phase === 'discard' || phase === 'gift';
  if (picking(next.phase) && next.phase !== state.phase) next.discardDeadline = now + decision;
  else if (!picking(next.phase)) next.discardDeadline = null;
  if (next.phase !== 'roll') next.rollHeldMs = null;
  holdTurnClock(next, now);
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
    next.turnDeadline = now + seconds * 1000 * moverFactor;
    next.turnHeldAt = HELD_PHASES.includes(next.phase) ? now : null;
    next.turnExpired = false;
  } else if (playing && next.turnDeadline !== null && earnsTime(state, next, action)) {
    // Time other players gave can put the clock above a full turn; a bonus never takes it away.
    next.turnDeadline = Math.max(
      next.turnDeadline,
      Math.min(
        next.turnDeadline + TUNING.actionBonusSeconds * 1000,
        now + next.settings.turnSeconds * 1000 * moverFactor,
      ),
    );
  }
  if (!playing) {
    next.turnDeadline = null;
    next.turnHeldAt = null;
    next.rollDeadline = null;
    next.undo = null;
    next.undoHistory = [];
  }
  if (next.phase === 'finished' && state.phase !== 'finished') next.finishedAt = now;

  if (!PASSIVE.has(action.type)) {
    next.proposal = null;
    // Revealing fog shows hidden tiles, so that move can't be taken back.
    const revealed = next.board.hexes.some((h, i) => state.board.hexes[i]?.terrain === 'fog' && h.terrain !== 'fog');
    // A starting pick is part of placing the settlement, so it can be taken back with it.
    const startPick = action.type === 'choose-gold' && state.phase === 'setup-road';
    if ((REVERSIBLE.has(action.type) || startPick) && next.phase !== 'finished' && !revealed) {
      const {
        undo: _undo,
        undoHistory: _history,
        proposal: _proposal,
        board: _board,
        roomId: _room,
        inviteCode: _code,
        boardPlayers: _boardPlayers,
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
        mapProposals: _proposals,
        ...rest
      } = state;
      const snapshot = copyData(rest);
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
