import { chooseBotAction } from '../bots';
import { hasAnswered } from '../rules';
import { type BotLevel, DEFAULT_BOT_LEVEL, type GameAction, type GameState, RESOURCES } from '../types';
import { applyAction } from './apply';
import { addLog, cloneState, emptyBag, GameError, getActivePlayerId, undoEndsTurn } from './core';
import { getView } from './view';

/** How long a bot "thinks" before each move, so people can follow along. */
export const BOT_THINK_MS = 450;
/**
 * Extra wait before a bot starts its turn after a person ends theirs, so that person can undo. It
 * also lets the person's roll finish tumbling (2.6 s) on a slow device before the bot rolls, even
 * when they end their turn straight after rolling.
 */
export const UNDO_GRACE_MS = 3500;
/**
 * Extra wait after a bot's roll (with its icebergs and eruptions) before its next move, so the
 * dice, drifting icebergs, and cards flying out play out before it builds or ends its turn.
 */
export const ROLL_SHOW_MS = 3000;
/** Safety valve: a bot that has done this much in one turn ends it. */
const MAX_BOT_STEPS_PER_TURN = 30;

const isBot = (state: GameState, id: string) => !!state.players.find(p => p.id === id)?.bot;
const playing = (state: GameState) => !['lobby', 'finished'].includes(state.phase);

/** The bot seat that should act next, or null when no bot needs to act. */
export function pendingBotActor(state: GameState): string | null {
  if (state.pausedAt !== null || !playing(state)) return null;
  if (state.phase === 'discard')
    return Object.keys(state.pendingDiscards).find(id => state.pendingDiscards[id]! > 0 && isBot(state, id)) ?? null;
  if (state.phase === 'gold') return Object.keys(state.pendingGold).find(id => isBot(state, id)) ?? null;
  const offer = state.tradeOffer;
  if (offer && state.phase === 'build') {
    const responder = offer.to.find(id => isBot(state, id) && !hasAnswered(offer, id));
    if (responder) return responder;
    // A bot that made an offer trades as soon as someone says yes, or waits until everyone has answered.
    if (isBot(state, offer.fromId))
      return offer.acceptedBy.length || offer.to.every(id => hasAnswered(offer, id)) ? offer.fromId : null;
  }
  const active = getActivePlayerId(state);
  return active && isBot(state, active) ? active : null;
}

/** True right after a person ended their turn, while they can still undo it. */
const endTurnUndoable = (state: GameState) => undoEndsTurn(state) && !isBot(state, state.undo!.actorId);

/** The active bot's own roll (or the icebergs and eruptions it set off) is the latest move. */
const justRolled = (state: GameState, actor: string) =>
  getActivePlayerId(state) === actor && ['roll', 'iceberg', 'eruption'].includes(state.log.at(-1)?.event?.kind ?? '');

/** When the next bot move is due, or null. */
export function botDueAt(state: GameState): number | null {
  const actor = pendingBotActor(state);
  if (!actor) return null;
  // Answering someone else's trade offer needs no show of thinking.
  const answering = state.tradeOffer?.to.includes(actor) && state.tradeOffer.fromId !== actor;
  if (answering) return state.updatedAt;
  const grace = endTurnUndoable(state) ? UNDO_GRACE_MS : justRolled(state, actor) ? ROLL_SHOW_MS : 0;
  return state.updatedAt + BOT_THINK_MS + grace;
}

function botStepsThisTurn(state: GameState, id: string): number {
  const name = state.players.find(p => p.id === id)!.name;
  return state.log.filter(entry => entry.turn === state.turn && entry.text.startsWith(name)).length;
}

/** Apply one bot move. Falls back to simpler choices so a bot can never stall the table. */
function runBotStep(state: GameState, now: number, random: () => number): GameState {
  const id = pendingBotActor(state)!;
  const level = state.players.find(p => p.id === id)!.bot ?? DEFAULT_BOT_LEVEL;
  const view = getView(state, id);
  const builds = botStepsThisTurn(state, id);
  const attempts: (() => GameAction)[] = [
    () =>
      builds > MAX_BOT_STEPS_PER_TURN && state.phase === 'build'
        ? { type: 'end-turn' }
        : chooseBotAction(view, { level }),
    () => chooseBotAction(view, { level: 'beginner', builds: 99 }),
    () => bankGold(state, id),
  ];
  for (const attempt of attempts) {
    try {
      return applyAction(state, id, attempt(), random, now);
    } catch (error) {
      if (!(error instanceof GameError)) throw error;
    }
  }
  // Nothing legal came back: end the bot's turn if it is building, otherwise let the turn clock handle it.
  if (state.phase === 'build' && getActivePlayerId(state) === id)
    return applyAction(state, id, { type: 'end-turn' }, random, now);
  const next = cloneState(state);
  next.updatedAt = now + 60_000;
  return next;
}

/** The phase deadline that is running, if any: the roll (or volcano dice), gold picks, or the robber. */
function phaseDeadline(state: GameState): number | null {
  if (state.phase === 'roll' || state.phase === 'eruption') return state.rollDeadline;
  if (state.phase === 'gold') return state.goldDeadline;
  if (state.phase === 'robber') return state.robberDeadline;
  return null;
}

/**
 * When advanceTime will next change this game by itself (a deadline or a bot move), or null. The
 * room's alarm is set from this, so every deadline fires on time even with nobody sending moves.
 */
export function nextDueAt(state: GameState): number | null {
  const times: (number | null)[] = [state.proposal?.expiresAt ?? null];
  if (state.pausedAt === null) {
    times.push(state.tradeOffer?.expiresAt ?? null, phaseDeadline(state), botDueAt(state));
    if (playing(state)) times.push(state.turnDeadline);
  }
  const due = times.filter((time): time is number => time !== null);
  return due.length ? Math.min(...due) : null;
}

/** Called by durable alarms; deadlines and bots never depend on an open browser. */
export function advanceTime(state: GameState, now: number, random: () => number = Math.random): GameState {
  const next = cloneState(state);
  let changed = false;
  if (next.proposal && next.proposal.expiresAt <= now) {
    next.proposal = null;
    changed = true;
  }
  if (next.pausedAt === null) {
    if (next.tradeOffer && next.tradeOffer.expiresAt <= now) {
      next.tradeOffer = null;
      next.updatedAt = now;
      changed = true;
    }
    if (next.turnDeadline !== null && next.turnDeadline <= now && playing(next))
      return finishTimedTurn(next, now, random);
    if (next.phase === 'roll' && next.rollDeadline !== null && next.rollDeadline <= now)
      return applyAction(next, getActivePlayerId(next)!, { type: 'roll' }, random, now);
    if (next.phase === 'eruption' && next.rollDeadline !== null && next.rollDeadline <= now)
      return applyAction(next, getActivePlayerId(next)!, { type: 'roll-volcanoes' }, random, now);
    if (next.phase === 'gold' && next.goldDeadline !== null && next.goldDeadline <= now)
      return chooseGoldForAll(next, now, random);
    if (next.phase === 'robber' && next.robberDeadline !== null && next.robberDeadline <= now) {
      const id = getActivePlayerId(next)!;
      return applyAction(next, id, chooseBotAction(getView(next, id), { level: DEFAULT_BOT_LEVEL }), random, now);
    }
  }
  if (changed) {
    next.version++;
    return next;
  }
  const due = botDueAt(state);
  return due !== null && due <= now ? runBotStep(state, now, random) : state;
}

/**
 * A gold pick the bank can surely pay, spread over the resources it has most of. Bots can't
 * always know (bank counts are hidden at two players), so this is the fallback when theirs is refused.
 */
export function bankGold(state: GameState, id: string): GameAction {
  const bank = { ...state.bank };
  const resources = emptyBag();
  const owed = Math.min(
    state.pendingGold[id] ?? 0,
    RESOURCES.reduce((n, r) => n + bank[r], 0),
  );
  for (let i = 0; i < owed; i++) {
    const r = [...RESOURCES].sort((a, b) => bank[b] - bank[a])[0]!;
    bank[r]--;
    resources[r]++;
  }
  return { type: 'choose-gold', resources };
}

/** Gold time ran out: pick for everyone still choosing, as an Advanced bot would. */
function chooseGoldForAll(state: GameState, now: number, random: () => number): GameState {
  let next = state;
  for (const id of Object.keys(state.pendingGold)) {
    if (next.phase !== 'gold' || !next.pendingGold[id]) continue;
    try {
      next = applyAction(next, id, chooseBotAction(getView(next, id), { level: DEFAULT_BOT_LEVEL }), random, now);
    } catch (error) {
      if (!(error instanceof GameError)) throw error;
      next = applyAction(next, id, bankGold(next, id), random, now);
    }
  }
  return next;
}

/**
 * A person ran out of time: only the choices the game can't go on without are made for them
 * (setup placements, the roll, discards, the robber, a steal, gold, volcano dice), as an Advanced
 * bot would. Nothing is built, bought, traded, or played; Road Building just stops.
 */
function forcedChoice(state: GameState, id: string, level: BotLevel): GameAction | null {
  switch (state.phase) {
    case 'roll':
      return { type: 'roll' };
    case 'eruption':
      return { type: 'roll-volcanoes' };
    case 'free-roads':
      return { type: 'finish-free-roads' };
    case 'build':
      return null;
    default:
      return chooseBotAction(getView(state, id), { level, allowOffers: false });
  }
}

/** Who must act next during an expired turn: someone discarding or choosing gold, else the active seat. */
function nextChooser(state: GameState): string {
  if (state.phase === 'discard') return Object.keys(state.pendingDiscards).find(id => state.pendingDiscards[id]! > 0)!;
  if (state.phase === 'gold') return Object.keys(state.pendingGold)[0]!;
  return getActivePlayerId(state)!;
}

/**
 * Finish exactly one expired turn (or setup placement). A bot seat plays the rest of its turn; for
 * a person only the forced choices are made (see forcedChoice), then the turn ends.
 */
function finishTimedTurn(state: GameState, now: number, random: () => number): GameState {
  // A special builder who runs out of time just passes; nobody builds for them.
  if (state.phase === 'special-build') {
    const next = applyAction(state, state.specialBuilder!, { type: 'end-turn' }, random, now);
    next.undo = null;
    next.undoHistory = [];
    return next;
  }
  let next = cloneState(state);
  let builds = 0;
  const turn = state.turn;
  const setupIndex = state.setupIndex;
  const active = next.players.find(p => p.id === getActivePlayerId(next))!;
  if (!active.bot) addLog(next, `${active.name} ran out of time.`);
  for (let step = 0; step < 40; step++) {
    if (next.phase === 'finished' || next.phase === 'special-build') break;
    if (next.turn !== turn || next.setupIndex !== setupIndex) break;
    const id = nextChooser(next);
    const view = getView(next, id);
    const choices: (() => GameAction | null)[] = active.bot
      ? [
          () => chooseBotAction(view, { level: DEFAULT_BOT_LEVEL, builds, allowOffers: false }),
          () => chooseBotAction(view, { level: 'beginner', builds: 99 }),
        ]
      : [() => forcedChoice(next, id, DEFAULT_BOT_LEVEL), () => forcedChoice(next, id, 'beginner')];
    let applied: GameAction | null = null;
    for (const choose of choices) {
      const action = choose();
      if (!action) continue;
      try {
        next = applyAction(next, id, action, random, now);
        applied = action;
        break;
      } catch (error) {
        if (!(error instanceof GameError)) throw error;
      }
    }
    if (!applied) break;
    if (['build-road', 'build-ship', 'build-settlement', 'build-city', 'buy-development'].includes(applied.type))
      builds++;
  }
  if (next.phase === 'build' && next.turn === turn)
    next = applyAction(next, getActivePlayerId(next)!, { type: 'end-turn' }, random, now);
  next.undo = null;
  next.undoHistory = [];
  next.proposal = null;
  return next;
}
