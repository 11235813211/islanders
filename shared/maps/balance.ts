import { hexCenter, hexCorner, shuffled } from '../board';

/**
 * Balanced random choices for designed boards. Every draw counts what the editor
 * already fixed, so a board with two fixed wheat harbors rarely gets a third.
 */

/** Dice combinations (out of 36) that roll `n`. */
export const pips = (n: number) => 6 - Math.abs(7 - n);
/** The base game's 18 number tokens. Random numbers keep these proportions. */
export const NUMBER_SET = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const isRed = (n: number) => n === 6 || n === 8;

/**
 * `total` picks spread over the weighted kinds so that, together with the `fixed` ones
 * already placed, each kind lands near its share. Largest remainder, ties broken at random.
 */
export function apportion<K>(total: number, weights: Map<K, number>, fixed: Map<K, number>, random: () => number): K[] {
  const kinds = [...weights].filter(([, w]) => w > 0).map(([k]) => k);
  if (!total || !kinds.length) return [];
  const weightSum = kinds.reduce((n, k) => n + weights.get(k)!, 0);
  const all = total + kinds.reduce((n, k) => n + (fixed.get(k) ?? 0), 0);
  let need = kinds.map(k => Math.max(0, (all * weights.get(k)!) / weightSum - (fixed.get(k) ?? 0)));
  if (need.reduce((a, b) => a + b, 0) <= 0) need = kinds.map(k => weights.get(k)!);
  const scale = total / need.reduce((a, b) => a + b, 0);
  const shares = need.map((n, i) => ({ kind: kinds[i]!, exact: n * scale, tie: random() }));
  const counts = shares.map(s => Math.floor(s.exact));
  let left = total - counts.reduce((a, b) => a + b, 0);
  const order = shares
    .map((s, i) => ({ i, frac: s.exact - Math.floor(s.exact), tie: s.tie }))
    .sort((a, b) => b.frac - a.frac || b.tie - a.tie);
  for (const { i } of order) {
    if (left <= 0) break;
    counts[i]!++;
    left--;
  }
  return shares.flatMap((s, i) => Array<K>(counts[i]!).fill(s.kind));
}

export interface Cell {
  q: number;
  r: number;
}
const key = (q: number, r: number) => `${q},${r}`;
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
] as const;

/** Keys of the up-to-six cells around (q, r). */
export const neighborKeys = (cell: Cell) => NEIGHBORS.map(([dq, dr]) => key(cell.q + dq, cell.r + dr));

/** Corner keys of a cell, matching shared corners between neighbors. */
function cornerKeys(cell: Cell): string[] {
  const { x, y } = hexCenter(cell.q, cell.r);
  return Array.from({ length: 6 }, (_, c) => {
    const p = hexCorner(x, y, c);
    return `${Math.round(p.x)},${Math.round(p.y)}`;
  });
}

/** How lopsided a numbering is: hot corners, touching reds, repeated neighbors, uneven resources. */
function numberingCost(cells: (Cell & { terrain: string })[], numbers: Map<string, number>): number {
  let cost = 0;
  const corners = new Map<string, number>();
  const byResource = new Map<string, number[]>();
  for (const cell of cells) {
    const n = numbers.get(key(cell.q, cell.r));
    if (n === undefined) continue;
    for (const corner of cornerKeys(cell)) corners.set(corner, (corners.get(corner) ?? 0) + pips(n));
    for (const other of neighborKeys(cell)) {
      const m = numbers.get(other);
      if (m === undefined) continue;
      if (isRed(n) && isRed(m)) cost += 40;
      else if (m === n) cost += 3;
    }
    byResource.set(cell.terrain, [...(byResource.get(cell.terrain) ?? []), pips(n)]);
  }
  for (const total of corners.values()) if (total > 11) cost += (total - 11) ** 2 * 2;
  const averages = [...byResource.values()].map(list => list.reduce((a, b) => a + b, 0) / list.length);
  const mean = averages.reduce((a, b) => a + b, 0) / Math.max(1, averages.length);
  for (const a of averages) cost += (a - mean) ** 2;
  return cost;
}

/**
 * Numbers for the `open` producing cells, keeping the base game's mix (counting `fixed`
 * numbers already on the board) and choosing the most even of several tries.
 */
export function balancedNumbers(
  producing: (Cell & { terrain: string })[],
  fixed: Map<string, number>,
  random: () => number,
  tries = 30,
): Map<string, number> {
  const open = producing.filter(c => !fixed.has(key(c.q, c.r)));
  const weights = new Map<number, number>();
  for (const n of NUMBER_SET) weights.set(n, (weights.get(n) ?? 0) + 1);
  const fixedCounts = new Map<number, number>();
  for (const n of fixed.values()) fixedCounts.set(n, (fixedCounts.get(n) ?? 0) + 1);
  const pool = apportion(open.length, weights, fixedCounts, random);
  let best: { cost: number; numbers: Map<string, number> } | null = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    const numbers = new Map(fixed);
    const cells = shuffled(open, random);
    const reds = pool.filter(isRed);
    const others = shuffled(
      pool.filter(n => !isRed(n)),
      random,
    );
    // Reds first, never touching another red when there is room for that.
    const nearRed = (cell: Cell) => neighborKeys(cell).some(k => isRed(numbers.get(k) ?? 0));
    for (const red of reds) {
      const spot =
        cells.find(c => !numbers.has(key(c.q, c.r)) && !nearRed(c)) ?? cells.find(c => !numbers.has(key(c.q, c.r)));
      if (spot) numbers.set(key(spot.q, spot.r), red);
    }
    for (const cell of cells) {
      const k = key(cell.q, cell.r);
      if (numbers.has(k)) continue;
      const near = neighborKeys(cell).map(n => numbers.get(n));
      const index = Math.max(
        0,
        others.findIndex(n => !near.includes(n)),
      );
      numbers.set(k, others.splice(index, 1)[0]!);
    }
    const cost = numberingCost(producing, numbers);
    if (!best || cost < best.cost) best = { cost, numbers };
  }
  return best?.numbers ?? new Map(fixed);
}

/** Same-kind neighbors among the given cells: lower is better spread. */
export function clumping(cells: Map<string, Cell & { kind: string }>): number {
  let cost = 0;
  for (const cell of cells.values())
    for (const k of neighborKeys(cell)) {
      const other = cells.get(k);
      if (!other) continue;
      if (other.kind === cell.kind) cost += cell.kind === 'gold' || cell.kind === 'volcano' ? 3 : 1;
    }
  return cost;
}
