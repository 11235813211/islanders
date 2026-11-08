import { describe, expect, it } from 'vitest';
import {
  autoHarbors,
  BASE_POOL,
  type BoardDesign,
  BUILTIN_BOARDS,
  BUILTIN_CATEGORIES,
  buildBoard,
  mergeLibrary,
  parseCategories,
  parseDesign,
} from '../shared/maps';
import { apportion, balancedNumbers, pips } from '../shared/maps/balance';
import { parseGrid } from '../shared/maps/builtin';
import { isProducing } from '../shared/seafaring';
import { seeded } from './fixtures';

const design = (rows: string[], extra: Partial<BoardDesign> = {}): BoardDesign => ({
  id: 'test',
  name: 'Test',
  categoryId: 'seafaring',
  description: '',
  players: { min: 3, max: 4 },
  victoryPoints: 13,
  ...parseGrid(rows),
  harbors: [],
  pool: { ...BASE_POOL },
  harborExclude: [],
  updatedAt: 0,
  ...extra,
});

describe('balanced draws', () => {
  it('apportions by weight, counting what is already fixed', () => {
    const weights = new Map([
      ['any', 4],
      ['wheat', 1],
      ['ore', 1],
    ]);
    const draw = apportion(4, weights, new Map([['wheat', 2]]), seeded());
    expect(draw).toHaveLength(4);
    expect(draw.filter(k => k === 'wheat')).toHaveLength(0);
    expect(draw.filter(k => k === 'any').length).toBeGreaterThanOrEqual(3);
  });

  it('numbers keep the base mix, separate reds, and avoid hot corners', () => {
    const cells = parseGrid(['~ L ~ L ~', ' L L L L', 'L L L L L', ' L L L L', '~ L L L ~']).tiles.filter(
      t => t.kind === 'land',
    );
    for (let seed = 1; seed < 20; seed++) {
      const numbers = balancedNumbers(
        cells.map(c => ({ ...c, terrain: 'wood' })),
        new Map(),
        seeded(seed),
      );
      const list = [...numbers.values()].sort((a, b) => a - b);
      expect(list).toHaveLength(18);
      expect(list.filter(n => n === 6 || n === 8)).toHaveLength(4);
      expect(list).not.toContain(7);
      const red = [...numbers].filter(([, n]) => n === 6 || n === 8).map(([k]) => k.split(',').map(Number));
      for (const [q1, r1] of red)
        for (const [q2, r2] of red) {
          const d = Math.max(Math.abs(q1! - q2!), Math.abs(r1! - r2!), Math.abs(q1! + r1! - q2! - r2!));
          expect(d === 0 || d > 1).toBe(true);
        }
      expect(list.reduce((n, x) => n + pips(x), 0)).toBeGreaterThan(40);
    }
  });
});

describe('designed boards', () => {
  it('fills random land with the base mix and leaves fixed tiles alone', () => {
    const d = design(['~ ~ ~ ~ ~ ~', ' ~ L L L ~ ~', '~ L L L L ~', ' ~ L L L g ~', '~ ~ ~ ~ ~ ~']);
    const { board } = buildBoard(d, seeded(3));
    expect(board.hexes.filter(h => h.terrain === 'gold')).toHaveLength(1);
    expect(board.hexes.filter(h => h.terrain === 'sea').length).toBe(d.tiles.filter(t => t.kind === 'sea').length);
    for (const hex of board.hexes) expect(hex.number !== null).toBe(isProducing(hex.terrain));
  });

  it('gives linked tiles and harbors the same resource', () => {
    const d = design(['~ ~ ~ ~ ~', ' ~ L L L ~', '~ L L L L ~', ' ~ ~ ~ ~ ~']);
    d.tiles = d.tiles.map((t, i) => (t.kind === 'land' && i % 2 ? { ...t, link: 'A' } : t));
    d.harbors = autoHarbors(d.tiles, 3).map(h => ({ ...h, link: 'A' }));
    for (let seed = 1; seed < 10; seed++) {
      const { board } = buildBoard(d, seeded(seed));
      const linked = d.tiles.filter(t => t.link).map(t => board.hexes.find(h => h.q === t.q && h.r === t.r)!.terrain);
      expect(new Set(linked).size).toBe(1);
      expect(board.harbors.every(h => h.resource === linked[0])).toBe(true);
    }
  });

  it('respects harbor exclusions and counts fixed harbors in the balance', () => {
    const d = design(BUILTIN_BOARDS[0]!.tiles.length ? [] : []);
    Object.assign(d, structuredClone(BUILTIN_BOARDS[0]!));
    d.harbors = d.harbors.map((h, i) => ({ ...h, kind: i < 2 ? 'wheat' : 'random' }));
    d.harborExclude = ['wheat'];
    for (let seed = 1; seed < 10; seed++) {
      const { board } = buildBoard(d, seeded(seed));
      expect(board.harbors.filter(h => h.resource === 'wheat')).toHaveLength(2);
    }
  });

  it('numbers islands, spreads island flags, and finds starts', () => {
    const d = design(['~ ~ ~ ~ ~ ~ ~', ' ~ L L ~ L*! ~', '~ L L ~ ~ L ~', ' ~ ~ ~@ ~ ~ ~ ~']);
    const { board, pirate } = buildBoard(d, seeded());
    const islands = new Set(board.hexes.filter(h => h.island).map(h => h.island));
    expect(islands.size).toBe(2);
    const outer = board.hexes.filter(h => h.noSetup);
    expect(outer).toHaveLength(2);
    expect(new Set(outer.map(h => h.island)).size).toBe(1);
    expect(board.hexes.find(h => h.id === pirate)?.terrain).toBe('sea');
  });

  it.each(BUILTIN_BOARDS.map(b => [b.id, b] as const))('built-in %s builds and validates', (_, board) => {
    for (let seed = 1; seed < 6; seed++) {
      const built = buildBoard(board, seeded(seed));
      expect(built.board.harbors.length).toBeGreaterThan(5);
      expect(built.pirate).not.toBeNull();
      const land = built.board.hexes.filter(h => h.island !== undefined);
      expect(land.length).toBeGreaterThan(15);
      expect(land.filter(h => !h.noSetup).length).toBeGreaterThanOrEqual(12);
    }
    expect(
      parseDesign(
        structuredClone(board),
        BUILTIN_CATEGORIES.map(c => c.id),
      ),
    ).toMatchObject({ id: board.id });
  });
});

describe('library', () => {
  it('starts from the built-ins and adds new built-ins to a stored library', () => {
    const fresh = mergeLibrary(undefined);
    expect(fresh.boards.map(b => b.id)).toEqual(BUILTIN_BOARDS.map(b => b.id));
    const stored = { ...fresh, boards: fresh.boards.slice(1), knownBuiltins: fresh.knownBuiltins.slice(0, 3) };
    const merged = mergeLibrary(stored);
    expect(merged.boards.map(b => b.id)).not.toContain(BUILTIN_BOARDS[0]!.id);
    expect(merged.boards).toHaveLength(BUILTIN_BOARDS.length - 1);
  });

  it('rejects bad designs and categories', () => {
    const ids = ['seafaring'];
    const good = structuredClone(BUILTIN_BOARDS[0]!);
    expect(() => parseDesign({ ...good, tiles: [] }, ids)).toThrow(/tiles/);
    expect(() => parseDesign({ ...good, name: '<b>' }, ids)).toThrow();
    expect(() => parseDesign({ ...good, tiles: [{ q: 0, r: 0, kind: 'land', number: 7 }] }, ids)).toThrow(/7/);
    expect(() => parseDesign({ ...good, categoryId: 'nope' }, ids)).toThrow(/category/);
    expect(() => parseCategories([{ id: 'a', name: 'A', color: 'red' }])).toThrow(/colors/);
    expect(parseCategories([{ id: 'a', name: ' A ', color: '#AABBCC' }])).toEqual([
      { id: 'a', name: 'A', color: '#aabbcc' },
    ]);
  });
});
