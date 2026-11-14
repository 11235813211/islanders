import { neighborKeys } from './balance';
import { type BoardDesign, type DesignTile, FOG_POOL, type FogKind, type FogMix, tileKey } from './types';

/**
 * Fog islands: joined fog tiles. Each fog island hides tiles drawn from its own mix, which every
 * one of its tiles carries (`fogMix`); when fog islands join, the first tile with a mix speaks.
 */

/** The mix a fog island with no mix of its own draws from: the Fog Islands stack. */
export const DEFAULT_FOG_MIX: FogMix = { pool: FOG_POOL };

/** The fog tiles joined to the fog tile at (q, r): one fog island. */
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

/** What a fog island may hide. */
export const fogMixOf = (island: DesignTile[]): FogMix => island.find(t => t.fogMix)?.fogMix ?? DEFAULT_FOG_MIX;

/** The kinds a mix lists with a positive share or count. */
export const fogKinds = (mix: FogMix): [FogKind, number][] =>
  (Object.entries(mix.pool) as [FogKind, number][]).filter(([, n]) => (n ?? 0) > 0);

/** How many tiles exact counts list. */
export const listedCount = (mix: FogMix) => fogKinds(mix).reduce((n, [, c]) => n + Math.round(c), 0);

/** Whether two mixes hide the same things the same way. */
export function sameFogMix(a: FogMix, b: FogMix): boolean {
  const kinds = new Set([...Object.keys(a.pool), ...Object.keys(b.pool)]) as Set<FogKind>;
  return !!a.exact === !!b.exact && [...kinds].every(k => (a.pool[k] ?? 0) === (b.pool[k] ?? 0));
}

/** Give the fog islands holding `keys` this mix (every one of their tiles). */
export function setFogMix(design: BoardDesign, keys: Set<string>, mix: FogMix): BoardDesign {
  const members = new Set<string>();
  for (const island of fogIslandsOf(design))
    if (island.some(t => keys.has(tileKey(t.q, t.r)))) for (const t of island) members.add(tileKey(t.q, t.r));
  const pool = Object.fromEntries(fogKinds(mix));
  const stored: FogMix = mix.exact ? { pool, exact: true } : { pool };
  return {
    ...design,
    tiles: design.tiles.map(t => (members.has(tileKey(t.q, t.r)) ? { ...t, fogMix: stored } : t)),
  };
}

/** Whether the fog tile at (q, r) may turn out to be sea. */
export const fogMayBeSea = (design: BoardDesign, q: number, r: number) =>
  (fogMixOf(fogIslandOf(design, q, r)).pool.sea ?? 0) > 0;

/** Whether any fog on the layout may turn out to be a volcano. */
export const fogMayErupt = (design: BoardDesign) =>
  fogIslandsOf(design).some(island => (fogMixOf(island).pool.volcano ?? 0) > 0);

/** The share of all fog tiles expected to turn out to be producing land (neither sea nor desert). */
export function fogLandShare(design: BoardDesign): number {
  const islands = fogIslandsOf(design);
  const total = islands.reduce((n, island) => n + island.length, 0);
  if (!total) return 0;
  const expected = islands.reduce((n, island) => {
    const kinds = fogKinds(fogMixOf(island));
    const sum = kinds.reduce((s, [, c]) => s + c, 0);
    const land = kinds.reduce((s, [k, c]) => s + (k === 'sea' || k === 'desert' ? 0 : c), 0);
    return n + (sum ? (island.length * land) / sum : 0);
  }, 0);
  return expected / total;
}

/** How a fog island's exact counts deal out: they fill it, fall short (the rest drawn from the mix), or overflow. */
export function exactFit(island: DesignTile[], mix: FogMix): 'exact' | 'short' | 'over' | null {
  if (!mix.exact) return null;
  const listed = listedCount(mix);
  return listed === island.length ? 'exact' : listed < island.length ? 'short' : 'over';
}

/** Warnings for fog islands whose exact counts don't match their size. */
export function fogWarnings(design: BoardDesign): string[] {
  const islands = fogIslandsOf(design);
  return islands.flatMap(island => {
    const mix = fogMixOf(island);
    const fit = exactFit(island, mix);
    if (!fit || fit === 'exact') return [];
    const where = islands.length > 1 ? 'A fog island' : 'The fog';
    return [
      `${where} lists ${listedCount(mix)} tiles but has ${island.length}; ${fit === 'over' ? 'some are left out' : 'the rest are drawn from the mix'}.`,
    ];
  });
}

type OldLayout = { tiles: DesignTile[]; fogPool?: FogMix['pool']; fogExact?: boolean };

/**
 * Boards saved when each layout had one fog mix (`fogPool`, `fogExact`): every fog tile without a
 * mix of its own gets its layout's (a version without one used the board's).
 */
export function upgradeFog<T extends BoardDesign>(design: T): T {
  const old = design as T & OldLayout & { versions?: OldLayout[] };
  const layouts: OldLayout[] = [old, ...(old.versions ?? [])];
  if (layouts.every(l => !('fogPool' in l) && !('fogExact' in l))) return design;
  const upgrade = <L extends OldLayout>(layout: L): L => {
    const { fogPool: own, fogExact: ownExact, ...rest } = layout;
    const pool = own ?? old.fogPool;
    const exact = ownExact ?? old.fogExact;
    const mix: FogMix | null =
      pool || exact ? { pool: { ...(pool ?? FOG_POOL) }, ...(exact ? { exact: true } : {}) } : null;
    const tiles = rest.tiles.map(t => (t.kind === 'fog' && mix && !t.fogMix ? { ...t, fogMix: mix } : t));
    return { ...rest, tiles } as unknown as L;
  };
  const base = upgrade(old);
  return { ...base, ...(old.versions ? { versions: old.versions.map(upgrade) } : {}) } as T;
}
