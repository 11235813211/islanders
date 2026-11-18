import { isLand, islandOf } from './edit';
import type { BoardDesign, DesignTile, FillKind, LandMix, Pool } from './types';
import { tileKey } from './types';

/**
 * Island land mixes: what an island's random land is drawn from instead of the board's mix. Every
 * tile of the island carries the mix (`landMix`), so it survives repainting any one tile and each
 * board version keeps its own; when islands join, the first tile with a mix speaks for them.
 */

/** The island's own mix, if it has one. */
export const landMixOf = (island: DesignTile[]): LandMix | undefined => island.find(t => t.landMix)?.landMix;

/** A mix's terrains without icebergs, which are drawn on the sea for the whole board. */
export function islandPool(pool: Pool): Pool {
  const { iceberg: _sea, ...land } = pool;
  return land;
}

/** Whether two mixes give the same shares and the same exact counts. */
export function sameLandMix(a: LandMix, b: LandMix): boolean {
  const kinds = new Set([...Object.keys(a.pool), ...Object.keys(b.pool)]) as Set<FillKind>;
  const exactA = new Set(a.exact ?? []);
  const exactB = new Set(b.exact ?? []);
  return (
    [...kinds].every(k => (a.pool[k] ?? 0) === (b.pool[k] ?? 0)) &&
    exactA.size === exactB.size &&
    [...exactA].every(k => exactB.has(k))
  );
}

/** The islands holding any of these tile keys, each once. */
function islandsAt(design: BoardDesign, keys: Set<string>): DesignTile[][] {
  const seen = new Set<string>();
  const islands: DesignTile[][] = [];
  for (const tile of design.tiles) {
    const key = tileKey(tile.q, tile.r);
    if (!keys.has(key) || seen.has(key) || !isLand(tile.kind)) continue;
    const island = islandOf(design, tile.q, tile.r);
    for (const t of island) seen.add(tileKey(t.q, t.r));
    islands.push(island);
  }
  return islands;
}

/** Whether every island holding these keys already has this mix. */
export function allHaveMix(design: BoardDesign, keys: Set<string>, mix: LandMix): boolean {
  const islands = islandsAt(design, keys);
  return islands.length > 0 && islands.every(island => !!landMixOf(island) && sameLandMix(landMixOf(island)!, mix));
}

/** Give the islands holding `keys` this mix on every tile, or back to the board's mix with null. */
export function setIslandMix(design: BoardDesign, keys: Set<string>, mix: LandMix | null): BoardDesign {
  const members = new Set(islandsAt(design, keys).flatMap(island => island.map(t => tileKey(t.q, t.r))));
  const kept: LandMix | null = mix && { pool: islandPool(mix.pool), ...exactField(mix.exact) };
  return {
    ...design,
    tiles: design.tiles.map(t => {
      if (!members.has(tileKey(t.q, t.r))) return t;
      const { landMix: _old, ...rest } = t;
      return kept ? { ...rest, landMix: kept } : rest;
    }),
  };
}

/** `exact` for a stored mix: left out when no terrain is an exact count. */
function exactField(exact: FillKind[] | undefined): Pick<LandMix, 'exact'> {
  return exact?.length ? { exact } : {};
}

type OldDesign = BoardDesign & { islandPools?: Record<string, Pool> };

/**
 * Boards saved when one tile held each island's mix for every version (`islandPools`, with exact
 * counts under that tile's key in `exactMix`): each layout's island at that tile gets the mix.
 */
export function upgradeIslandMixes(saved: BoardDesign): BoardDesign {
  const { islandPools, ...design } = saved as OldDesign;
  const exactMix = design.exactMix ?? {};
  if (!islandPools && Object.keys(exactMix).every(key => key === '')) return saved;
  const give = (layout: BoardDesign): DesignTile[] => {
    let next = layout;
    for (const [key, pool] of Object.entries(islandPools ?? {})) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      const island = islandOf(next, q, r);
      if (island.length && !landMixOf(island))
        next = setIslandMix(next, new Set([key]), { pool, exact: exactMix[key] });
    }
    return next.tiles;
  };
  const { exactMix: _old, ...base } = design;
  const board = exactMix[''];
  return {
    ...base,
    ...(board ? { exactMix: { '': board } } : {}),
    tiles: give(design),
    ...(design.versions ? { versions: design.versions.map(v => ({ ...v, tiles: give({ ...design, ...v }) })) } : {}),
  };
}
