import { KNOBS, type Knob } from '../shared/bots/advanced/params';
import { type Checkpoint, loadCheckpoint, paramsOf, saveCheckpoint, seatFor } from './checkpoints';
import { heroFitness } from './evaluate';
import type { GameJob, SeatSpec } from './jobs';
import { runJobs } from './pool';
import { seeded } from './sim';

/**
 * Tunes the Advanced knobs (params.ts KNOBS) by evolution strategies. Each generation draws
 * `pairs` random directions; for each, the knobs nudged +σ and −σ that way play the same
 * `games` seeds (same boards, same dice), and the difference in fitness says which way is
 * better. Adam then moves the knobs. Knobs are searched in their 0–1 range (KNOBS min..max).
 *
 * Fitness (evaluate.ts heroFitness): wins over fair share, plus a little for points reached,
 * with the hero in one seat against the field (Intermediate and the starting checkpoint, so it
 * doesn't only learn to beat one opponent).
 */

export interface TuneOptions {
  from: string;
  name: string;
  generations: number;
  pairs: number;
  games: number;
  sigma: number;
  rate: number;
  knobs: Knob[];
  field: string[];
  firstSeed: number;
}

const unit = (k: Knob, v: number) => (v - KNOBS[k][1]) / (KNOBS[k][2] - KNOBS[k][1]);
const value = (k: Knob, u: number) => KNOBS[k][1] + Math.min(1, Math.max(0, u)) * (KNOBS[k][2] - KNOBS[k][1]);

/** Knobs worth tuning by default (setupExplore is for data collection; setupCandidates is CPU). */
export const TUNABLE = (Object.keys(KNOBS) as Knob[]).filter(k => k !== 'setupExplore' && k !== 'setupCandidates');

export async function tune(options: TuneOptions): Promise<Checkpoint> {
  const parent = loadCheckpoint(options.from);
  const knobs = Object.fromEntries((Object.keys(KNOBS) as Knob[]).map(k => [k, parent.knobs[k] ?? KNOBS[k][0]]));
  const keys = options.knobs;
  let u = keys.map(k => unit(k, knobs[k]!));
  const m = new Array(keys.length).fill(0);
  const v = new Array(keys.length).fill(0);
  const field: SeatSpec[] = options.field.map(seatFor);
  const gauss = seeded(options.firstSeed ^ 0x5eed);
  const normal = () => Math.sqrt(-2 * Math.log(gauss() + 1e-12)) * Math.cos(2 * Math.PI * gauss());
  const spec = (point: number[]): SeatSpec => ({
    advanced: {
      ...paramsOf(parent),
      knobs: { ...knobs, ...Object.fromEntries(keys.map((k, i) => [k, value(k, point[i]!)])) },
    },
  });
  const checkpoint: Checkpoint = {
    name: options.name,
    parent: options.from,
    createdAt: new Date().toISOString(),
    knobs: { ...knobs },
    setupNet: parent.setupNet,
    valueNet: parent.valueNet ?? null,
    notes: [...parent.notes],
  };
  for (let gen = 1; gen <= options.generations; gen++) {
    const started = Date.now();
    const directions = Array.from({ length: options.pairs }, () => keys.map(() => normal()));
    const seed = options.firstSeed + gen * options.games;
    const jobs: GameJob[] = [];
    for (const d of directions)
      for (const sign of [1, -1])
        for (let g = 0; g < options.games; g++)
          jobs.push({
            seed: seed + g,
            hero: spec(u.map((x, i) => x + sign * options.sigma * d[i]!)),
            field,
          });
    const results = await runJobs(jobs);
    const fitness = (pair: number, sign: number) => {
      const start = (pair * 2 + (sign === 1 ? 0 : 1)) * options.games;
      return results.slice(start, start + options.games).reduce((s, r) => s + heroFitness(r), 0) / options.games;
    };
    const grad = keys.map(() => 0);
    let mean = 0;
    directions.forEach((d, p) => {
      const plus = fitness(p, 1);
      const minus = fitness(p, -1);
      mean += (plus + minus) / 2 / options.pairs;
      d.forEach((x, i) => {
        grad[i]! += ((plus - minus) * x) / (2 * options.sigma * options.pairs);
      });
    });
    // Adam ascent on the knobs' 0–1 positions.
    u = u.map((x, i) => {
      m[i] = 0.9 * m[i] + 0.1 * grad[i]!;
      v[i] = 0.999 * v[i] + 0.001 * grad[i]! ** 2;
      const step = (options.rate * (m[i] / (1 - 0.9 ** gen))) / (Math.sqrt(v[i] / (1 - 0.999 ** gen)) + 1e-8);
      return Math.min(1, Math.max(0, x + step));
    });
    keys.forEach((k, i) => {
      checkpoint.knobs[k] = value(k, u[i]!);
    });
    const line = `${options.name} gen ${gen}: fitness ${mean.toFixed(4)} (${jobs.length} games, ${((Date.now() - started) / 1000).toFixed(0)} s)`;
    console.log(line);
    console.log(`  ${keys.map(k => `${k}=${checkpoint.knobs[k]!.toFixed(2)}`).join(' ')}`);
    checkpoint.notes = [...parent.notes, `${line}; tuned ${keys.length} knobs from ${options.from}`];
    // Every generation is kept: the last is not necessarily the best (pick with `select`).
    saveCheckpoint(checkpoint);
    saveCheckpoint({ ...checkpoint, name: `${options.name}-g${gen}` });
  }
  return checkpoint;
}
