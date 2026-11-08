import { describe, expect, it } from 'vitest';
import { hexCenter } from '../shared/board';
import { BUILTIN_CATEGORIES, buildBoard, parseDesign } from '../shared/maps';
import {
  cellAt,
  designWarnings,
  harborEdge,
  islandOf,
  newDesign,
  nextLink,
  paint,
  setIslandBonus,
  setIslandClosed,
  sideAt,
  stepNumber,
  toggleHarbor,
  updateTile,
} from '../shared/maps/edit';
import {
  clearNumbers,
  fillHarbors,
  fillLand,
  fillNumbers,
  setLinks,
  unfillHarbors,
  unfillLand,
} from '../shared/maps/fill';
import { seeded } from './fixtures';

const blank = () => newDesign('blank', 'b', 'seafaring', 'Blank');
const base = () => newDesign('base', 'b', 'seafaring', 'Base');
const at = (d: ReturnType<typeof blank>, q: number, r: number) => d.tiles.find(t => t.q === q && t.r === r);

describe('editor geometry', () => {
  it('finds the cell and side under a point', () => {
    for (const [q, r] of [
      [0, 0],
      [2, -1],
      [-3, 2],
    ] as const) {
      const c = hexCenter(q, r);
      expect(cellAt(c.x + 10, c.y - 12)).toEqual({ q, r });
      // A point just inside side 0 (toward the lower-right neighbor).
      expect(sideAt(q, r, c.x + 25, c.y + 43)).toBe(0);
      expect(sideAt(q, r, c.x + 50, c.y)).toBe(5);
    }
  });
});

describe('editing', () => {
  it('starts blank with one sea tile, or base with 19 land in a ring of sea and nine harbors', () => {
    expect(blank().tiles).toEqual([{ q: 0, r: 0, kind: 'sea' }]);
    const d = base();
    expect(d.tiles.filter(t => t.kind === 'land')).toHaveLength(19);
    expect(d.tiles.filter(t => t.kind === 'sea')).toHaveLength(18);
    expect(d.harbors).toHaveLength(9);
    expect(
      parseDesign(
        d,
        BUILTIN_CATEGORIES.map(c => c.id),
      ).tiles,
    ).toHaveLength(37);
  });

  it('dragging grows sea only into empty cells; shift-style paint makes land; erase deletes', () => {
    let d = paint(
      blank(),
      [
        { q: 1, r: 0 },
        { q: 2, r: 0 },
      ],
      'sea-new',
    );
    expect(d.tiles).toHaveLength(3);
    d = paint(d, [{ q: 1, r: 0 }], 'land');
    d = paint(d, [{ q: 1, r: 0 }], 'sea-new');
    expect(at(d, 1, 0)?.kind).toBe('land');
    d = paint(d, [{ q: 0, r: 0 }], 'gold');
    expect(at(d, 0, 0)?.kind).toBe('gold');
    d = paint(d, [{ q: 2, r: 0 }], 'erase');
    expect(at(d, 2, 0)).toBeUndefined();
  });

  it('numbers step through the tokens and wrap back to random', () => {
    expect(stepNumber(undefined, 1)).toBe(2);
    expect(stepNumber(6, 1)).toBe(8);
    expect(stepNumber(12, 1)).toBeUndefined();
    expect(stepNumber(undefined, -1)).toBe(12);
    let d = paint(blank(), [{ q: 0, r: 0 }], 'land');
    d = updateTile(d, 0, 0, { number: 9 });
    d = paint(d, [{ q: 0, r: 0 }], 'desert');
    expect(at(d, 0, 0)?.number).toBeUndefined();
  });

  it('island flags and bonuses cover the connected land', () => {
    let d = paint(
      blank(),
      [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 3, r: 0 },
      ],
      'land',
    );
    d = paint(d, [{ q: 2, r: 0 }], 'sea');
    expect(islandOf(d, 0, 0)).toHaveLength(2);
    d = setIslandClosed(d, 1, 0, true);
    expect(at(d, 0, 0)?.noSetup).toBe(true);
    expect(at(d, 3, 0)?.noSetup).toBeUndefined();
    d = setIslandBonus(d, 0, 0, 2);
    d = setIslandBonus(d, 1, 0, 1);
    expect(at(d, 0, 0)?.bonus).toBeUndefined();
    expect(at(d, 1, 0)?.bonus).toBe(1);
  });

  it('harbors go on the land side of a coast edge and toggle off', () => {
    let d = paint(blank(), [{ q: 0, r: 0 }], 'land');
    d = paint(d, [{ q: 1, r: 0 }], 'sea');
    // Clicked from the sea tile, facing the land (side 2 points left).
    expect(harborEdge(d, 1, 0, 2)).toEqual({ q: 0, r: 0, side: 5 });
    d = toggleHarbor(d, 1, 0, 2);
    expect(d.harbors).toEqual([{ q: 0, r: 0, side: 5, kind: 'random' }]);
    d = toggleHarbor(d, 0, 0, 5);
    expect(d.harbors).toEqual([]);
    // Turning the land into sea removes harbors that no longer face land.
    d = toggleHarbor(d, 0, 0, 5);
    d = paint(d, [{ q: 0, r: 0 }], 'sea');
    expect(d.harbors).toEqual([]);
  });

  it('fills land and numbers with a balanced draw, and clears numbers back to random', () => {
    const d = base();
    const land = fillLand(d, seeded(4));
    expect(land.tiles.some(t => t.kind === 'land')).toBe(false);
    expect(land.tiles.filter(t => t.kind === 'desert')).toHaveLength(1);
    const numbered = fillNumbers(land, seeded(4));
    expect(numbered.tiles.filter(t => t.number !== undefined)).toHaveLength(18);
    expect(clearNumbers(numbered).tiles.some(t => t.number !== undefined)).toBe(false);
    // Fixed numbers stay when the board is drawn for a game.
    const built = buildBoard(numbered, seeded(9)).board;
    for (const t of numbered.tiles.filter(t => t.number))
      expect(built.hexes.find(h => h.q === t.q && h.r === t.r)?.number).toBe(t.number);
  });

  it('suggests the next free link letter and warns about unplayable boards', () => {
    let d = base();
    expect(nextLink(d)).toBe('A');
    d = updateTile(d, 0, 0, { link: 'A' });
    expect(nextLink(d)).toBe('B');
    expect(designWarnings(base())).toEqual([]);
    expect(designWarnings(blank())[0]).toMatch(/land/);
  });
});

describe('repeatable fills', () => {
  it('places harbors in a new spread each time and fills their kinds with a balanced draw', async () => {
    const { placeHarbors, harborTarget } = await import('../shared/maps/fill');
    const d = { ...newDesign('base', 'b', 'seafaring', 'Base'), harbors: [] };
    const spreads = new Set(
      [1, 2, 3, 4, 5].map(seed => JSON.stringify(placeHarbors(d, seeded(seed)).harbors.map(h => [h.q, h.r, h.side]))),
    );
    expect(spreads.size).toBeGreaterThan(1);
    const placed = placeHarbors(d, seeded(1));
    expect(placed.harbors).toHaveLength(harborTarget(d));
    const filled = fillHarbors(placed, seeded(2));
    expect(filled.harbors.every(h => h.kind !== 'random')).toBe(true);
    expect(filled.harbors.filter(h => h.kind === 'any').length).toBeGreaterThanOrEqual(3);
  });

  it('accepts terrain shares in tenths', () => {
    const d = { ...newDesign('base', 'b', 'seafaring', 'Base'), pool: { wood: 2.5, gold: 0.3 } };
    expect(parseDesign(d, ['seafaring']).pool).toEqual({ wood: 2.5, gold: 0.3 });
    expect(() => parseDesign({ ...d, pool: { wood: 2.55 } }, ['seafaring'])).toThrow(/0.1/);
  });
});

describe('links, unfills, and number swaps', () => {
  it('only random pieces are linked: linking makes them random, setting a kind drops the link', () => {
    let d = fillLand(base(), seeded(1));
    d = fillHarbors(d, seeded(2));
    const [h] = d.harbors;
    d = setLinks(d, [{ q: 0, r: 0 }], [h!], 'A');
    expect(d.tiles.find(t => t.q === 0 && t.r === 0)).toMatchObject({ kind: 'land', link: 'A' });
    expect(d.harbors[0]).toMatchObject({ kind: 'random', link: 'A' });
    d = updateTile(d, 0, 0, { kind: 'ore' });
    expect(d.tiles.find(t => t.q === 0 && t.r === 0)!.link).toBeUndefined();
    d = paint(setLinks(d, [{ q: 0, r: 0 }], [], 'B'), [{ q: 0, r: 0 }], 'wheat');
    expect(d.tiles.find(t => t.q === 0 && t.r === 0)!.link).toBeUndefined();
    // Fills leave linked pieces random, and stored designs drop links on set pieces.
    d = setLinks(d, [{ q: 1, r: 0 }], [], 'C');
    expect(fillLand(d, seeded(3)).tiles.find(t => t.q === 1 && t.r === 0)!.kind).toBe('land');
    const stored = { ...d, tiles: d.tiles.map(t => (t.q === 1 && t.r === 0 ? { ...t, kind: 'ore' as const } : t)) };
    expect(parseDesign(stored, ['seafaring']).tiles.find(t => t.q === 1 && t.r === 0)!.link).toBeUndefined();
    expect(setLinks(d, [{ q: 1, r: 0 }], [], null).tiles.find(t => t.q === 1 && t.r === 0)!.link).toBeUndefined();
  });

  it('unfills land and harbor kinds, keeping numbers and harbor spots', () => {
    const filled = fillHarbors(fillNumbers(fillLand(base(), seeded(1)), seeded(2)), seeded(3));
    const land = unfillLand(filled);
    expect(land.tiles.filter(t => t.kind !== 'sea').every(t => t.kind === 'land')).toBe(true);
    expect(land.tiles.map(t => t.number)).toEqual(filled.tiles.map(t => t.number));
    const harbors = unfillHarbors(filled);
    expect(harbors.harbors.every(h => h.kind === 'random')).toBe(true);
    expect(harbors.harbors.map(h => h.side)).toEqual(filled.harbors.map(h => h.side));
    expect(clearNumbers(filled).tiles.every(t => t.number === undefined)).toBe(true);
  });

  it('random harbors only give the allowed kinds', () => {
    const d = { ...base(), harborExclude: ['any', 'wood', 'brick', 'sheep', 'wheat'] as const };
    const built = buildBoard({ ...d, harborExclude: [...d.harborExclude] }, seeded(4)).board;
    expect(built.harbors.every(h => h.resource === 'ore')).toBe(true);
  });

  it('swapping equal-odds numbers keeps each pair split evenly and the reds red', () => {
    const fixed = fillNumbers(fillLand(base(), seeded(6)), seeded(5));
    const swap = { ...fixed, swapNumbers: true };
    const layouts = new Set<string>();
    for (let seed = 1; seed < 12; seed++) {
      const numbers = buildBoard(swap, seeded(seed))
        .board.hexes.map(h => h.number)
        .filter((n): n is number => n !== null);
      layouts.add(numbers.join());
      const count = (n: number) => numbers.filter(x => x === n).length;
      for (const [a, b] of [
        [2, 12],
        [3, 11],
        [4, 10],
        [5, 9],
        [6, 8],
      ] as const)
        expect(Math.abs(count(a) - count(b))).toBeLessThanOrEqual(1);
      for (const t of fixed.tiles.filter(t => t.number === 6 || t.number === 8)) {
        const n = buildBoard(swap, seeded(seed)).board.hexes.find(h => h.q === t.q && h.r === t.r)!.number;
        expect([6, 8]).toContain(n);
      }
    }
    expect(layouts.size).toBeGreaterThan(1);
    expect(parseDesign(swap, ['seafaring']).swapNumbers).toBe(true);
  });
});
