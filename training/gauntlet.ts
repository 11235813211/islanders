import { readFileSync } from 'node:fs';
import { promotedHistory, SHIPPED, seatFor } from './checkpoints';
import { type MatchOptions, pairedDifference, playMatch, summarize } from './evaluate';
import type { JobResult, SeatSpec } from './jobs';
import type { ScenarioFilter } from './scenarios';

/**
 * The gauntlet (training/PLAN.md): one hero against every kind of opponent, so a change only
 * counts if it is no worse against any of them. With a baseline, both play the very same games
 * and each row gets a paired difference.
 */

interface Opponent {
  name: string;
  field: string[];
  weight: number;
  /** One of each at the table, starting at a seed-chosen member. */
  mixed?: boolean;
}

/** Every opponent, with how much it counts toward the total. */
export function opponents(): Opponent[] {
  const source: string = JSON.parse(readFileSync(SHIPPED, 'utf8')).source ?? '';
  const previous = promotedHistory()
    .filter(n => n !== source)
    .slice(-2);
  const styles = ['trader', 'hoarder', 'cards', 'builder'];
  return [
    { name: 'intermediate', field: ['intermediate'], weight: 2 },
    { name: 'beginner', field: ['beginner'], weight: 0.5 },
    { name: 'shipped', field: ['shipped'], weight: 2 },
    ...previous.map(n => ({ name: n, field: [n], weight: 1 })),
    ...styles.map(s => ({ name: `style:${s}`, field: [`style:${s}`], weight: 0.5 })),
    {
      name: 'mixed',
      field: ['intermediate', 'shipped', 'beginner', ...styles.map(s => `style:${s}`)],
      weight: 3,
      mixed: true,
    },
  ];
}

export interface GauntletOptions {
  hero: SeatSpec;
  baseline?: SeatSpec;
  /** Seeds per opponent over all scenarios, and on the base island at four players. */
  games: number;
  baseGames: number;
  firstSeed: number;
  /** Restrict the "all" scenarios (e.g. --maps). */
  filter?: ScenarioFilter;
  only?: string[];
}

interface Cell {
  edge: number;
  win: number;
  fair: number;
  diff?: number;
  err?: number;
}

const BASE4: ScenarioFilter = { maps: ['base'], players: [4] };

async function cell(o: Opponent, options: GauntletOptions, filter: ScenarioFilter | undefined, games: number) {
  const field = o.field.map(seatFor);
  const match: MatchOptions = {
    games,
    firstSeed: options.firstSeed,
    filter,
    rotate: true,
    quiet: true,
    mixed: o.mixed,
  };
  const hero = await playMatch(options.hero, field, match);
  const s = summarize(hero);
  const out: Cell = { edge: s.edge, win: s.heroWins, fair: s.fair };
  if (options.baseline) {
    const base: JobResult[] = await playMatch(options.baseline, field, match);
    const p = pairedDifference(hero, base);
    out.diff = p.winDiff;
    out.err = p.winErr;
  }
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const signed = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

function cellText(c: Cell): string {
  const own = `${pct(c.win).padStart(6)} ×${c.edge.toFixed(2)}`;
  if (c.diff === undefined || c.err === undefined) return own.padEnd(16);
  const mark = c.diff < -2 * c.err ? ' ▼' : c.diff > 2 * c.err ? ' ▲' : '  ';
  return `${own} ${signed(c.diff).padStart(6)} ±${pct(c.err)}${mark}`.padEnd(34);
}

/** Weighted mean and its standard error (rows independent: each opponent plays its own games). */
function total(rows: { weight: number; c: Cell }[], key: 'edge' | 'diff'): string {
  const w = rows.reduce((s, r) => s + r.weight, 0);
  const mean = rows.reduce((s, r) => s + r.weight * (r.c[key] ?? 0), 0) / w;
  if (key === 'edge') return `×${mean.toFixed(3)}`;
  const err = Math.sqrt(rows.reduce((s, r) => s + (r.weight * (r.c.err ?? 0)) ** 2, 0)) / w;
  return `${signed(mean)} ±${pct(err)}`;
}

/** Play the gauntlet and print one row per opponent, then the weighted totals. */
export async function runGauntlet(options: GauntletOptions): Promise<void> {
  const list = opponents().filter(o => !options.only || options.only.includes(o.name));
  const rows: { name: string; weight: number; all: Cell; base: Cell }[] = [];
  console.log(`${'opponent'.padEnd(16)} ${'all scenarios'.padEnd(34)} base island, 4 players`);
  for (const o of list) {
    const started = Date.now();
    const all = await cell(o, options, options.filter, options.games);
    const base = await cell(o, options, BASE4, options.baseGames);
    rows.push({ name: o.name, weight: o.weight, all, base });
    console.log(
      `${o.name.padEnd(16)} ${cellText(all)} ${cellText(base)} (${((Date.now() - started) / 1000).toFixed(0)} s)`,
    );
  }
  const allRows = rows.map(r => ({ weight: r.weight, c: r.all }));
  const baseRows = rows.map(r => ({ weight: r.weight, c: r.base }));
  console.log(`weighted edge: all ${total(allRows, 'edge')}, base/4 ${total(baseRows, 'edge')}`);
  if (options.baseline)
    console.log(`weighted difference: all ${total(allRows, 'diff')}, base/4 ${total(baseRows, 'diff')}`);
}
