import { NUMBER_LEVELS, neighborKeys } from './balance';
import { closedTiles, isLand, islandOf } from './edit';
import {
  BASE_POOL,
  type BoardDesign,
  type DesignTile,
  type FillKind,
  FOG_POOL,
  NUMBER_KINDS,
  type NumberLevels,
  tileKey,
} from './types';

/**
 * Number levels: how rich random numbers are on each island, per terrain. Every tile of an island
 * carries the island's levels; when islands join, the first tile with levels speaks for the island.
 */

/** Every island of the layout, as its land tiles, in tile order. */
export function islandsOf(design: BoardDesign): DesignTile[][] {
  const seen = new Set<string>();
  const islands: DesignTile[][] = [];
  for (const tile of design.tiles) {
    if (!isLand(tile.kind) || seen.has(tileKey(tile.q, tile.r))) continue;
    const island = islandOf(design, tile.q, tile.r);
    for (const t of island) seen.add(tileKey(t.q, t.r));
    islands.push(island);
  }
  return islands;
}

/** The fog tiles joined to the fog tile at (q, r): one fog island, whose hidden land shares its levels. */
export function fogIslandOf(design: BoardDesign, q: number, r: number): DesignTile[] {
  const byKey = new Map(design.tiles.filter(t => t.kind === 'fog').map(t => [tileKey(t.q, t.r), t]));
  const start = byKey.get(tileKey(q, r));
  if (!start) return [];
  const found = new Map([[tileKey(q, r), start]]);
  const queue = [start];
  while (queue.length) {
    for (const key of neighborKeys(queue.pop()!)) {
      const next = byKey.get(key);
      if (next && !found.has(key)) {
        found.set(key, next);
        queue.push(next);
      }
    }
  }
  return [...found.values()];
}

/** Every fog island of the layout, in tile order. */
export function fogIslandsOf(design: BoardDesign): DesignTile[][] {
  const seen = new Set<string>();
  const islands: DesignTile[][] = [];
  for (const tile of design.tiles) {
    if (tile.kind !== 'fog' || seen.has(tileKey(tile.q, tile.r))) continue;
    const island = fogIslandOf(design, tile.q, tile.r);
    for (const t of island) seen.add(tileKey(t.q, t.r));
    islands.push(island);
  }
  return islands;
}

/** The land island or fog island holding the tile at (q, r), or [] for sea and icebergs. */
export const regionOf = (design: BoardDesign, q: number, r: number): DesignTile[] => {
  const land = islandOf(design, q, r);
  return land.length ? land : fogIslandOf(design, q, r);
};

/** Land islands and fog islands: everything that carries number levels. */
const regionsOf = (design: BoardDesign) => [...islandsOf(design), ...fogIslandsOf(design)];

/** The levels an island's random numbers follow. */
export const islandLevels = (island: DesignTile[]): NumberLevels =>
  island.find(t => t.numberLevels)?.numberLevels ?? {};

/** Each land tile's number level for a terrain, as the number balancer takes it. */
export function numberLeanings(design: BoardDesign): (q: number, r: number, terrain: string) => { level?: number } {
  const levels = new Map<string, NumberLevels>();
  for (const island of islandsOf(design)) {
    const own = islandLevels(island);
    for (const t of island) levels.set(tileKey(t.q, t.r), own);
  }
  return (q, r, terrain) => ({ level: levels.get(tileKey(q, r))?.[terrain as FillKind] || undefined });
}

/** Levels clamped to range with zeros dropped, or undefined when all are the usual mix. */
export function cleanLevels(levels: NumberLevels): NumberLevels | undefined {
  const kept = NUMBER_KINDS.flatMap(k => {
    const v = Math.max(-NUMBER_LEVELS, Math.min(NUMBER_LEVELS, Math.round(levels[k] ?? 0)));
    return v ? [[k, v] as const] : [];
  });
  return kept.length ? Object.fromEntries(kept) : undefined;
}

/** Whether two sets of levels lean the same way on every terrain. */
export const sameLevels = (a: NumberLevels, b: NumberLevels) => NUMBER_KINDS.every(k => (a[k] ?? 0) === (b[k] ?? 0));

/** Give the islands holding `keys` these levels (every one of their tiles). */
export function setIslandLevels(design: BoardDesign, keys: Set<string>, levels: NumberLevels): BoardDesign {
  const members = new Set<string>();
  for (const island of regionsOf(design))
    if (island.some(t => keys.has(tileKey(t.q, t.r)))) for (const t of island) members.add(tileKey(t.q, t.r));
  const cleaned = cleanLevels(levels);
  return {
    ...design,
    tiles: design.tiles.map(t => {
      if (!members.has(tileKey(t.q, t.r))) return t;
      const { numberLevels: _old, ...rest } = t;
      return cleaned ? { ...rest, numberLevels: { ...cleaned } } : rest;
    }),
  };
}

/** Terrains that will get a random number on this island: unnumbered tiles, and what its random land may become. */
export function randomTerrains(design: BoardDesign, island: DesignTile[]): FillKind[] {
  if (island[0]?.kind === 'fog') {
    const pool = design.fogPool ?? FOG_POOL;
    return NUMBER_KINDS.filter(k => ((pool as Partial<Record<string, number>>)[k] ?? 0) > 0);
  }
  const open = island.filter(t => t.number === undefined);
  const kinds = new Set<string>(open.map(t => t.kind));
  if (kinds.has('land')) {
    const anchor = island.find(t => design.islandPools?.[tileKey(t.q, t.r)]);
    const pool = anchor ? design.islandPools![tileKey(anchor.q, anchor.r)]! : design.pool;
    const mix = Object.values(pool ?? {}).some(w => (w ?? 0) > 0) ? pool : BASE_POOL;
    for (const [k, w] of Object.entries(mix)) if ((w ?? 0) > 0) kinds.add(k);
  }
  return NUMBER_KINDS.filter(k => kinds.has(k));
}

/** Land tile keys of all islands, those closed to starting settlements, or those open to them; or every fog tile. */
export function islandSet(design: BoardDesign, which: 'all' | 'closed' | 'open' | 'fog'): Set<string> {
  if (which === 'fog') return new Set(design.tiles.filter(t => t.kind === 'fog').map(t => tileKey(t.q, t.r)));
  const land = design.tiles.filter(t => isLand(t.kind)).map(t => tileKey(t.q, t.r));
  if (which === 'all') return new Set(land);
  const closed = closedTiles(design);
  return new Set(land.filter(k => closed.has(k) === (which === 'closed')));
}

type OldProfile = { level?: number; bias?: NumberLevels };
type OldDesign = BoardDesign & {
  richIslands?: number;
  numberBias?: NumberLevels;
  numbers?: OldProfile;
  numberGroups?: Record<string, OldProfile>;
};
type OldTile = DesignTile & { rich?: number; numberGroup?: string };

/** An old overall level (-4 to 4, where 4 was nearly all 6 and 8) on the 3-step scale. */
const oldLevel = (level: number) => Math.sign(level) * Math.round((Math.abs(level) * NUMBER_LEVELS) / 4);

/**
 * Boards saved before each island had its own number levels: richer closed islands
 * (`richIslands`, then each tile's `rich`), board-wide terrain bias (`numberBias`), and shared
 * profiles (`numbers`, `numberGroups`) all become levels on the tiles they applied to.
 */
export function upgradeDesign(design: BoardDesign): BoardDesign {
  const { richIslands, numberBias, numbers, numberGroups, ...rest } = design as OldDesign;
  const layouts = [design, ...(design.versions ?? [])];
  const oldTiles = layouts.some(l => l.tiles.some(t => 'rich' in t || 'numberGroup' in t));
  if (!oldTiles && [richIslands, numberBias, numbers, numberGroups].every(v => v === undefined)) return design;
  const upgrade = <T extends { tiles: DesignTile[] }>(layout: T): T => {
    const closed = richIslands ? closedTiles({ ...rest, tiles: layout.tiles }) : new Set<string>();
    const tiles = layout.tiles.map(old => {
      const { rich, numberGroup, ...tile } = old as OldTile;
      if (!isLand(tile.kind) || tile.numberLevels) return tile;
      const profile = (numberGroup && numberGroups?.[numberGroup]) || numbers || {};
      const level = (profile.level ?? 0) + (rich ?? (closed.has(tileKey(tile.q, tile.r)) ? (richIslands ?? 0) : 0));
      const levels = cleanLevels(
        Object.fromEntries(
          NUMBER_KINDS.map(k => [k, oldLevel(level) + (profile.bias?.[k] ?? 0) + (numberBias?.[k] ?? 0)]),
        ),
      );
      return levels ? { ...tile, numberLevels: levels } : tile;
    });
    return { ...layout, tiles };
  };
  return { ...upgrade(rest), ...(rest.versions ? { versions: rest.versions.map(upgrade) } : {}) };
}
