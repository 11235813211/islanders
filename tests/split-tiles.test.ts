import { describe, expect, it } from 'vitest';
import { cartographersRules } from '../shared/engine';
import { buildBoard, tileKey } from '../shared/maps';
import { paint, updateTile } from '../shared/maps/edit';
import { parseDesign } from '../shared/maps/validate';
import { isTileResource } from '../shared/types';
import { seaLobby, seeded, testDesign } from './fixtures';

/** A small island with random land, a wheat tile, and a desert; split tiles are marked per test. */
const ISLAND = testDesign(['~ ~ ~ ~ ~ ~', ' ~ L L L ~ ~', '~ L h6 L d ~', ' ~ L L L ~ ~', '~ ~ ~ ~ ~ ~']);
const wheat = ISLAND.tiles.find(t => t.kind === 'wheat')!;
const random = ISLAND.tiles.find(t => t.kind === 'land')!;
const desert = ISLAND.tiles.find(t => t.kind === 'desert')!;

describe('designed split tiles', () => {
  it('a random second side is never the tile’s own; random land under a split draws a resource', () => {
    let design = updateTile(ISLAND, wheat.q, wheat.r, { split: 'random' });
    design = updateTile(design, random.q, random.r, { split: 'random' });
    for (let seed = 1; seed <= 40; seed++) {
      const { board } = buildBoard(design, seeded(seed));
      for (const t of [wheat, random]) {
        const hex = board.hexes.find(h => tileKey(h.q, h.r) === tileKey(t.q, t.r))!;
        expect(isTileResource(hex.terrain)).toBe(true);
        expect(hex.split).toBeDefined();
        expect(hex.split).not.toBe(hex.terrain);
        expect(hex.split).not.toBe('lodestone');
      }
    }
  });

  it('a set second side is kept, and random land under it draws something else', () => {
    const design = updateTile(ISLAND, random.q, random.r, { split: 'ore' });
    for (let seed = 1; seed <= 30; seed++) {
      const hex = buildBoard(design, seeded(seed)).board.hexes.find(h => h.q === random.q && h.r === random.r)!;
      expect(hex.split).toBe('ore');
      expect(isTileResource(hex.terrain) && hex.terrain !== 'ore').toBe(true);
    }
  });

  it('only resource tiles and random land stay split; a split never needs Cartographers', () => {
    const split = updateTile(ISLAND, wheat.q, wheat.r, { split: 'sheep' });
    expect(paint(split, [wheat], 'gold').tiles.find(t => t.q === wheat.q && t.r === wheat.r)!.split).toBeUndefined();
    expect(paint(split, [wheat], 'sheep').tiles.find(t => t.q === wheat.q && t.r === wheat.r)!.split).toBeUndefined();
    expect(updateTile(ISLAND, desert.q, desert.r, { split: 'ore' }).tiles.some(t => t.split)).toBe(false);
    const parsed = parseDesign(JSON.parse(JSON.stringify(split)), [ISLAND.categoryId]);
    expect(parsed.tiles.find(t => t.kind === 'wheat')!.split).toBe('sheep');
    expect(() =>
      parseDesign({ ...split, tiles: split.tiles.map(t => (t.split ? { ...t, split: 'lodestone' } : t)) }, [
        ISLAND.categoryId,
      ]),
    ).toThrow(/second side/);
    expect(cartographersRules(seaLobby(split, 2))).toBe(false);
  });
});
