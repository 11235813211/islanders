import { BOTS, type Brain } from '../shared/bots';
import { makeAdvanced } from '../shared/bots/advanced';
import { exploration } from '../shared/bots/advanced/choose';
import { Economy } from '../shared/bots/advanced/economy';
import { makeParams } from '../shared/bots/advanced/params';
import { finalSetupFeatures } from '../shared/bots/advanced/setup';
import { MAX_SEATS, SEAT_FEATURES, seatFeatures, seatPositions } from '../shared/bots/advanced/value';
import { goldChoice, specialBuild } from '../shared/bots/analysis';
import { getView } from '../shared/engine';
import type { BotLevel } from '../shared/types';
import { decisionRows, isDecision, type RolloutOptions } from './rollouts';
import { drawScenario, type ScenarioFilter } from './scenarios';
import { type GameResult, playGame } from './sim';

/**
 * What a worker thread can be asked to do. Jobs are plain data (they cross threads): seats name
 * a bot level or carry Advanced parameters (knobs and optionally a setup network).
 */

export type SeatSpec =
  | { level: BotLevel }
  | { advanced: Parameters<typeof makeParams>[0] }
  /** Diagnosis: `base` plays everything except the listed parts, which `with` plays. */
  | { hybrid: { base: SeatSpec; with: SeatSpec; parts: Part[] } };

/** Parts of a brain a hybrid seat can swap. */
export const PARTS = ['setup', 'robber', 'build', 'trade', 'gold', 'discard'] as const;
export type Part = (typeof PARTS)[number];

const PHASE_PART: Partial<Record<string, Part>> = {
  'setup-settlement': 'setup',
  'setup-road': 'setup',
  robber: 'robber',
  steal: 'robber',
};

function hybrid(base: Brain, other: Brain, parts: Part[]): Brain {
  const use = (part: Part) => (parts.includes(part) ? other : base);
  return {
    turn: (view, options) => use(PHASE_PART[view.phase] ?? 'build').turn(view, options),
    discard: view => use('discard').discard(view),
    respond: (view, offer) => use('trade').respond(view, offer),
    review: (view, offer) => use('trade').review(view, offer),
    gold: view => (use('gold').gold ?? goldChoice)(view),
    specialBuild: view => (use('build').specialBuild ?? specialBuild)(view),
  };
}

export interface GameJob {
  seed: number;
  filter?: ScenarioFilter;
  /** The seat(s) being measured. */
  hero: SeatSpec;
  /** Everyone else, cycled. */
  field: SeatSpec[];
  /** Hero seats: 1, or 'half' (rounded down, at least 1). */
  heroes?: 1 | 'half';
  /** First hero seat; by default it rotates with the seed. */
  seat?: number;
  /** Start the field at a seed-chosen member, so small tables meet every member of a mixed field. */
  mixed?: boolean;
  /**
   * Record network inputs: each seat's final starting position, positions during play, or
   * move comparisons (rollouts.ts, with `rollouts`).
   */
  record?: 'setup' | 'value' | 'moves';
  rollouts?: RolloutOptions;
}

export interface JobResult extends GameResult {
  scenario: string;
  players: number;
  seed: number;
  ms: number;
  /** Which seats were heroes. */
  heroSeats: number[];
  /** Value-network decisions in this game, how many explored, and how many of those differed. */
  exploration: { decisions: number; explored: number; differed: number };
  /** Recorded network inputs, by seat. */
  recorded?: { seat: number; features: number[] }[];
}

const brains = new Map<string, Brain>();

/** The brain a seat plays with (cached per worker by its spec). */
export function brainFor(spec: SeatSpec): Brain {
  if ('level' in spec) return BOTS[spec.level].brain;
  if ('hybrid' in spec) return hybrid(brainFor(spec.hybrid.base), brainFor(spec.hybrid.with), spec.hybrid.parts);
  const key = JSON.stringify(spec.advanced);
  let brain = brains.get(key);
  if (!brain) {
    brain = makeAdvanced(makeParams(spec.advanced));
    brains.set(key, brain);
    if (brains.size > 64) brains.delete(brains.keys().next().value!);
  }
  return brain;
}

/** Hero seats for a table: rotate with the seed so every seat position is played. */
export function heroSeats(job: GameJob, players: number): number[] {
  const count = job.heroes === 'half' ? Math.max(1, Math.floor(players / 2)) : 1;
  const start = (job.seat ?? job.seed) % players;
  // Spread heroes evenly round the table.
  return Array.from({ length: count }, (_, i) => (start + Math.floor((i * players) / count)) % players);
}

/** Run one job (in a worker thread, or inline when debugging). */
export function runJob(job: GameJob): JobResult {
  const started = performance.now();
  const scenario = drawScenario(job.seed, job.filter);
  const heroes = heroSeats(job, scenario.players);
  let f = job.mixed ? job.seed % job.field.length : 0;
  const seats = Array.from({ length: scenario.players }, (_, i) =>
    heroes.includes(i) ? job.hero : job.field[f++ % job.field.length]!,
  );
  const recorded: { seat: number; features: number[] }[] = [];
  const before = { ...exploration };
  let setupDone = false;
  const params = makeParams();
  const brains = seats.map(brainFor);
  const result = playGame(scenario, brains, job.seed, {
    beforeMove(state, seat) {
      if (!job.record || state.phase.startsWith('setup')) return;
      if (job.record === 'moves') {
        const r = job.rollouts!;
        if (isDecision(state, seat, job.seed, r.rate))
          for (const features of decisionRows(state, seat, brains, job.seed, r)) recorded.push({ seat, features });
        return;
      }
      if (job.record === 'setup') {
        // The first move after setup: every seat's starting position is final.
        if (setupDone) return;
        setupDone = true;
        state.players.forEach((p, seat) => {
          recorded.push({ seat, features: finalSetupFeatures(getView(state, p.id), params) });
        });
      } else if (state.phase === 'roll' && sampled(state.version, job.seed)) {
        // A sample of turn starts, seen by one seat per game (so TD targets have a sequence).
        const viewer = viewSeat(job.seed, state.players.length);
        const econ = new Economy(getView(state, state.players[viewer]!.id), params.knobs);
        recorded.push({ seat: viewer, features: paddedSeats(seatFeatures(econ, seatPositions(econ))) });
      }
    },
  });
  return {
    ...result,
    scenario: scenario.name,
    players: scenario.players,
    seed: job.seed,
    ms: performance.now() - started,
    heroSeats: heroes,
    recorded: job.record ? recorded : undefined,
    exploration: {
      decisions: exploration.decisions - before.decisions,
      explored: exploration.explored - before.explored,
      differed: exploration.differed - before.differed,
    },
  };
}

/** The seat whose view a game's value samples are taken from. */
export function viewSeat(seed: number, players: number): number {
  return (Math.imul(seed, 2654435761) >>> 0) % players;
}

/** [seats present, then MAX_SEATS blocks of SEAT_FEATURES, zero for absent seats]. */
function paddedSeats(seats: number[][]): number[] {
  const out = new Array(1 + MAX_SEATS * SEAT_FEATURES.length).fill(0);
  out[0] = seats.length;
  seats.forEach((f, k) => {
    out.splice(1 + k * SEAT_FEATURES.length, f.length, ...f);
  });
  return out;
}

/** About one turn start in four, chosen by a hash so it is the same in every run. */
function sampled(version: number, seed: number): boolean {
  return ((Math.imul(version ^ (seed * 2654435761), 2246822519) >>> 0) & 3) === 0;
}
