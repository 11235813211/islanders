import { readFileSync } from 'node:fs';
import { selectorInput } from '../shared/bots/advanced/selector';
import { STRATEGIES } from '../shared/bots/advanced/strategy';
import {
  at,
  type Bench,
  bestOf,
  CURRENT,
  clearlyBetter,
  mean,
  type Pos,
  pp,
  rng,
  type Series,
  STAGES,
  type Stage,
  show,
  stageOf,
} from './bench-core';
import type { StrategyChoice } from './strategy-search';

/**
 * Checks the benchmark against the strategy probes' real games, and whether a cheap selector can
 * use the probes' labels (analysis/2026-11-17-bench-offline.md).
 */

interface ProbeGame {
  seed: number;
  winner: number;
  heroSeats: number[];
  choices?: StrategyChoice[];
}

const loadProbe = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as ProbeGame[];

/** Per game, how many choices were made in each stage while holding each strategy. */
function heldCounts(games: ProbeGame[]): Map<Stage, number[]> {
  const out = new Map<Stage, number[]>(STAGES.map(s => [s, STRATEGIES.map(() => 0)]));
  for (const g of games) {
    let held = CURRENT;
    for (const c of g.choices ?? []) {
      out.get(stageOf(c.phase, c.leaderPoints))![held]! += 1 / games.length;
      held = STRATEGIES.indexOf(c.chosen);
    }
  }
  return out;
}

/**
 * The game-level gain the benchmark predicts for a probe. Value telescopes over choices: each
 * choice adds Q(pick, held to the end) − Q(previously held strategy, held to the end). Measuring
 * every choice against `current` instead counts a lasting lean again at every choice.
 */
function predictProbe(b: Bench, name: string, series: (p: Pos) => Series, games: ProbeGame[]): void {
  const counts = heldCounts(games);
  const perPos = b.pos.map((p, i) => {
    const s = series(p);
    return STRATEGIES.map((_, held) => {
      if (!p.fits.includes(held)) return null;
      return mean(
        b.perms[i]!.map(perm => {
          const [train, test] = [perm.slice(0, 24), perm.slice(24)];
          let chosen = bestOf(p, s, train, held);
          if (chosen !== held && !clearlyBetter(s[chosen]!, s[held]!, train, 1)) chosen = held;
          return at(p.final[chosen]!, test) - at(p.final[held]!, test);
        }),
      );
    });
  });
  const total = (rows: number[]) => {
    let sum = 0;
    for (const stage of STAGES)
      counts.get(stage)!.forEach((count, held) => {
        const xs = rows.filter(i => b.pos[i]!.stage === stage && perPos[i]![held] !== null);
        if (count && xs.length) sum += count * mean(xs.map(i => perPos[i]![held]!));
      });
    return sum;
  };
  const gameIds = [...new Set(b.pos.map(p => p.game))];
  const rowsOf = new Map(gameIds.map(g => [g, b.pos.flatMap((p, i) => (p.game === g ? [i] : []))]));
  const random = rng(99);
  const boots = Array.from({ length: 400 }, () =>
    total(gameIds.flatMap(() => rowsOf.get(gameIds[Math.floor(random() * gameIds.length)]!)!)),
  );
  const m = mean(boots);
  const se = Math.sqrt(mean(boots.map(x => (x - m) ** 2)));
  const perGame = [...counts.values()].flat().reduce((n, x) => n + x, 0);
  const wins = games.filter(g => g.heroSeats.includes(g.winner)).length;
  console.log(
    `  ${name.padEnd(22)}predicted ${pp(total(b.pos.map((_, i) => i)))} ±${pp(se).trim()} pp per game (${perGame.toFixed(1)} choices); measured ${pp(wins / games.length - 1 / 3)} pp (${wins}/${games.length} wins)`,
  );
}

/** Solves (XᵀX + λI)w = Xᵀy by elimination. */
function ridge(x: number[][], y: number[], lambda: number): number[] {
  const d = x[0]!.length;
  const a = Array.from({ length: d }, (_, i) => {
    const row = new Array<number>(d + 1).fill(0);
    row[i] = lambda;
    return row;
  });
  x.forEach((r, n) => {
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) a[i]![j]! += r[i]! * r[j]!;
      a[i]![d]! += r[i]! * y[n]!;
    }
  });
  for (let c = 0; c < d; c++) {
    let top = c;
    for (let r = c + 1; r < d; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[top]![c]!)) top = r;
    [a[c], a[top]] = [a[top]!, a[c]!];
    for (let r = 0; r < d; r++) {
      if (r === c) continue;
      const f = a[r]![c]! / a[c]![c]!;
      for (let k = c; k <= d; k++) a[r]![k]! -= f * a[c]![k]!;
    }
  }
  return a.map((row, i) => row[d]! / row[i]!);
}

/** Cross-fitted selector check on a probe: value of its picks, on labels it never saw. */
function selectorCheck(name: string, games: ProbeGame[]): void {
  console.log(`  ${name}`);
  const rows = games.flatMap(g =>
    (g.choices ?? []).map(c => ({ seed: g.seed, x: selectorInput(c.features, c.goals ?? []), scores: c.scores })),
  );
  const seeds = [...new Set(rows.map(r => r.seed))];
  const foldOf = new Map(seeds.map((s, i) => [s, i % 5]));
  const width = rows[0]!.x.length;
  const score = (lambda: number | null) => {
    const value = new Array<number>(rows.length).fill(0);
    for (let fold = 0; fold < 5; fold++) {
      const train = rows.filter(r => foldOf.get(r.seed) !== fold);
      const mu = Array.from({ length: width }, (_, j) => mean(train.map(r => r.x[j]!)));
      const sd = mu.map((m, j) => Math.sqrt(mean(train.map(r => (r.x[j]! - m) ** 2))) || 1);
      const encode = (x: number[]) => [1, ...x.map((v, j) => (v - mu[j]!) / sd[j]!)];
      const models = STRATEGIES.map((_, s) => {
        const some = train.filter(r => s !== CURRENT && r.scores[s] != null);
        if (!some.length) return null;
        const y = some.map(r => r.scores[s]! - r.scores[CURRENT]!);
        if (lambda === null) return [mean(y), ...new Array<number>(width).fill(0)];
        return ridge(
          some.map(r => encode(r.x)),
          y,
          lambda,
        );
      });
      rows.forEach((r, i) => {
        if (foldOf.get(r.seed) !== fold) return;
        const z = encode(r.x);
        let best = CURRENT;
        let top = 0;
        models.forEach((w, s) => {
          if (!w || r.scores[s] == null) return;
          const p = w.reduce((n, c, j) => n + c * z[j]!, 0);
          if (p > top) [best, top] = [s, p];
        });
        value[i] = r.scores[best]! - r.scores[CURRENT]!;
      });
    }
    const m = mean(value);
    const bySeed = new Map<number, number>();
    value.forEach((v, i) => {
      bySeed.set(rows[i]!.seed, (bySeed.get(rows[i]!.seed) ?? 0) + v - m);
    });
    const se = Math.sqrt([...bySeed.values()].reduce((n, x) => n + x * x, 0)) / value.length;
    return { m, se };
  };
  console.log(`    ${rows.length} choices, ${width} inputs; gain per choice over current (on that probe's labels):`);
  console.log(`    constant per strategy  ${show(score(null))}`);
  for (const lambda of [300, 1000, 3000, 10000])
    console.log(`    ridge λ=${String(lambda).padEnd(14)}${show(score(lambda))}`);
}

/** Sections 6 and 7: the benchmark against both probes' games, then the selector check. */
export function predictProbes(b: Bench, fullFile: string, stoppedFile: string): void {
  const [full, stopped] = [loadProbe(fullFile), loadProbe(stoppedFile)];
  console.log('\n6. Does the benchmark predict the probes? (switching rule and held strategies as in each probe)');
  predictProbe(b, 'v3 full rollouts', p => p.final, full);
  predictProbe(b, 'v4 stopped w1@6', p => p.stopped.get('w1@6')!, stopped);
  console.log('\n7. Can a linear selector use the probe labels? (5 folds by seed, 24-rollout labels)');
  selectorCheck('v3: full-rollout labels, seat summaries only (v3 saved no goal inputs)', full);
  selectorCheck('v4: stopped w1@6 labels, seat summaries + planner goal inputs', stopped);
}
