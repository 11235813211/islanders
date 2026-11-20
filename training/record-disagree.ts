import { actWith, type Brain } from '../shared/bots';
import { getView, normalizeGame } from '../shared/engine';
import type { GameRecord } from '../shared/replay';
import { victoryPoints } from '../shared/rules';
import type { GameAction, GameState } from '../shared/types';
import { brainFor, type SeatSpec } from './jobs';
import { replayGame } from './replays';
import { rollout } from './rollouts';
import { seeded } from './sim';

/**
 * Where a person's moves in a saved game differ from the bot's (PLAN: people as the yardstick). At
 * each of the person's decisions, ask the bot what it would play from the same view; where the two
 * differ, play both moves to the end many times on the same dice with the bot in every seat, and
 * score how much more often the person's seat wins after the person's move. Large positive gaps are
 * moves the bot should learn; large negative ones are the person's mistakes.
 */

/**
 * Game moves compared. Trade offers and answers are left out: they resolve over several steps, and
 * the rollouts drop open offers.
 */
const COMPARED = new Set<GameAction['type']>([
  'place-settlement',
  'place-road',
  'place-ship',
  'roll',
  'roll-volcanoes',
  'discard',
  'move-robber',
  'steal',
  'choose-gold',
  'build-road',
  'build-ship',
  'move-ship',
  'build-settlement',
  'build-city',
  'build-relay',
  'buy-development',
  'play-knight',
  'play-monopoly',
  'play-plenty',
  'play-road-building',
  'finish-free-roads',
  'bank-trade',
  'trade',
  'chart-hex',
  'split-hex',
  'peek-fog',
  'end-turn',
]);

/** One of the person's decisions where the bot would have played otherwise, ready for rollouts. */
export interface RecordDecision {
  game: number;
  step: number;
  turn: number;
  phase: string;
  actor: string;
  person: GameAction;
  bot: GameAction;
  /** The position before the move, every seat a bot and no open offers (rollouts need both). */
  state: GameState;
  rollouts: number;
  bot_seat: SeatSpec;
}

/** The rollout result for one decision: the person's seat's wins after each move, paired by dice. */
export interface DecisionResult {
  game: number;
  step: number;
  turn: number;
  phase: string;
  person: GameAction;
  bot: GameAction;
  /** Person's move minus the bot's: win share, and its standard error over the paired rollouts. */
  diff: number;
  err: number;
  points: string;
}

/** Key-sorted JSON without zero counts, so equal moves compare equal however they were written. */
function canonical(action: GameAction): string {
  return JSON.stringify(action, (_, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .filter(k => value[k] !== 0)
            .map(k => [k, value[k]]),
        )
      : value,
  );
}

/** The position with every seat played by bots and no offers (their times are long past in rollouts). */
function forRollout(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map(p => ({ ...p, bot: p.bot ?? 'advanced' })),
    tradeOffers: [],
  };
}

/** Builds the person has made this turn (the bot's per-turn limit counts them). */
function buildsThisTurn(state: GameState, actor: string): number {
  const name = state.players.find(p => p.id === actor)!.name;
  return state.log.filter(entry => entry.turn === state.turn && entry.text.startsWith(name)).length;
}

/** Is an offer open to this seat? Older engines kept a single `tradeOffer`. */
function offersTo(state: GameState, actor: string): boolean {
  const old = (state as { tradeOffer?: { to?: string[] } | null }).tradeOffer;
  const offers = state.tradeOffers ?? (old ? [old] : []);
  return offers.some(o => !o.to || o.to.includes(actor));
}

/** One of the person's moves and the position before it, as saved by `records-positions`. */
export interface Position {
  game: number;
  step: number;
  actor: string;
  person: GameAction;
  state: GameState;
}

/**
 * The person's compared moves in one record, with the position before each. This half needs the
 * engine the game was played on, so it can run at an old commit; the positions are upgraded with
 * the room migrations before the bot judges them (`decisionsAt`).
 */
export function recordPositions(record: GameRecord, game: number): Position[] {
  const actor = `s${record.seats.indexOf(null)}`;
  const out: Position[] = [];
  replayGame(record, ({ index, step, before }) => {
    if (step.kind !== 'action' || step.actor !== actor || !step.action || !COMPARED.has(step.action.type)) return;
    // Answers to offers made to the person are trade moves too.
    if (offersTo(before, actor)) return;
    out.push({ game, step: index, actor, person: step.action, state: before });
  });
  return out;
}

/** The positions where `seat` would have played otherwise than the person, ready for rollouts. */
export function decisionsAt(positions: Position[], seat: SeatSpec, rollouts: number): RecordDecision[] {
  const brain = brainFor(seat);
  const out: RecordDecision[] = [];
  for (const { game, step, actor, person, state: saved } of positions) {
    const state = normalizeGame(saved, saved.updatedAt, () => 0.5);
    let bot: GameAction;
    try {
      bot = actWith(brain, getView(state, actor), { builds: buildsThisTurn(state, actor) });
    } catch {
      continue;
    }
    if (canonical(bot) === canonical(person) || bot.type === 'offer-trade') continue;
    const at = { game, step, turn: state.turn, phase: state.phase, actor, person, bot };
    out.push({ ...at, state: forRollout(state), rollouts, bot_seat: seat });
  }
  return out;
}

/** Play both moves out `rollouts` times on the same dice (worker side). Null if either is illegal there. */
export function scoreDecision(d: RecordDecision): DecisionResult | null {
  const brain = brainFor(d.bot_seat);
  const brains: Brain[] = d.state.players.map(() => brain);
  const diffs: number[] = [];
  for (let k = 0; k < d.rollouts; k++) {
    const make = () => seeded(Math.imul(d.game + 1, 7919) ^ Math.imul(d.step, 104729) ^ (k * 2654435761));
    const a = rollout(d.state, d.actor, d.person, brains, make(), { rounds: Infinity });
    const b = rollout(d.state, d.actor, d.bot, brains, make(), { rounds: Infinity });
    if (!a || !b) return null;
    diffs.push(a[0]! - b[0]!);
  }
  const mean = diffs.reduce((s, x) => s + x, 0) / diffs.length;
  const sd = Math.sqrt(diffs.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, diffs.length - 1));
  const points = d.state.players.map(p => `${p.id === d.actor ? '*' : ''}${victoryPoints(d.state, p.id)}`).join(' ');
  return {
    game: d.game,
    step: d.step,
    turn: d.turn,
    phase: d.phase,
    person: d.person,
    bot: d.bot,
    diff: mean,
    err: sd / Math.sqrt(diffs.length),
    points,
  };
}

/** Short text for a move: its type and the fields that say what it chose. */
export function moveText(action: GameAction): string {
  const { type, ...rest } = action as GameAction & Record<string, unknown>;
  const fields = Object.entries(rest)
    .map(([k, v]) => (v && typeof v === 'object' ? `${k}=${canonical(v as GameAction)}` : `${k}=${v}`))
    .join(' ');
  return fields ? `${type} ${fields}` : type;
}

/** The biggest gaps each way, then the average gap by pair of move types. */
export function reportRecordDecisions(results: DecisionResult[], top: number): void {
  const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`;
  const line = (r: DecisionResult) =>
    `  g${r.game} t${r.turn} ${r.phase.padEnd(16)} ${pct(r.diff).padStart(5)} ±${(r.err * 100).toFixed(0).padStart(2)}%  [${r.points}]\n` +
    `      person: ${moveText(r.person)}\n      bot:    ${moveText(r.bot)}`;
  const sorted = [...results].sort((a, b) => b.diff - a.diff);
  console.log(`\nPerson's move won more (person − bot win share, paired rollouts):`);
  for (const r of sorted.slice(0, top).filter(r => r.diff > 0)) console.log(line(r));
  console.log(`\nBot's move won more:`);
  for (const r of sorted
    .slice(-top)
    .reverse()
    .filter(r => r.diff < 0))
    console.log(line(r));
  const groups = new Map<string, number[]>();
  for (const r of results) {
    const key = `${r.person.type} vs ${r.bot.type}`;
    groups.set(key, [...(groups.get(key) ?? []), r.diff]);
  }
  console.log(`\nBy move types (count, mean person − bot):`);
  for (const [key, xs] of [...groups].sort((a, b) => b[1].length - a[1].length))
    console.log(
      `  ${key.padEnd(40)} ${String(xs.length).padStart(4)}  ${pct(xs.reduce((s, x) => s + x, 0) / xs.length)}`,
    );
}
