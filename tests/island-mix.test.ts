import { describe, expect, it } from 'vitest';
import { parseDesign, upgradeDesign } from '../shared/maps';
import { paint } from '../shared/maps/edit';
import { fillHarbors, fillLand } from '../shared/maps/fill';
import { buildBoard, drawHarborKinds } from '../shared/maps/generate';
import { allHaveMix, setIslandMix } from '../shared/maps/land-mix';
import { islandSet } from '../shared/maps/numbers';
import { type BoardDesign, boardExpansions, type DesignHarbor, tileKey } from '../shared/maps/types';
import { seeded, testDesign } from './fixtures';

/** Six land tiles in a row of coast, with a harbor on the north side of each. */
function harborBoard(): BoardDesign {
  const design = testDesign(['~ ~ ~ ~ ~ ~ ~ ~', ' ~ L L L L L L ~', '~ ~ ~ ~ ~ ~ ~ ~'], {
    pool: { wood: 2, brick: 2, sheep: 2, wheat: 2, ore: 2, lodestone: 2 },
  });
  const land = design.tiles.filter(t => t.kind === 'land');
  const harbors: DesignHarbor[] = land.map(t => ({ q: t.q, r: t.r, side: 4, kind: 'random', notLink: 'A' }));
  return { ...design, harbors, linkRules: [{ kind: 'in', links: ['A'], terrains: ['lodestone'] }] };
}

describe('"Not A" harbors', () => {
  it('never get the resource a rule gives A, on any draw', () => {
    const design = harborBoard();
    for (let seed = 1; seed <= 200; seed++) {
      const resources = buildBoard(design, seeded(seed)).board.harbors.map(h => h.resource);
      expect(resources).toHaveLength(design.harbors.length);
      expect(resources).not.toContain('lodestone');
    }
  });

  it('a harbor that gives up the resource only passes it to a harbor allowed to hold it', () => {
    const design = harborBoard();
    // Only the first harbor may hold lodestone.
    design.harbors = design.harbors.map((h, i) => {
      if (i) return h;
      const { notLink: _n, ...free } = h;
      return free;
    });
    const free = `${design.harbors[0]!.q},${design.harbors[0]!.r},${design.harbors[0]!.side}`;
    for (let seed = 1; seed <= 200; seed++)
      for (const [key, kind] of drawHarborKinds(design, seeded(seed)))
        if (key !== free) expect(kind).not.toBe('lodestone');
  });

  it('stay random through Fill, since A can change between games', () => {
    const design = harborBoard();
    expect(fillHarbors(design, seeded(1)).harbors.every(h => h.kind === 'random' && h.notLink === 'A')).toBe(true);
    const marked = { ...design, tiles: design.tiles.map(t => (t.kind === 'land' ? { ...t, notLink: 'A' } : t)) };
    const filled = fillLand(marked, seeded(1)).tiles.filter(t => t.notLink);
    expect(filled.length).toBeGreaterThan(0);
    expect(filled.every(t => t.kind === 'land')).toBe(true);
  });
});

const TWO_ISLANDS = ['~ ~ ~ ~ ~ ~ ~ ~ ~', ' ~ L L L ~ L L L ~', '~ L L L ~ L L L ~', ' ~ ~ ~ ~ ~ ~ ~ ~ ~'];

/** Two islands of six random tiles, west first; `east` is a tile key on the eastern one. */
function twoIslands(extra: Partial<BoardDesign> = {}) {
  const design = testDesign(TWO_ISLANDS, { pool: { wood: 1, brick: 1 }, ...extra });
  const land = design.tiles.filter(t => t.kind === 'land');
  const eastTile = land.reduce((a, b) => (b.q + b.r / 2 > a.q + a.r / 2 ? b : a));
  const westTile = land.reduce((a, b) => (b.q + b.r / 2 < a.q + a.r / 2 ? b : a));
  return { design, east: tileKey(eastTile.q, eastTile.r), west: tileKey(westTile.q, westTile.r), eastTile, westTile };
}

/** The terrains drawn on the island holding `key`, and on every other island. */
function terrainsBy(design: BoardDesign, key: string, seed: number) {
  const { board } = buildBoard(design, seeded(seed));
  const at = board.hexes.find(h => tileKey(h.q, h.r) === key)!;
  const land = board.hexes.filter(h => h.island !== undefined);
  return {
    own: land.filter(h => h.island === at.island).map(h => h.terrain),
    others: land.filter(h => h.island !== at.island).map(h => h.terrain),
  };
}

describe('island land mixes', () => {
  it("keep a volcano in one island's mix on that island alone", () => {
    const { design, east } = twoIslands();
    const mixed = setIslandMix(design, new Set([east]), { pool: { ore: 3, volcano: 3 } });
    for (let seed = 1; seed <= 40; seed++) {
      const { own, others } = terrainsBy(mixed, east, seed);
      expect(own).toContain('volcano');
      expect(own.every(t => t === 'ore' || t === 'volcano')).toBe(true);
      expect(others.every(t => t === 'wood' || t === 'brick')).toBe(true);
    }
  });

  it('keep a letter linked across islands to a terrain both mixes allow', () => {
    const { design, east, eastTile, westTile } = twoIslands();
    const mixed = setIslandMix(design, new Set([east]), { pool: { wood: 1, volcano: 5 } });
    const linked = {
      ...mixed,
      tiles: mixed.tiles.map(t =>
        (t.q === eastTile.q && t.r === eastTile.r) || (t.q === westTile.q && t.r === westTile.r)
          ? { ...t, link: 'A' }
          : t,
      ),
    };
    for (let seed = 1; seed <= 40; seed++) {
      const { others } = terrainsBy(linked, east, seed);
      expect(others).not.toContain('volcano');
      const { board } = buildBoard(linked, seeded(seed));
      const terrain = (t: { q: number; r: number }) => board.hexes.find(h => h.q === t.q && h.r === t.r)!.terrain;
      expect(terrain(eastTile)).toBe('wood');
      expect(terrain(westTile)).toBe('wood');
    }
  });

  it('survive repainting or erasing the tile the mix was set from', () => {
    const { design, east, eastTile } = twoIslands();
    const mixed = setIslandMix(design, new Set([east]), { pool: { ore: 1 } });
    const painted = paint(mixed, [eastTile], 'sea');
    const other = painted.tiles.find(t => t.kind === 'land' && t.landMix)!;
    expect(terrainsBy(painted, tileKey(other.q, other.r), 1).own.every(t => t === 'ore')).toBe(true);
    expect(painted.tiles.find(t => t.q === eastTile.q && t.r === eastTile.r)!.landMix).toBeUndefined();
  });

  it('copy to other islands with their exact counts, and report when they match', () => {
    const { design, east, west } = twoIslands();
    const mix = { pool: { ore: 2, wheat: 1 }, exact: ['ore' as const] };
    const mixed = setIslandMix(design, new Set([east]), mix);
    const all = islandSet(mixed, 'all');
    expect(allHaveMix(mixed, all, mix)).toBe(false);
    const copied = setIslandMix(mixed, all, mix);
    expect(allHaveMix(copied, all, mix)).toBe(true);
    for (let seed = 1; seed <= 10; seed++) {
      const { own } = terrainsBy(copied, west, seed);
      expect(own.filter(t => t === 'ore')).toHaveLength(2);
      expect(own.filter(t => t === 'wheat')).toHaveLength(4);
    }
  });

  it('bring Cartographers when lodestone is only in an island mix', () => {
    const { design, east } = twoIslands();
    expect(boardExpansions(design)).not.toContain('cartographers');
    const mixed = setIslandMix(design, new Set([east]), { pool: { lodestone: 1 } });
    expect(boardExpansions(mixed)).toContain('cartographers');
  });

  it('pass through saving, and old boards move onto the island in each version', () => {
    const { design, east, west } = twoIslands();
    const saved = parseDesign(setIslandMix(design, new Set([east]), { pool: { ore: 2, iceberg: 5 }, exact: ['ore'] }), [
      'seafaring',
    ]);
    expect(saved.tiles.find(t => t.landMix)!.landMix).toEqual({ pool: { ore: 2 }, exact: ['ore'] });
    const version = { players: { min: 5, max: 6 }, victoryPoints: 13, tiles: design.tiles, harbors: [] };
    const old = {
      ...design,
      versions: [{ ...version, robber: null, pirate: null }],
      islandPools: { [east]: { ore: 2 } },
      exactMix: { '': ['wood'], [east]: ['ore'] },
    } as BoardDesign;
    const upgraded = upgradeDesign(old);
    expect('islandPools' in upgraded).toBe(false);
    expect(upgraded.exactMix).toEqual({ '': ['wood'] });
    for (const layout of [upgraded, upgraded.versions![0]!]) {
      const onEast = layout.tiles.filter(t => t.landMix);
      expect(onEast).toHaveLength(6);
      expect(onEast[0]!.landMix).toEqual({ pool: { ore: 2 }, exact: ['ore'] });
      expect(onEast.some(t => tileKey(t.q, t.r) === west)).toBe(false);
    }
    expect(upgradeDesign(upgraded)).toEqual(upgraded);
  });
});
