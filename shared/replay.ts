import { advanceTime, applyAction, idlePause, idleResume } from './engine';
import type { BotLevel, GameAction, GameState } from './types';

/**
 * Replayable game records, kept only with every human player's consent. A record is the lobby state
 * right before `start` (seats, no names or chat) plus every change after it, each with the random
 * numbers it used, so the engine reproduces the game exactly. Server storage lives in server/recording.ts.
 */

export const RECORD_FORMAT = 1;

export type StepKind = 'action' | 'time' | 'idle-pause' | 'idle-resume';
export interface RecordedStep {
  kind: StepKind;
  /** Seat id (`s0`, `s1`, ...) of whoever acted; set for 'action' only. */
  actor?: string;
  action?: GameAction;
  now: number;
  /** Every value the engine drew from its random function, in order. */
  random: number[];
  /** Seats connected at the time (some actions, such as pause votes, depend on it). */
  online?: string[];
}
export interface GameRecord {
  format: typeof RECORD_FORMAT;
  endedAt: number;
  /** At the start: the bot level of each seat, or null for a person. */
  seats: (BotLevel | null)[];
  initial: GameState;
  steps: RecordedStep[];
  /** Winning seat index, or null if nobody won. */
  winnerSeat: number | null;
  turns: number;
  finalVersion: number;
}
/** Real player id → seat id. */
export type SeatIds = Record<string, string>;

/** True when the game may be recorded: a real game with at least one person, every person having consented. */
export function shouldRecord(game: GameState, consent: Record<string, boolean | undefined>): boolean {
  const humans = game.players.filter(p => !p.bot);
  return !game.testMode && humans.length > 0 && humans.every(p => consent[p.id] === true);
}

/** Copy of a value with player ids (as strings and as object keys) replaced by seat ids. */
export function renameIds<T>(value: T, ids: SeatIds): T {
  if (typeof value === 'string') return (ids[value] ?? value) as T;
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map(item => renameIds(item, ids)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) out[ids[key] ?? key] = renameIds(item, ids);
  return out as T;
}

/** Seat ids for a lobby's players, in seat order. */
export function seatIds(lobby: GameState): SeatIds {
  return Object.fromEntries(lobby.players.map((p, i) => [p.id, `s${i}`]));
}

/** The lobby state as stored: seat ids and names, no chat, log text, spectators, or room code. */
export function anonymizeLobby(lobby: GameState, ids: SeatIds): GameState {
  const state = renameIds(lobby, ids);
  state.roomId = 'REPLAY';
  state.chat = [];
  // Keep the entries (later log ids count on them) but not their text, which has names.
  state.log = state.log.map(entry => ({ ...entry, text: '' }));
  state.spectators = [];
  state.players.forEach((p, i) => {
    p.name = `Seat ${i + 1}`;
  });
  return state;
}

/** One step for storage, or null when it came from someone without a seat (spectators). Chat text is dropped. */
export function toStep(ids: SeatIds, step: RecordedStep): RecordedStep | null {
  if (step.kind === 'action' && !(step.actor && ids[step.actor])) return null;
  const online = step.online?.flatMap(id => (ids[id] ? [ids[id]!] : []));
  const action = step.action && renameIds(step.action, ids);
  return {
    kind: step.kind,
    ...(step.actor ? { actor: ids[step.actor] } : {}),
    ...(action ? { action: action.type === 'chat' ? { ...action, text: '.' } : action } : {}),
    now: step.now,
    random: step.random,
    ...(online ? { online } : {}),
  };
}

/** A random function that remembers what it returned, so a step can be replayed. */
export function tape(source: () => number): { random: () => number; draws: number[] } {
  const draws: number[] = [];
  return {
    draws,
    random: () => {
      const value = source();
      draws.push(value);
      return value;
    },
  };
}

/** Put a finished game together. `final` is the real (not anonymized) end state. */
export function buildRecord(
  initial: GameState,
  steps: RecordedStep[],
  final: GameState,
  ids: SeatIds,
  endedAt: number,
): GameRecord {
  const winner = final.winnerId ? ids[final.winnerId] : undefined;
  return {
    format: RECORD_FORMAT,
    endedAt,
    seats: initial.players.map(p => p.bot ?? null),
    initial,
    steps,
    winnerSeat: winner ? Number(winner.slice(1)) : null,
    turns: final.turn,
    finalVersion: final.version,
  };
}

export interface ReplayEvent {
  index: number;
  step: RecordedStep;
  before: GameState;
  after: GameState;
}

function runStep(state: GameState, step: RecordedStep, random: () => number): GameState {
  if (step.kind === 'time') return advanceTime(state, step.now, random);
  if (step.kind === 'idle-pause') return idlePause(state, step.now);
  if (step.kind === 'idle-resume') return idleResume(state, step.now);
  return applyAction(state, step.actor!, step.action!, random, step.now, { online: step.online });
}

/**
 * Re-run a record through the engine, calling `onStep` with the state before and after each step.
 * Returns the final state. Throws if a step draws a different number of random values than recorded,
 * which means the engine no longer behaves as it did when the game was played.
 */
export function replayRecord(record: GameRecord, onStep?: (event: ReplayEvent) => void): GameState {
  let state = record.initial;
  record.steps.forEach((step, index) => {
    let used = 0;
    const random = () => {
      if (used >= step.random.length) throw new Error(`Step ${index} used more random numbers than recorded.`);
      return step.random[used++]!;
    };
    const after = runStep(state, step, random);
    if (used !== step.random.length) throw new Error(`Step ${index} used fewer random numbers than recorded.`);
    onStep?.({ index, step, before: state, after });
    state = after;
  });
  return state;
}
