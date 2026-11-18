import type { Brain } from '../shared/bots';
import { makeAdvanced } from '../shared/bots/advanced';
import { Economy } from '../shared/bots/advanced/economy';
import { type Net, seatChances } from '../shared/bots/advanced/net';
import { makeParams } from '../shared/bots/advanced/params';
import { STRATEGIES, strategyFits, withStrategy } from '../shared/bots/advanced/strategy';
import { seatFeatures, seatPositions } from '../shared/bots/advanced/value';
import { getActivePlayerId, getView } from '../shared/engine';
import type { GameState } from '../shared/types';
import { loadCheckpoint, paramsOf } from './checkpoints';
import { brainFor } from './jobs';
import { drawScenario, type ScenarioFilter } from './scenarios';
import { determinize } from './search';
import { playGame, playOn, seeded } from './sim';

/**
 * The scorer benchmark (PLAN.md Phase 3 step 2): how well a position scorer at the end of a
 * stopped rollout stands in for playing the rollout to the end, judged on the strategy probe's
 * own task (which strategy to follow from here).
 *
 * Positions come from r1 self-play at the probe's choice points (each seat's first setup
 * settlement, then every `every`-th own turn), saved as whole states so any scorer, with any
 * inputs, can be judged on the same positions later. At each position, every fitting strategy is
 * played to the end `rollouts` times on the probe's resampled hidden facts and dice
 * (strategy-search.ts); each rollout is also snapshotted after each cutoff (in rounds), where
 * every scorer gives our chance. One run thus gives the full-rollout answer and each stopped
 * variant on identical trajectories. Analysis (bench-report.ts) splits rollouts in halves so
 * the reference's own noise is measured, not mistaken for scorer error.
 */

/** A saved choice point. */
export interface BenchPosition {
  seed: number;
  scenario: string;
  players: number;
  seat: number;
  turn: number;
  phase: string;
  state: GameState;
}

/** Self-play to collect choice points (worker job). */
export interface PositionsJob {
  positionsOf: { seed: number; filter?: ScenarioFilter; every: number; perGame: number };
}

/** Rollouts of one position (worker job). */
export interface BenchJob {
  bench: { position: BenchPosition; rollouts: number; cutoffs: number[]; scorers: string[] };
}

/** One rollout's record: the final result and, per cutoff, the points then and each scorer's chance. */
export interface Trajectory {
  /** 1 we won, 0 we lost or it never finished. */
  final: number;
  /** Turns from the position to the end (what a stopped rollout saves is measured against it). */
  turns: number;
  /** Per cutoff: points per seat (ours first, then turn order) and the target, or null if it ended earlier. */
  points: ({ seats: number[]; target: number } | null)[];
  /** Per cutoff, per scorer: our chance (the final result where the game ended earlier). */
  scores: number[][];
}

export interface BenchResult {
  seed: number;
  scenario: string;
  players: number;
  seat: number;
  turn: number;
  phase: string;
  /** The leader's public points at the position (the probe's stage: under 5 early, under 8 mid). */
  leader: number;
  /** Per strategy (STRATEGIES order), its rollouts in sample order; null where it doesn't fit. */
  strategies: (Trajectory[] | null)[];
  ms: number;
}

/** The choice points of one r1 self-play game, a hash-chosen `perGame` of them. */
export function positionsOf(job: PositionsJob['positionsOf']): BenchPosition[] {
  const scenario = drawScenario(job.seed, job.filter);
  const brain = brainFor({ advanced: paramsOf(loadCheckpoint('shipped')) });
  const all: BenchPosition[] = [];
  const ownTurns = new Map<number, number>();
  const settled = new Set<number>();
  let lastTurn = -1;
  const save = (state: GameState, seat: number) =>
    all.push({
      seed: job.seed,
      scenario: scenario.name,
      players: scenario.players,
      seat,
      turn: state.turn,
      phase: state.phase,
      state,
    });
  playGame(
    scenario,
    Array.from({ length: scenario.players }, () => brain),
    job.seed,
    {
      beforeMove(state, seat) {
        if (state.phase === 'setup-settlement' && !settled.has(seat)) {
          settled.add(seat);
          save(state, seat);
        } else if (state.phase === 'roll' && getActivePlayerId(state) === `p${seat}` && state.turn !== lastTurn) {
          lastTurn = state.turn;
          const n = ownTurns.get(seat) ?? 0;
          ownTurns.set(seat, n + 1);
          if (n % job.every === 0) save(state, seat);
        }
      },
    },
  );
  // A fixed, seed-chosen subset, so positions spread over whole games and every seat.
  const keyed = all.map((p, i) => ({ p, key: Math.imul(i + 1, 2654435761) ^ Math.imul(job.seed, 40503) }));
  return keyed
    .sort((a, b) => (a.key >>> 0) - (b.key >>> 0))
    .slice(0, job.perGame)
    .map(k => k.p)
    .sort((a, b) => a.state.version - b.state.version);
}

const knobs = makeParams().knobs;
const nets = new Map<string, Net>();

/** Our chance in `g` by a named scorer: a checkpoint's value network (by its name). */
function score(name: string, g: GameState, id: string): number {
  let net = nets.get(name);
  if (!net) {
    const loaded = loadCheckpoint(name).valueNet;
    if (!loaded) throw new Error(`Checkpoint ${name} has no value network.`);
    net = loaded;
    nets.set(name, net);
  }
  const econ = new Economy(getView(g, id), knobs);
  return seatChances(net, seatFeatures(econ, seatPositions(econ)))[0]!;
}

/** Points per seat from our view, ours first then in turn order. */
function pointsSeen(g: GameState, id: string): number[] {
  const view = getView(g, id);
  const at = view.players.findIndex(p => p.id === id);
  return view.players.map((_, k) => view.players[(at + k) % view.players.length]!.points);
}

let players: Brain[] | null = null;

/** Every strategy's rollouts from one position, snapshotted at each cutoff (worker job). */
export function benchPosition(job: BenchJob['bench']): BenchResult {
  const started = performance.now();
  const { position } = job;
  const state = position.state;
  const id = `p${position.seat}`;
  const params = paramsOf(loadCheckpoint('shipped'));
  const table = state.players.map(() => brainFor({ advanced: params }));
  players ??= STRATEGIES.map(s => {
    const base = makeParams(params);
    return makeAdvanced({ ...base, knobs: withStrategy(base.knobs, s) });
  });
  const view = getView(state, id);
  const strategies = STRATEGIES.map(s => (strategyFits(view, s) ? ([] as Trajectory[]) : null));
  const roundTurns = state.players.length;
  // The same seed mixing as the probe (strategy-search.ts playStrategies), so samples match its kind.
  for (let k = 0; k < job.rollouts; k++) {
    const mix = Math.imul(position.seed, 7919) ^ Math.imul(state.version, 104729) ^ Math.imul(k + 1, 2654435761);
    const sample = determinize(state, id, seeded(mix ^ 0x5bd1e995));
    strategies.forEach((out, i) => {
      if (!out) return;
      const seats = table.map((b, j) => (j === position.seat ? players![i]! : b));
      const random = seeded(mix);
      let g = sample;
      const points: Trajectory['points'] = [];
      const snapshots: (GameState | null)[] = [];
      for (const cutoff of job.cutoffs) {
        g = playOn(g, seats, random, { untilTurn: state.turn + cutoff * roundTurns }).state;
        const over = g.phase === 'finished';
        snapshots.push(over ? null : g);
        points.push(over ? null : { seats: pointsSeen(g, id), target: g.settings.victoryPoints });
      }
      g = playOn(g, seats, random).state;
      const final = g.winnerId === id ? 1 : 0;
      out.push({
        final,
        turns: g.turn - state.turn,
        points,
        scores: snapshots.map(s => job.scorers.map(name => (s ? score(name, s, id) : final))),
      });
    });
  }
  return {
    seed: position.seed,
    scenario: position.scenario,
    players: position.players,
    seat: position.seat,
    turn: position.turn,
    phase: position.phase,
    leader: Math.max(...view.players.map(p => p.points)),
    strategies,
    ms: performance.now() - started,
  };
}
