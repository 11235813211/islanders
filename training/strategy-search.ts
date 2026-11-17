import type { Brain } from '../shared/bots';
import { makeAdvanced } from '../shared/bots/advanced';
import { Economy } from '../shared/bots/advanced/economy';
import { type Net, seatChances } from '../shared/bots/advanced/net';
import { makeParams, type StoredParams } from '../shared/bots/advanced/params';
import { goalFeatures } from '../shared/bots/advanced/selector';
import { STRATEGIES, type Strategy, strategyFits, withStrategy } from '../shared/bots/advanced/strategy';
import { seatFeatures, seatPositions } from '../shared/bots/advanced/value';
import { getActivePlayerId, getView } from '../shared/engine';
import type { GameState, GameView } from '../shared/types';
import { determinize } from './search';
import { playOn, seeded } from './sim';

/**
 * The strategy probe (PLAN.md Phase 1): a slow, training-only seat that picks a whole-game
 * strategy (strategy.ts) from the position, and keeps it until the next choice point. At each
 * choice point (its first setup settlement, then the start of every `every`-th own turn) it plays
 * the game to the end `rollouts` times per fitting strategy, with this seat following that
 * strategy throughout and everyone else playing their own bot, on hidden facts resampled from
 * its view (search.ts `determinize`). Every strategy meets the same samples and dice, so the
 * differences between them aren't luck. Unlike the build-move probe (search.ts), the seat keeps
 * following the plan it was scored by, so plans that take many turns to pay off get credit.
 */

export interface StrategyOptions {
  rollouts: number;
  /** Choose again at the start of every this-many own turns. */
  every: number;
  /** Switch only when the best strategy beats the one held by this many standard errors (paired). */
  margin: number;
  /** Stop each rollout after this many rounds and score the position with `scorer` (0: play to the end). */
  rounds?: number;
  /** Value network (value.ts seat chances) for stopped rollouts. */
  scorer?: Net | null;
}

/** One choice: where it was made and what each strategy scored (win share; null if it doesn't fit). */
export interface StrategyChoice {
  turn: number;
  phase: string;
  points: number;
  leaderPoints: number;
  chosen: Strategy;
  scores: (number | null)[];
  /** The seat summaries the value network reads (value.ts), ours first: inputs for a learned selector. */
  features: number[][];
  /** The planner's goal numbers (selector.ts goalFeatures); absent in probes before 2026-11-17 06:00. */
  goals?: number[];
}

/** A Brain that plays `params` leaned toward its current strategy, chosen by rollouts. */
export function strategyBrain(
  params: StoredParams,
  live: () => GameState,
  brains: () => Brain[],
  seat: number,
  seed: number,
  options: StrategyOptions,
  choices: StrategyChoice[],
): Brain {
  const base = makeParams(params);
  const players = STRATEGIES.map(s => makeAdvanced({ ...base, knobs: withStrategy(base.knobs, s) }));
  let current: Strategy = 'current';
  let ownTurns = 0;
  let lastTurn = -1;
  const choose = (view: GameView) => {
    const state = live();
    const outcomes = playStrategies(state, seat, players, brains(), seed, options);
    const scores = outcomes.map(o => (o ? mean(o) : null));
    const held = STRATEGIES.indexOf(current);
    let best = held;
    scores.forEach((s, i) => {
      if (s !== null && s > (scores[best] ?? -1)) best = i;
    });
    if (best !== held && clearlyBetter(outcomes[best]!, outcomes[held]!, options.margin)) current = STRATEGIES[best]!;
    const me = view.players.find(p => p.id === view.selfId)!;
    const econ = new Economy(view, base.knobs);
    choices.push({
      turn: view.turn,
      phase: view.phase,
      points: me.points,
      leaderPoints: Math.max(...view.players.map(p => p.points)),
      chosen: current,
      scores,
      features: seatFeatures(econ, seatPositions(econ)),
      goals: goalFeatures(econ),
    });
  };
  const brain = (): Brain => players[STRATEGIES.indexOf(current)]!;
  return {
    turn(view, turnOptions) {
      const state = live();
      const mine = getActivePlayerId(state) === view.selfId;
      if (view.phase === 'setup-settlement' && !Object.values(view.buildings).some(b => b.playerId === view.selfId))
        choose(view);
      else if (view.phase === 'roll' && mine && view.turn !== lastTurn) {
        lastTurn = view.turn;
        if (ownTurns++ % options.every === 0) choose(view);
      }
      return brain().turn(view, turnOptions);
    },
    discard: view => brain().discard(view),
    respond: (view, offer) => brain().respond(view, offer),
    review: (view, offer) => brain().review(view, offer),
    gold: view => brain().gold!(view),
    specialBuild: view => brain().specialBuild!(view),
    lodestoneReserve: view => brain().lodestoneReserve?.(view) ?? 0,
    get tiles() {
      return brain().tiles;
    },
  };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Whether `a` beats `b` over paired outcomes by more than `margin` standard errors. */
function clearlyBetter(a: number[], b: number[] | null, margin: number): boolean {
  if (!b) return true;
  const diffs = a.map((x, k) => x - b[k]!);
  const m = mean(diffs);
  const sd = Math.sqrt(diffs.reduce((n, d) => n + (d - m) ** 2, 0) / Math.max(1, diffs.length - 1));
  return m > margin * (sd / Math.sqrt(diffs.length));
}

/**
 * Each strategy's outcomes over the same resampled futures (null where it doesn't fit): 1 for a
 * win, 0 for a loss, or the scorer's chance for us where a stopped rollout hasn't finished.
 */
function playStrategies(
  state: GameState,
  seat: number,
  players: Brain[],
  table: Brain[],
  seed: number,
  options: StrategyOptions,
): (number[] | null)[] {
  const id = `p${seat}`;
  const view = getView(state, id);
  const wins = STRATEGIES.map(s => (strategyFits(view, s) ? ([] as number[]) : null));
  const untilTurn = options.rounds ? state.turn + options.rounds * state.players.length : Infinity;
  for (let k = 0; k < options.rollouts; k++) {
    const mix = Math.imul(seed, 7919) ^ Math.imul(state.version, 104729) ^ Math.imul(k + 1, 2654435761);
    const sample = determinize(state, id, seeded(mix ^ 0x5bd1e995));
    STRATEGIES.forEach((_, i) => {
      if (wins[i] === null) return;
      const seats = table.map((b, j) => (j === seat ? players[i]! : b));
      const end = playOn(sample, seats, seeded(mix), { untilTurn }).state;
      wins[i]!.push(outcome(end, id, options.scorer));
    });
  }
  return wins;
}

const knobs = makeParams().knobs;

/** Our result at the end of a rollout: won, lost, or (unfinished) the scorer's chance for us. */
function outcome(end: GameState, id: string, scorer: Net | null | undefined): number {
  if (end.winnerId) return end.winnerId === id ? 1 : 0;
  if (!scorer) return 0;
  const econ = new Economy(getView(end, id), knobs);
  return seatChances(scorer, seatFeatures(econ, seatPositions(econ)))[0]!;
}

/** How often each strategy was chosen, overall and by game stage (setup, early, mid, late). */
export function reportStrategyChoices(results: { scenario: string; strategyChoices?: StrategyChoice[] }[]): void {
  const stage = (c: StrategyChoice) =>
    c.phase.startsWith('setup') ? 'setup' : c.leaderPoints < 5 ? 'early' : c.leaderPoints < 8 ? 'mid' : 'late';
  const table = new Map<string, number[]>();
  const add = (row: string, c: StrategyChoice) => {
    const counts = table.get(row) ?? STRATEGIES.map(() => 0);
    counts[STRATEGIES.indexOf(c.chosen)]!++;
    table.set(row, counts);
  };
  for (const r of results)
    for (const c of r.strategyChoices ?? []) {
      add('all', c);
      add(`stage ${stage(c)}`, c);
      add(`map ${r.scenario}`, c);
    }
  console.log(`${'chosen'.padEnd(36)}${STRATEGIES.map(s => s.padStart(9)).join('')}`);
  for (const [row, counts] of [...table].sort((a, b) =>
    a[0] === 'all' ? -1 : b[0] === 'all' ? 1 : a[0] < b[0] ? -1 : 1,
  )) {
    const total = counts.reduce((a, b) => a + b, 0);
    console.log(
      `${row.slice(0, 35).padEnd(36)}${counts.map(n => `${((n / total) * 100).toFixed(0)}%`.padStart(9)).join('')}  (${total})`,
    );
  }
}
