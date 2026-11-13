import { BIAS_LEVELS, NUMBER_LEVELS } from './balance';
import { closedTiles, isLand, islandOf } from './edit';
import type { BoardDesign, DesignTile, FillKind, NumberProfile } from './types';
import { tileKey } from './types';

/**
 * Number profiles: how random numbers lean on each island. Islands follow the board's profile
 * (`numbers`) unless one of their tiles names a group (`numberGroup`); every island naming the
 * same group shares its profile, so changing it changes them all.
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

/** The group an island follows: the lowest one named on its tiles that exists, or null for the board's. */
function groupOfIsland(design: BoardDesign, island: DesignTile[]): string | null {
  const named = island.map(t => t.numberGroup).filter((g): g is string => !!g && !!design.numberGroups?.[g]);
  return named.sort((a, b) => Number(a) - Number(b))[0] ?? null;
}

/** The group (or null: the board's profile) each land tile's island follows, by tile key. */
export function islandGroups(design: BoardDesign): Map<string, string | null> {
  const groups = new Map<string, string | null>();
  for (const island of islandsOf(design)) {
    const group = groupOfIsland(design, island);
    for (const t of island) groups.set(tileKey(t.q, t.r), group);
  }
  return groups;
}

/** How many islands follow each group (null: the board's profile). */
export function followers(design: BoardDesign): Map<string | null, number> {
  const counts = new Map<string | null, number>();
  for (const island of islandsOf(design)) {
    const group = groupOfIsland(design, island);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return counts;
}

/** The profile a group (or null: the board) holds. */
export const profileOf = (design: BoardDesign, group: string | null): NumberProfile =>
  (group ? design.numberGroups?.[group] : design.numbers) ?? {};

/** Each land tile's number level and its terrain's bias, as the number balancer takes them. */
export function numberLeanings(
  design: BoardDesign,
): (q: number, r: number, terrain: string) => { level?: number; bias?: number } {
  const groups = islandGroups(design);
  return (q, r, terrain) => {
    const profile = profileOf(design, groups.get(tileKey(q, r)) ?? null);
    return { level: profile.level || undefined, bias: profile.bias?.[terrain as FillKind] || undefined };
  };
}

/** A profile with zero levels dropped, or undefined when nothing is left. */
function clean(profile: NumberProfile): NumberProfile | undefined {
  const level = Math.max(-NUMBER_LEVELS, Math.min(NUMBER_LEVELS, Math.round(profile.level ?? 0)));
  const bias = Object.fromEntries(
    Object.entries(profile.bias ?? {})
      .map(([k, v]) => [k, Math.max(-BIAS_LEVELS, Math.min(BIAS_LEVELS, Math.round(v ?? 0)))])
      .filter(([, v]) => v),
  ) as NumberProfile['bias'];
  const out: NumberProfile = {
    ...(level ? { level } : {}),
    ...(Object.keys(bias ?? {}).length ? { bias } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

/** Replace a group's (or with null, the board's) profile. A group is kept even when its profile is all normal. */
export function setProfile(design: BoardDesign, group: string | null, profile: NumberProfile): BoardDesign {
  const cleaned = clean(profile);
  if (group) return { ...design, numberGroups: { ...design.numberGroups, [group]: cleaned ?? {} } };
  const { numbers: _old, ...rest } = design;
  return cleaned ? { ...rest, numbers: cleaned } : rest;
}

/** Make the islands holding `keys` follow `group` (null: the board's profile). */
export function assignGroup(design: BoardDesign, keys: Set<string>, group: string | null): BoardDesign {
  const members = new Set<string>();
  for (const island of islandsOf(design))
    if (island.some(t => keys.has(tileKey(t.q, t.r)))) for (const t of island) members.add(tileKey(t.q, t.r));
  return {
    ...design,
    tiles: design.tiles.map(t => {
      if (!members.has(tileKey(t.q, t.r))) return t;
      const { numberGroup: _old, ...rest } = t;
      return group ? { ...rest, numberGroup: group } : rest;
    }),
  };
}

/** A new group holding a copy of `from`, followed by the islands holding `keys`. */
export function splitGroup(
  design: BoardDesign,
  keys: Set<string>,
  from: NumberProfile,
): { design: BoardDesign; group: string } {
  const taken = new Set(Object.keys(design.numberGroups ?? {}));
  let n = 1;
  while (taken.has(String(n))) n++;
  const group = String(n);
  const withGroup = { ...design, numberGroups: { ...design.numberGroups, [group]: structuredClone(from) } };
  return { design: assignGroup(withGroup, keys, group), group };
}

/** Land tile keys of all islands, those closed to starting settlements, or those open to them. */
export function islandSet(design: BoardDesign, which: 'all' | 'closed' | 'open'): Set<string> {
  const land = design.tiles.filter(t => isLand(t.kind)).map(t => tileKey(t.q, t.r));
  if (which === 'all') return new Set(land);
  const closed = closedTiles(design);
  return new Set(land.filter(k => closed.has(k) === (which === 'closed')));
}

/**
 * Boards saved before islands had number profiles: one level for every closed island
 * (`richIslands`) becomes a group those islands follow, in every layout, and the board-wide
 * terrain bias (`numberBias`) becomes the board's profile.
 */
export function upgradeDesign(design: BoardDesign): BoardDesign {
  const {
    richIslands: level,
    numberBias: bias,
    ...rest
  } = design as BoardDesign & {
    richIslands?: number;
    numberBias?: NumberProfile['bias'];
  };
  if (level === undefined && bias === undefined) return design;
  let next: BoardDesign = bias && Object.keys(bias).length ? { ...rest, numbers: { ...rest.numbers, bias } } : rest;
  if (!level) return next;
  next = setProfile(next, '1', { level });
  const lift = <T extends { tiles: DesignTile[] }>(layout: T): T => {
    const shown = { ...next, tiles: layout.tiles };
    return { ...layout, tiles: assignGroup(shown, closedTiles(shown), '1').tiles };
  };
  return { ...lift(next), ...(next.versions ? { versions: next.versions.map(lift) } : {}) };
}
