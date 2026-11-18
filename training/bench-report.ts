import { STRATEGIES } from '../shared/bots/advanced/strategy';
import type { BenchResult, Trajectory } from './scorer-bench';

/**
 * Reading the scorer benchmark (scorer-bench.ts). A "method" turns one rollout into a number:
 * `full` is its final result; `<scorer>@<rounds>` is that scorer's chance at the cutoff;
 * `points@<rounds>` is a softmax of the points then (its one weight fitted to the final results).
 *
 * Rollouts are split in two halves (even and odd samples). A method chooses on one half and is
 * judged by full rollouts on the other, so the reference's own noise (24 rollouts' worth, what the
 * probe used) is part of the ceiling instead of counted against the scorer:
 * - gain: full-rollout win share of its pick minus `current`'s, on the other half (pp). This is
 *   what the probe earns per choice; full rollouts on half A give the ceiling.
 * - agree: how often its pick on A is full rollouts' pick on B (full A vs B is the ceiling).
 * - corr: correlation of its advantages over `current` on A with full ones on B, pooled over
 *   strategies and positions.
 * - pair: per sample, correlation of its difference between a strategy and `current` with the
 *   final results' difference on the same trajectories (no halves: noise-light, 1 is perfect).
 * - brier: squared error of its chance against the final result, per rollout.
 * - cost: share of the full rollouts' turns it plays.
 */

type Method = { name: string; value: (t: Trajectory) => number; cost: (t: Trajectory) => number };

/** The methods a set of results supports: full rollouts, each scorer and points at each cutoff. */
function methods(results: BenchResult[], cutoffs: number[], scorers: string[], players: number): Method[] {
  const out: Method[] = [{ name: 'full', value: t => t.final, cost: () => 1 }];
  cutoffs.forEach((rounds, c) => {
    const cost = (t: Trajectory) => Math.min(1, (rounds * players) / Math.max(1, t.turns));
    scorers.forEach((name, s) => {
      out.push({ name: `${name}@${rounds}`, value: t => t.scores[c]![s]!, cost });
    });
    const beta = fitPoints(results, c);
    out.push({ name: `points@${rounds} (β ${beta.toFixed(2)})`, value: t => pointsChance(t, c, beta), cost });
  });
  return out;
}

/** Our share of a softmax over seats of β × points at the cutoff (the final result if over). */
function pointsChance(t: Trajectory, c: number, beta: number): number {
  const p = t.points[c];
  if (!p) return t.final;
  const top = Math.max(...p.seats);
  const exps = p.seats.map(x => Math.exp(beta * (x - top)));
  return exps[0]! / exps.reduce((a, b) => a + b, 0);
}

/** The β that best predicts final results from points at cutoff `c` (log-likelihood, grid). */
function fitPoints(results: BenchResult[], c: number): number {
  let best = 0;
  let bestLoss = Infinity;
  for (let beta = 0; beta <= 3; beta += 0.05) {
    let loss = 0;
    for (const r of results)
      for (const ts of r.strategies)
        for (const t of ts ?? []) {
          if (!t.points[c]) continue;
          const q = Math.min(1 - 1e-6, Math.max(1e-6, pointsChance(t, c, beta)));
          loss -= t.final ? Math.log(q) : Math.log(1 - q);
        }
    if (loss < bestLoss) [best, bestLoss] = [beta, loss];
  }
  return best;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function correlation(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i]! - my);
    sxx += (x - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  });
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Each fitting strategy's mean value on one half of the samples (0: even, 1: odd). */
function halfMeans(r: BenchResult, value: (t: Trajectory) => number, half: number): (number | null)[] {
  return r.strategies.map(ts => (ts ? mean(ts.filter((_, k) => k % 2 === half).map(value)) : null));
}

/** The best strategy by these means (ties keep `current`, index 0). */
function pick(means: (number | null)[]): number {
  let best = 0;
  means.forEach((m, i) => {
    if (m !== null && m > means[best]!) best = i;
  });
  return best;
}

interface Row {
  name: string;
  gain: number;
  gainErr: number;
  agree: number;
  corr: number;
  pair: number;
  brier: number;
  cost: number;
}

/** One method's numbers over a set of positions. */
function judge(results: BenchResult[], m: Method, full: Method): Row {
  const gains: number[] = [];
  let agree = 0;
  const advM: number[] = [];
  const advF: number[] = [];
  const pairM: number[] = [];
  const pairF: number[] = [];
  const brier: number[] = [];
  const cost: number[] = [];
  for (const r of results) {
    if (r.strategies.filter(Boolean).length < 2) continue;
    for (const half of [0, 1]) {
      const mine = halfMeans(r, m.value, half);
      const truth = halfMeans(r, full.value, 1 - half);
      const p = pick(mine);
      gains.push(truth[p]! - truth[0]!);
      if (p === pick(truth)) agree++;
      mine.forEach((x, i) => {
        if (i === 0 || x === null) return;
        advM.push(x - mine[0]!);
        advF.push(truth[i]! - truth[0]!);
      });
    }
    const base = r.strategies[0]!;
    r.strategies.forEach((ts, i) => {
      ts?.forEach((t, k) => {
        brier.push((m.value(t) - t.final) ** 2);
        cost.push(m.cost(t));
        if (i === 0) return;
        pairM.push(m.value(t) - m.value(base[k]!));
        pairF.push(t.final - base[k]!.final);
      });
    });
  }
  const g = mean(gains);
  const sd = Math.sqrt(mean(gains.map(x => (x - g) ** 2)));
  return {
    name: m.name,
    gain: g,
    // Halves of one position aren't independent; count positions, not halves.
    gainErr: sd / Math.sqrt(Math.max(1, gains.length / 2)),
    agree: agree / Math.max(1, gains.length),
    corr: correlation(advM, advF),
    pair: correlation(pairM, pairF),
    brier: mean(brier),
    cost: mean(cost),
  };
}

const stageOf = (r: BenchResult) =>
  r.phase.startsWith('setup') ? 'setup' : r.leader < 5 ? 'early' : r.leader < 8 ? 'mid' : 'late';

/** Print the benchmark: every method overall, then the best few by game stage. */
export function reportBench(results: BenchResult[], cutoffs: number[], scorers: string[]): void {
  const players = results[0]?.players ?? 3;
  const all = methods(results, cutoffs, scorers, players);
  const full = all[0]!;
  const pct = (x: number) => (x * 100).toFixed(1);
  const header = `${'method'.padEnd(26)}${['gain pp', '±', 'agree', 'corr', 'pair', 'brier', 'cost'].map(h => h.padStart(8)).join('')}`;
  const line = (r: Row) =>
    `${r.name.padEnd(26)}${[pct(r.gain), pct(r.gainErr), pct(r.agree), r.corr.toFixed(2), r.pair.toFixed(2), r.brier.toFixed(3), pct(r.cost)].map(v => v.padStart(8)).join('')}`;
  const choices = results.filter(r => r.strategies.filter(Boolean).length >= 2).length;
  const rollouts = results[0]?.strategies[0]?.length ?? 0;
  console.log(
    `${results.length} positions (${choices} with a choice), ${rollouts} rollouts per strategy, halves of ${rollouts / 2}`,
  );
  console.log(header);
  for (const m of all) console.log(line(judge(results, m, full)));
  const stages = ['setup', 'early', 'mid', 'late'];
  for (const stage of stages) {
    const some = results.filter(r => stageOf(r) === stage);
    if (!some.length) continue;
    console.log(`\n${stage} (${some.length} positions)`);
    for (const m of all) console.log(line(judge(some, m, full)));
  }
  console.log('\npicks on half A (share of positions)');
  console.log(`${''.padEnd(26)}${STRATEGIES.map(s => s.padStart(8)).join('')}`);
  for (const m of all) {
    const picks = STRATEGIES.map(() => 0);
    for (const r of results) picks[pick(halfMeans(r, m.value, 0))]!++;
    console.log(`${m.name.padEnd(26)}${picks.map(n => pct(n / results.length).padStart(8)).join('')}`);
  }
  reportSpread(results, full);
}

/**
 * How big strategy differences really are: the spread of one half's advantages over `current`
 * mixes signal and rollout noise; the covariance between the two halves is the signal alone.
 */
function reportSpread(results: BenchResult[], full: Method): void {
  const a: number[] = [];
  const b: number[] = [];
  for (const r of results) {
    const [ha, hb] = [halfMeans(r, full.value, 0), halfMeans(r, full.value, 1)];
    ha.forEach((x, i) => {
      if (i === 0 || x === null) return;
      a.push(x - ha[0]!);
      b.push(hb[i]! - hb[0]!);
    });
  }
  const ma = mean(a);
  const mb = mean(b);
  const cov = mean(a.map((x, i) => (x - ma) * (b[i]! - mb)));
  const sd = Math.sqrt(mean(a.map(x => (x - ma) ** 2)));
  console.log(
    `\nadvantage over current: mean ${((ma + mb) * 50).toFixed(2)} pp; sd on one half ${(sd * 100).toFixed(1)} pp, ` +
      `of which signal (between-half covariance) ${(Math.sqrt(Math.max(0, cov)) * 100).toFixed(1)} pp`,
  );
}
