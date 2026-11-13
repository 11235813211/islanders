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

/**
 * Swap each number with its equal-odds partner (2↔12, 3↔11, 4↔10, 5↔9, 6↔8) so that each pair
 * splits evenly, as in the base set; with an odd count the extra goes either way at random.
 */
export function swapEqualOdds(numbers: Map<string, number>, random: () => number): Map<string, number> {
  const byOdds = new Map<number, string[]>();
  for (const [k, n] of numbers) byOdds.set(pips(n), [...(byOdds.get(pips(n)) ?? []), k]);
  const swapped = new Map<string, number>();
  for (const [odds, keys] of byOdds) {
    const [low, high] = [odds + 1, 13 - odds];
    const lows = Math.floor(keys.length / 2) + (keys.length % 2 && random() < 0.5 ? 1 : 0);
    shuffled(keys, random).forEach((k, i) => {
      swapped.set(k, i < lows ? low : high);
    });
  }
  return swapped;
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

/**
 * How lopsided a numbering is: hot corners, touching reds, repeated neighbors, and terrains whose
 * average strays from the others' (the caller passes cells that share one number level).
 */
function numberingCost(cells: NumberCell[], numbers: Map<string, number>): number {
  let cost = 0;
  const corners = new Map<string, number>();
  const byTerrain = new Map<string, number[]>();
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
    byTerrain.set(cell.terrain, [...(byTerrain.get(cell.terrain) ?? []), pips(n)]);
  }
  for (const total of corners.values()) if (total > 11) cost += (total - 11) ** 2 * 2;
  const averages = [...byTerrain.values()].map(dots => dots.reduce((a, b) => a + b, 0) / dots.length);
  const mean = averages.reduce((a, b) => a + b, 0) / Math.max(1, averages.length);
  for (const average of averages) cost += (average - mean) ** 2 * 2;
  return cost;
}

/**
 * A producing cell to number. `pips` limits a random number to these dot counts (1–5); `level`
 * (-NUMBER_LEVELS to NUMBER_LEVELS) shifts its mix toward the edges or toward 6 and 8.
 */
export interface NumberCell extends Cell {
  terrain: string;
  pips?: number[];
  level?: number;
}

/** Steps each way a number level goes: -3 is only 2, 3, 11 and 12; 3 is only 6 and 8. */
export const NUMBER_LEVELS = 3;

const allowedSet = (noEnds: boolean) => (noEnds ? NUMBER_SET.filter(n => pips(n) > 1) : NUMBER_SET);

/**
 * Number weights: the base mix (without 2 and 12 when `noEnds`), shifted by `level` toward 6 and 8
 * (or toward 2, 3, 11 and 12); at ±NUMBER_LEVELS it is only those.
 */
export function numberMix(level: number, noEnds: boolean): Map<number, number> {
  const set = allowedSet(noEnds);
  const shift = Math.min(1, Math.abs(level) / NUMBER_LEVELS);
  const toward = level > 0 ? [6, 8] : set.filter(n => pips(n) <= 2);
  const weights = new Map<number, number>();
  for (const n of set) weights.set(n, (weights.get(n) ?? 0) + (1 - shift) / set.length);
  for (const n of toward) weights.set(n, (weights.get(n) ?? 0) + shift / toward.length);
  return weights;
}

/** A random number for one tile with no neighbors to balance against (an iceberg). */
export function randomNumber(random: () => number, noEnds = false): number {
  const set = allowedSet(noEnds);
  return set[Math.floor(random() * set.length)]!;
}

/**
 * Place `pool` on `cells` (mutating `numbers`): cells with a dot limit first, then reds apart from
 * other reds, then the rest avoiding equal neighbors. A limited cell the pool can't serve gets a
 * fitting number in place of one from the pool, so the count stays the same.
 */
function placeNumbers(cells: NumberCell[], pool: number[], numbers: Map<string, number>, random: () => number): void {
  const left = shuffled(pool, random);
  const near = (cell: Cell) => neighborKeys(cell).map(k => numbers.get(k));
  const take = (n: number) => {
    const i = left.indexOf(n);
    left.splice(i >= 0 ? i : left.length - 1, 1);
  };
  const limited = shuffled(
    cells.filter(c => c.pips?.length),
    random,
  ).sort((a, b) => a.pips!.length - b.pips!.length);
  for (const cell of limited) {
    const fits = (n: number) => cell.pips!.includes(pips(n));
    const around = near(cell);
    const choice =
      left.find(n => fits(n) && !around.includes(n) && !(isRed(n) && around.some(m => isRed(m ?? 0)))) ??
      left.find(fits) ??
      shuffled(NUMBER_SET.filter(fits), random)[0];
    if (choice === undefined) continue;
    numbers.set(key(cell.q, cell.r), choice);
    take(choice);
  }
  const free = shuffled(
    cells.filter(c => !numbers.has(key(c.q, c.r))),
    random,
  );
  const nearRed = (cell: Cell) => near(cell).some(m => isRed(m ?? 0));
  for (const red of left.filter(isRed)) {
    const spot =
      free.find(c => !numbers.has(key(c.q, c.r)) && !nearRed(c)) ?? free.find(c => !numbers.has(key(c.q, c.r)));
    if (!spot) break;
    numbers.set(key(spot.q, spot.r), red);
    take(red);
  }
  for (const cell of free) {
    const k = key(cell.q, cell.r);
    if (numbers.has(k) || !left.length) continue;
    const around = near(cell);
    const index = Math.max(
      0,
      left.findIndex(n => !around.includes(n)),
    );
    numbers.set(k, left.splice(index, 1)[0]!);
  }
}

/**
 * Numbers for the open producing cells, keeping the base game's mix (counting `fixed` numbers
 * already on the board) and choosing the most even of several tries. Cells with a `level` draw
 * from their own mix (one per level), so the rest of the board keeps its full share of reds.
 * With `noTwoTwelve`, no random number is a 2 or 12.
 */
export function balancedNumbers(
  producing: NumberCell[],
  fixed: Map<string, number>,
  random: () => number,
  { tries = 30, noTwoTwelve = false }: { tries?: number; noTwoTwelve?: boolean } = {},
): Map<string, number> {
  const levelOf = (c: NumberCell) => c.level ?? 0;
  const levels = [...new Set(producing.map(levelOf))].sort((a, b) => a - b);
  const groups = levels.map(level => {
    const cells = producing.filter(c => levelOf(c) === level);
    const open = cells.filter(c => !fixed.has(key(c.q, c.r)));
    const fixedCounts = new Map<number, number>();
    for (const c of cells) {
      const n = fixed.get(key(c.q, c.r));
      if (n !== undefined) fixedCounts.set(n, (fixedCounts.get(n) ?? 0) + 1);
    }
    return { cells, open, pool: apportion(open.length, numberMix(level, noTwoTwelve), fixedCounts, random) };
  });
  let best: { cost: number; numbers: Map<string, number> } | null = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    const numbers = new Map(fixed);
    for (const { open, pool } of groups) placeNumbers(open, pool, numbers, random);
    const cost = groups.reduce((sum, { cells }) => sum + numberingCost(cells, numbers), 0);
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
