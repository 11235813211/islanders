import type { GameJob, JobResult, SeatSpec } from './jobs';
import { runJobs } from './pool';
import { drawScenario, type ScenarioFilter } from './scenarios';

/**
 * Head-to-head measurement. The hero takes one seat (or half the seats) at each table and the
 * field fills the rest; seats rotate with the seed. Seeds are shared between candidates
 * ("common random numbers"), so two candidates are compared on the very same boards and dice.
 */

export interface Score {
  games: number;
  /** Share of games a hero seat won. */
  heroWins: number;
  /** What the hero would win by seat share alone. */
  fair: number;
  /** Share of games the field won. */
  fieldWins: number;
  unfinished: number;
  /** Hero wins over fair share (1 = no better than the field). */
  edge: number;
  /** Standard error of heroWins. */
  stderr: number;
  /** Average of (hero points / target), a smoother signal than wins. */
  heroPoints: number;
  byScenario: Map<string, { games: number; wins: number; fair: number }>;
  avgMs: number;
  /** Average actions per seat per game, for hero seats and field seats. */
  heroActions: Record<string, number>;
  fieldActions: Record<string, number>;
}

/** Fitness of a result for the hero: a win counts most, points toward the target count a little. */
export function heroFitness(r: JobResult): number {
  let total = 0;
  for (const seat of r.heroSeats)
    total += (r.winner === seat ? 1 : 0) + 0.25 * Math.min(1, r.points[seat]! / r.victoryPoints);
  return total / r.heroSeats.length - r.heroSeats.length / r.players;
}

export function summarize(results: JobResult[]): Score {
  let heroWins = 0;
  let fair = 0;
  let fieldWins = 0;
  let unfinished = 0;
  let points = 0;
  let ms = 0;
  const byScenario = new Map<string, { games: number; wins: number; fair: number }>();
  const heroActions: Record<string, number> = {};
  const fieldActions: Record<string, number> = {};
  let heroSeats = 0;
  let fieldSeats = 0;
  for (const r of results) {
    r.actions.forEach((counts, seat) => {
      const hero = r.heroSeats.includes(seat);
      if (hero) heroSeats++;
      else fieldSeats++;
      for (const [k, v] of Object.entries(counts))
        (hero ? heroActions : fieldActions)[k] = ((hero ? heroActions : fieldActions)[k] ?? 0) + v;
    });
    const won = r.winner !== null && r.heroSeats.includes(r.winner);
    if (r.winner === null) unfinished++;
    else if (won) heroWins++;
    else fieldWins++;
    const share = r.heroSeats.length / r.players;
    fair += share;
    for (const s of r.heroSeats) points += Math.min(1, r.points[s]! / r.victoryPoints) / r.heroSeats.length;
    ms += r.ms;
    const key = r.scenario;
    const row = byScenario.get(key) ?? { games: 0, wins: 0, fair: 0 };
    row.games++;
    row.wins += won ? 1 : 0;
    row.fair += share;
    byScenario.set(key, row);
  }
  const n = results.length || 1;
  const p = heroWins / n;
  return {
    games: results.length,
    heroWins: p,
    fair: fair / n,
    fieldWins: fieldWins / n,
    unfinished: unfinished / n,
    edge: p / (fair / n || 1),
    stderr: Math.sqrt((p * (1 - p)) / n),
    heroPoints: points / n,
    byScenario,
    avgMs: ms / n,
    heroActions: Object.fromEntries(Object.entries(heroActions).map(([k, v]) => [k, v / (heroSeats || 1)])),
    fieldActions: Object.fromEntries(Object.entries(fieldActions).map(([k, v]) => [k, v / (fieldSeats || 1)])),
  };
}

export interface MatchOptions {
  games: number;
  firstSeed?: number;
  filter?: ScenarioFilter;
  heroes?: 1 | 'half';
  quiet?: boolean;
  /** See GameJob.mixed. */
  mixed?: boolean;
  /**
   * Play each seed once per seat, the hero moving round the table, so no seat or board favors
   * it. `games` then counts seeds.
   */
  rotate?: boolean;
}

/** The jobs for a match (see MatchOptions). */
export function matchJobs(hero: SeatSpec, field: SeatSpec[], options: MatchOptions): GameJob[] {
  const first = options.firstSeed ?? 1;
  const jobs: GameJob[] = [];
  for (let i = 0; i < options.games; i++) {
    const seed = first + i;
    const base = { seed, filter: options.filter, hero, field, heroes: options.heroes, mixed: options.mixed };
    if (!options.rotate) jobs.push(base);
    else for (let seat = 0; seat < drawScenario(seed, options.filter).players; seat++) jobs.push({ ...base, seat });
  }
  return jobs;
}

/** Play `games` games of hero against field and return the raw results. */
export async function playMatch(hero: SeatSpec, field: SeatSpec[], options: MatchOptions): Promise<JobResult[]> {
  const jobs = matchJobs(hero, field, options);
  let last = 0;
  return runJobs(jobs, done => {
    if (options.quiet || done - last < Math.max(50, jobs.length / 10)) return;
    last = done;
    process.stderr.write(`  ${done}/${jobs.length} games\r`);
  });
}

export interface Paired {
  seeds: number;
  games: number;
  /** Mean of (A's win − B's win) per seat, and its standard error across seeds. */
  winDiff: number;
  winErr: number;
  /** The same for heroFitness. */
  fitDiff: number;
  fitErr: number;
  /** Per table size: [seeds, win difference]. */
  bySize: Map<number, { seeds: number; diff: number }>;
}

/**
 * Two heroes on exactly the same games (same seeds, same seats, same field): the paired
 * difference cancels most of the luck. Errors are across seeds, since a seed's seats share a board.
 */
export function pairedDifference(a: JobResult[], b: JobResult[]): Paired {
  const perSeed = new Map<number, { win: number; fit: number; n: number; players: number }>();
  a.forEach((ra, i) => {
    const rb = b[i]!;
    if (ra.seed !== rb.seed || ra.heroSeats.join() !== rb.heroSeats.join()) throw new Error('Unpaired results.');
    const won = (r: JobResult) => (r.winner !== null && r.heroSeats.includes(r.winner) ? 1 : 0);
    const row = perSeed.get(ra.seed) ?? { win: 0, fit: 0, n: 0, players: ra.players };
    row.win += won(ra) - won(rb);
    row.fit += heroFitness(ra) - heroFitness(rb);
    row.n++;
    perSeed.set(ra.seed, row);
  });
  const rows = [...perSeed.values()].map(r => ({ win: r.win / r.n, fit: r.fit / r.n, players: r.players }));
  const meanErr = (xs: number[]) => {
    const mean = xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
    const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, xs.length - 1);
    return [mean, Math.sqrt(variance / (xs.length || 1))] as const;
  };
  const [winDiff, winErr] = meanErr(rows.map(r => r.win));
  const [fitDiff, fitErr] = meanErr(rows.map(r => r.fit));
  const bySize = new Map<number, { seeds: number; diff: number }>();
  for (const r of rows) {
    const s = bySize.get(r.players) ?? { seeds: 0, diff: 0 };
    s.seeds++;
    s.diff += r.win;
    bySize.set(r.players, s);
  }
  for (const s of bySize.values()) s.diff /= s.seeds;
  return { seeds: rows.length, games: a.length, winDiff, winErr, fitDiff, fitErr, bySize };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Print a score as a short table. */
export function report(label: string, score: Score, scenarios = false): void {
  console.log(
    `${label}: hero won ${pct(score.heroWins)} ±${pct(score.stderr)} (fair ${pct(score.fair)}, edge ×${score.edge.toFixed(2)}); ` +
      `field won ${pct(score.fieldWins)}; unfinished ${pct(score.unfinished)}; ${score.games} games, ${score.avgMs.toFixed(0)} ms/game`,
  );
  const keys = [...new Set([...Object.keys(score.heroActions), ...Object.keys(score.fieldActions)])].sort();
  console.log('  per seat per game   hero   field');
  for (const k of keys)
    console.log(
      `  ${k.padEnd(18)} ${(score.heroActions[k] ?? 0).toFixed(2).padStart(6)} ${(score.fieldActions[k] ?? 0).toFixed(2).padStart(7)}`,
    );
  if (!scenarios) return;
  const rows = [...score.byScenario.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, row] of rows)
    console.log(
      `  ${name.padEnd(24)} ${String(row.games).padStart(5)} games  hero ${pct(row.wins / row.games).padStart(6)}  fair ${pct(row.fair / row.games).padStart(6)}`,
    );
}
