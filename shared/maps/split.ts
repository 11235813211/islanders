import { shuffled } from '../board';
import { CLASSIC_RESOURCES, type ClassicResource, isTileResource, type Terrain, type TileResource } from '../types';
import { type DesignKind, type DesignTile, tileKey } from './types';

/**
 * Split tiles a map designer placed: a tile that pays its own resource or a second one, chosen
 * card by card like gold. The second side is random (never the tile's own) or set. These play
 * without Cartographers; Cartographers' own split action makes the same kind of tile mid-game.
 */

/** Tiles that may be split: random land (drawn as a resource) or a resource terrain. */
export const canSplit = (kind: DesignKind) => kind === 'land' || isTileResource(kind);

/** The tile's split if it still makes sense (a splittable tile whose set second side differs from its own). */
export function keptSplit(tile: DesignTile): DesignTile {
  if (!tile.split) return tile;
  if (canSplit(tile.kind) && tile.split !== tile.kind) return tile;
  const { split: _s, ...rest } = tile;
  return rest;
}

/**
 * Give each split tile its two sides, after random land is drawn (`terrains`, changed in place).
 * Random land under a split must draw a resource unlike a set second side: it trades terrains with
 * another single random tile that drew one, so the board's mix stays as drawn.
 */
export function resolveSplits(
  tiles: readonly DesignTile[],
  terrains: Map<string, Terrain>,
  random: () => number,
): Map<string, TileResource> {
  const sides = new Map<string, TileResource>();
  const partners = tiles.filter(t => t.kind === 'land' && !t.link && !t.notLink && !t.split);
  const pick = (but: string[]) =>
    shuffled(
      CLASSIC_RESOURCES.filter(r => !but.includes(r)),
      random,
    )[0]!;
  for (const tile of tiles) {
    if (!tile.split || !canSplit(tile.kind)) continue;
    const key = tileKey(tile.q, tile.r);
    const set: ClassicResource | null = tile.split === 'random' ? null : tile.split;
    const fits = (terrain: Terrain | undefined) => !!terrain && isTileResource(terrain) && terrain !== set;
    if (!fits(terrains.get(key)) && tile.kind === 'land' && !tile.link) {
      const partner = shuffled(partners, random).find(p => fits(terrains.get(tileKey(p.q, p.r))));
      if (partner) {
        const other = tileKey(partner.q, partner.r);
        const mine = terrains.get(key)!;
        terrains.set(key, terrains.get(other)!);
        terrains.set(other, mine);
      }
    }
    // No partner to trade with, or a linked group that drew no resource: any resource will do.
    const drawn = terrains.get(key);
    if (!drawn || !isTileResource(drawn)) terrains.set(key, pick(set ? [set] : []));
    // A linked tile that drew the set side gets a random other side instead.
    const own = terrains.get(key)!;
    sides.set(key, set && set !== own ? set : pick([own]));
  }
  return sides;
}
