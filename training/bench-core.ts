import type { BenchResult, Trajectory } from './scorer-bench';

/**
 * Shared pieces of the offline benchmark analysis (bench-analysis.ts, bench-probes.ts). Every
 * number is a held-out estimate: a rule picks a strategy from some rollouts of a position and is
 * judged by the final results of that position's other rollouts, over many random splits. Errors
 * are clustered by game.
 */

export type Series = number[][];

export interface Pos {
  game: number;
  stage: Stage;
  fits: number[];
  final: Series;
  stopped: Map<string, Series>;
}

export type Stage = (typeof STAGES)[number];
export type Pick = (p: Pos, train: number[], index: number) => number;

export const STAGES = ['setup', 'early', 'mid', 'late'] as const;
export const CUTOFFS = [2, 4, 6, 10];
export const SPLITS = 30;
export const CURRENT = 0;

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const pp = (x: number) => (x * 100).toFixed(2).padStart(6);
export const stageOf = (phase: string, leader: number): Stage =>
  phase.startsWith('setup') ? 'setup' : leader < 5 ? 'early' : leader < 8 ? 'mid' : 'late';

export function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function permutation(n: number, random: () => number): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function toPos(r: BenchResult): Pos {
  const seriesOf = (value: (t: Trajectory) => number): Series => r.strategies.map(ts => ts?.map(value) ?? []);
  const stopped = new Map<string, Series>();
  CUTOFFS.forEach((rounds, c) => {
    stopped.set(
      `w1@${rounds}`,
      seriesOf(t => t.scores[c]![0]!),
    );
  });
  return {
    game: r.seed,
    stage: stageOf(r.phase, r.leader),
    fits: r.strategies.flatMap((ts, i) => (ts ? [i] : [])),
    final: seriesOf(t => t.final),
    stopped,
  };
}

export const at = (xs: number[], idx: number[]) => mean(idx.map(k => xs[k]!));

/** The best strategy by mean on `idx`; ties keep the first listed (`current`). */
export function bestOf(p: Pos, s: Series, idx: number[], start = CURRENT): number {
  let best = start;
  let top = at(s[start]!, idx);
  for (const i of p.fits) {
    const m = at(s[i]!, idx);
    if (m > top) [best, top] = [i, m];
  }
  return best;
}

/** Whether `a` beats `b` by more than `margin` paired standard errors (the probe's switching rule). */
export function clearlyBetter(a: number[], b: number[], idx: number[], margin: number): boolean {
  const d = idx.map(k => a[k]! - b[k]!);
  const m = mean(d);
  const sd = Math.sqrt(d.reduce((n, x) => n + (x - m) ** 2, 0) / Math.max(1, d.length - 1));
  return m > margin * (sd / Math.sqrt(d.length));
}

/** Mean and game-clustered standard error of per-position values. */
export function summary(values: number[], positions: Pos[]): { m: number; se: number } {
  const m = mean(values);
  const byGame = new Map<number, number>();
  values.forEach((v, i) => {
    const g = positions[i]!.game;
    byGame.set(g, (byGame.get(g) ?? 0) + v - m);
  });
  const sum = [...byGame.values()].reduce((n, x) => n + x * x, 0);
  return { m, se: Math.sqrt(sum) / values.length };
}

export const show = (s: { m: number; se: number }) => `${pp(s.m)} ±${pp(s.se).trim()}`;

/** The analysis over benchmark positions: shared splits make every comparison paired. */
export class Bench {
  readonly perms: number[][][];
  constructor(readonly pos: Pos[]) {
    this.perms = pos.map((_, i) => {
      const random = rng(i * 7919 + 13);
      return Array.from({ length: SPLITS }, () => permutation(48, random));
    });
  }

  /** Each position's held-out gain over `current` for a rule that trains on `n` rollouts. */
  gains(n: number, pick: Pick, positions = this.pos): number[] {
    return positions.map(p => {
      const i = this.pos.indexOf(p);
      return mean(
        this.perms[i]!.map(perm => {
          const s = pick(p, perm.slice(0, n), i);
          const test = perm.slice(n);
          return at(p.final[s]!, test) - at(p.final[CURRENT]!, test);
        }),
      );
    });
  }

  /** Gain of a rule, optionally only in one stage, as text. */
  line(n: number, pick: Pick): string {
    return show(summary(this.gains(n, pick), this.pos));
  }

  /** Average advantage of each strategy per position (all rollouts), for priors and fixed policies. */
  advantage(p: Pos, s: number): number {
    return mean(p.final[s]!) - mean(p.final[CURRENT]!);
  }
}
