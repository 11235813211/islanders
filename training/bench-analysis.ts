import { STRATEGIES } from '../shared/bots/advanced/strategy';
import {
  at,
  Bench,
  bestOf,
  CURRENT,
  CUTOFFS,
  clearlyBetter,
  mean,
  type Pick,
  type Pos,
  pp,
  type Series,
  SPLITS,
  STAGES,
  type Stage,
  show,
  summary,
  toPos,
} from './bench-core';
import { predictProbes } from './bench-probes';
import type { BenchResult } from './scorer-bench';

/**
 * What the saved scorer benchmark can still answer without new games
 * (analysis/2026-11-17-bench-offline.md): signal and noise, strategies followed with no search,
 * equal-CPU scorers, and better uses of the same rollouts.
 */

function noiseReport(b: Bench): void {
  console.log('\n1. Signal and noise of each strategy against current (per position, 24 rollouts)');
  console.log('strategy      mean adv ±se    signal sd  noise sd@24  outcome corr with current');
  for (const s of STRATEGIES.keys()) {
    if (s === CURRENT) continue;
    const some = b.pos.filter(p => p.fits.includes(s));
    const adv = some.map(p => b.advantage(p, s));
    const m = mean(adv);
    let cov = 0;
    let varHalf = 0;
    let corrXY = 0;
    let corrXX = 0;
    let corrYY = 0;
    for (const p of some) {
      const perms = b.perms[b.pos.indexOf(p)]!;
      for (const perm of perms) {
        const [h1, h2] = [perm.slice(0, 24), perm.slice(24)];
        const a1 = at(p.final[s]!, h1) - at(p.final[CURRENT]!, h1) - m;
        const a2 = at(p.final[s]!, h2) - at(p.final[CURRENT]!, h2) - m;
        cov += a1 * a2;
        varHalf += (a1 * a1 + a2 * a2) / 2;
      }
      const [x, y] = [p.final[s]!, p.final[CURRENT]!];
      const [mx, my] = [mean(x), mean(y)];
      x.forEach((v, k) => {
        corrXY += (v - mx) * (y[k]! - my);
        corrXX += (v - mx) ** 2;
        corrYY += (y[k]! - my) ** 2;
      });
    }
    const count = some.length * SPLITS;
    const signal = Math.max(0, cov / count);
    const noise = Math.max(0, varHalf / count - signal);
    console.log(
      `${STRATEGIES[s]!.padEnd(10)}${show(summary(adv, some)).padStart(16)}${pp(Math.sqrt(signal)).padStart(11)}${pp(Math.sqrt(noise)).padStart(13)}${(corrXY / Math.sqrt(corrXX * corrYY)).toFixed(2).padStart(11)}   (${some.length})`,
    );
  }
}

function fixedPolicies(b: Bench): void {
  console.log('\n2. No search: advantage of following one strategy from each position, by stage');
  console.log(`${''.padEnd(10)}${['all', ...STAGES].map(s => s.padStart(15)).join('')}`);
  for (const s of STRATEGIES.keys()) {
    if (s === CURRENT) continue;
    const cells = ['all', ...STAGES].map(stage => {
      const some = b.pos.filter(p => p.fits.includes(s) && (stage === 'all' || p.stage === stage));
      return show(
        summary(
          some.map(p => b.advantage(p, s)),
          some,
        ),
      ).padStart(15);
    });
    console.log(`${STRATEGIES[s]!.padEnd(10)}${cells.join('')}`);
  }
  schedule(b);
}

/** The strategy with the best average advantage over `current` at a stage (`current` if none is positive). */
function bestAtStage(positions: Pos[], b: Bench, stage: Stage): number {
  let best = CURRENT;
  let top = 0;
  STRATEGIES.forEach((_, s) => {
    const some = positions.filter(q => q.stage === stage && q.fits.includes(s));
    const m = s === CURRENT || !some.length ? 0 : mean(some.map(q => b.advantage(q, s)));
    if (m > top) [best, top] = [s, m];
  });
  return best;
}

/**
 * A zero-CPU rule: one strategy per game stage, fit on other games. Its whole-game value
 * telescopes: the setup choice's advantage, then at each later stage the change from the previous
 * stage's strategy. Summing per-choice advantages instead would count a lasting lean repeatedly.
 */
function schedule(b: Bench): void {
  const games = [...new Set(b.pos.map(p => p.game))];
  const foldOf = new Map(games.map((g, i) => [g, i % 5]));
  const adv = (p: Pos, s: number) => (p.fits.includes(s) ? b.advantage(p, s) : 0);
  const steps = STAGES.map((stage, k) => {
    const some = b.pos.filter(p => p.stage === stage);
    const values = some.map(p => {
      const train = b.pos.filter(q => foldOf.get(q.game) !== foldOf.get(p.game));
      const now = bestAtStage(train, b, stage);
      const before = k ? bestAtStage(train, b, STAGES[k - 1]!) : CURRENT;
      return adv(p, now) - adv(p, before);
    });
    return { stage, ...summary(values, some) };
  });
  const names = STAGES.map(stage => `${stage} ${STRATEGIES[bestAtStage(b.pos, b, stage)]}`);
  const add = (xs: typeof steps) => ({
    m: xs.reduce((n, s) => n + s.m, 0),
    se: Math.sqrt(xs.reduce((n, s) => n + s.se ** 2, 0)),
  });
  console.log(`schedule fit on all games: ${names.join(', ')}`);
  console.log(`  steps (fit on other games): ${steps.map(s => `${s.stage} ${show(s)}`).join(', ')}`);
  console.log(
    `  whole-game estimate: ${show(add(steps))} pp; without the setup step (19 positions): ${show(add(steps.slice(1)))} pp`,
  );
}

function learningCurve(b: Bench): void {
  console.log('\n3. Gain per choice by rollouts per strategy (full rollouts, best mean)');
  for (const n of [3, 6, 12, 24, 36])
    console.log(
      `  ${String(n).padStart(2)}: ${b.line(
        n,
        maxBy(p => p.final),
      )}`,
    );
}

const maxBy =
  (series: (p: Pos) => Series): Pick =>
  (p, train) =>
    bestOf(p, series(p), train);

/** Mean share of a full rollout's turns that a stop after `rounds` plays. */
function costs(results: BenchResult[]): Map<number, number> {
  return new Map(
    CUTOFFS.map(rounds => {
      const shares = results.flatMap(r =>
        r.strategies.flatMap(ts => ts?.map(t => Math.min(1, (rounds * r.players) / Math.max(1, t.turns))) ?? []),
      );
      return [rounds, mean(shares)];
    }),
  );
}

function equalCpu(b: Bench, cost: Map<number, number>): void {
  console.log('\n4. Equal CPU: every method spends the turns of B full rollouts (36 train, 12 judge)');
  console.log('method      rollouts   gain ±se      vs full ±se');
  const pool = 36;
  for (const budget of [12, 16, 24]) {
    const full = b.gains(pool, (p, t) => bestOf(p, p.final, t.slice(0, budget)));
    console.log(`B = ${budget}\n  full        ${String(budget).padStart(6)}  ${show(summary(full, b.pos))}`);
    for (const rounds of CUTOFFS) {
      const n = Math.min(pool, Math.round(budget / cost.get(rounds)!));
      const name = `w1@${rounds}`;
      const g = b.gains(pool, (p, t) => bestOf(p, p.stopped.get(name)!, t.slice(0, n)));
      const diff = g.map((x, i) => x - full[i]!);
      console.log(
        `  ${name.padEnd(10)}  ${String(n).padStart(6)}  ${show(summary(g, b.pos))}   ${show(summary(diff, b.pos))}`,
      );
    }
  }
}

/** Equal-budget successive halving: everyone gets a first look, the better half gets the rest. */
const halving =
  (perStrategy: number): Pick =>
  (p, train) => {
    const budget = perStrategy * p.fits.length;
    const first = Math.floor(perStrategy / 2);
    const look = train.slice(0, first);
    const ranked = [...p.fits].sort((x, y) => at(p.final[y]!, look) - at(p.final[x]!, look));
    const keep = ranked.slice(0, Math.ceil(p.fits.length / 2));
    if (!keep.includes(CURRENT)) keep[keep.length - 1] = CURRENT;
    const more = Math.floor((budget - first * p.fits.length) / keep.length);
    const idx = train.slice(0, Math.min(train.length, first + more));
    let best = CURRENT;
    for (const s of keep) if (at(p.final[s]!, idx) > at(p.final[best]!, idx)) best = s;
    return best;
  };

/** Picks after pulling each estimate toward what that strategy usually does at this stage. */
function shrinkRule(b: Bench): Pick {
  const games = [...new Set(b.pos.map(p => p.game))];
  const foldOf = new Map(games.map((g, i) => [g, i % 5]));
  const cache = new Map<string, { prior: number; tau: number }>();
  const priorFor = (p: Pos, s: number) => {
    const key = `${foldOf.get(p.game)}:${p.stage}:${s}`;
    let got = cache.get(key);
    if (!got) {
      const some = b.pos.filter(q => foldOf.get(q.game) !== foldOf.get(p.game) && q.fits.includes(s));
      const near = some.filter(q => q.stage === p.stage);
      const prior = mean(near.map(q => b.advantage(q, s)));
      const halves = some.map(q => {
        const perm = b.perms[b.pos.indexOf(q)]![0]!;
        const d = (idx: number[]) => at(q.final[s]!, idx) - at(q.final[CURRENT]!, idx) - prior;
        return d(perm.slice(0, 24)) * d(perm.slice(24));
      });
      got = { prior, tau: Math.max(1e-5, mean(halves)) };
      cache.set(key, got);
    }
    return got;
  };
  return (p, train) => {
    let best = CURRENT;
    let top = 0;
    for (const s of p.fits) {
      if (s === CURRENT) continue;
      const { prior, tau } = priorFor(p, s);
      const diffs = train.map(k => p.final[s]![k]! - p.final[CURRENT]![k]!);
      const m = mean(diffs);
      const noise = diffs.reduce((n, d) => n + (d - m) ** 2, 0) / Math.max(1, diffs.length - 1) / diffs.length;
      const posterior = prior + (tau / (tau + Math.max(1e-5, noise))) * (m - prior);
      if (posterior > top) [best, top] = [s, posterior];
    }
    return best;
  };
}

function rules(b: Bench): void {
  console.log('\n5. Ways to use the same rollouts (24 per strategy unless noted; gain per choice)');
  const subset = (names: string[]): Pick => {
    const allowed = names.map(n => STRATEGIES.indexOf(n as (typeof STRATEGIES)[number]));
    return (p, t) => bestOf({ ...p, fits: p.fits.filter(s => allowed.includes(s)) }, p.final, t);
  };
  const margin =
    (m: number): Pick =>
    (p, t) => {
      const s = bestOf(p, p.final, t);
      return s !== CURRENT && clearlyBetter(p.final[s]!, p.final[CURRENT]!, t, m) ? s : CURRENT;
    };
  const blend = (names: string[]): Pick => {
    const cache = new WeakMap<Pos, Series>();
    return (p, t) => {
      let s = cache.get(p);
      if (!s) {
        const parts = names.map(n => (n === 'full' ? p.final : p.stopped.get(n)!));
        s = p.final.map((row, i) => row.map((_, k) => mean(parts.map(x => x[i]![k]!))));
        cache.set(p, s);
      }
      return bestOf(p, s, t);
    };
  };
  const table: [string, number, Pick][] = [
    ['best mean (the benchmark rule)', 24, maxBy(p => p.final)],
    ['switch only if > 1 paired se', 24, margin(1)],
    ['switch only if > 2 paired se', 24, margin(2)],
    ['shrink toward stage average', 24, shrinkRule(b)],
    ['only current, cities, cards', 24, subset(['current', 'cities', 'cards'])],
    ['only current, expand, cities, cards', 24, subset(['current', 'expand', 'cities', 'cards'])],
    ['full + w1@10 averaged', 24, blend(['full', 'w1@10'])],
    ['full + w1@6 + w1@10 averaged', 24, blend(['full', 'w1@6', 'w1@10'])],
  ];
  const base = b.gains(24, table[0]![2]);
  console.log(`  ${''.padEnd(38)}gain ±se        vs best mean ±se`);
  for (const [name, n, pick] of table) {
    const g = b.gains(n, pick);
    const diff = g.map((x, i) => x - base[i]!);
    console.log(`  ${name.padEnd(38)}${show(summary(g, b.pos))}   ${show(summary(diff, b.pos))}`);
  }
  console.log('  same rollout budget, uniform vs halving (36 train, 12 judge):');
  for (const per of [12, 24]) {
    const uniform = b.gains(36, (p, t) => bestOf(p, p.final, t.slice(0, per)));
    const halved = b.gains(36, halving(per));
    const diff = halved.map((x, i) => x - uniform[i]!);
    console.log(
      `    ${per} per strategy: uniform ${show(summary(uniform, b.pos))}, halving ${show(summary(halved, b.pos))}, difference ${show(summary(diff, b.pos))}`,
    );
  }
}

/** Runs every check; see the file comment. */
export function analyzeBench(results: BenchResult[], probeFull: string, probeStopped: string): void {
  const b = new Bench(results.map(toPos));
  const cost = costs(results);
  console.log(`${b.pos.length} positions, ${new Set(b.pos.map(p => p.game)).size} games, ${SPLITS} random splits each`);
  console.log(
    `stop cost (share of full-rollout turns): ${CUTOFFS.map(r => `@${r} ${cost.get(r)!.toFixed(2)}`).join(', ')}`,
  );
  noiseReport(b);
  fixedPolicies(b);
  learningCurve(b);
  equalCpu(b, cost);
  rules(b);
  predictProbes(b, probeFull, probeStopped);
}
