import { buildGraph, hexCenter, shuffled } from '../board';
import { isLandTerrain, isProducing, isWater, terrainResource } from '../seafaring';
import {
  type Board,
  CLASSIC_RESOURCES,
  type GameState,
  type Harbor,
  RESOURCES,
  type Resource,
  type Terrain,
} from '../types';
import {
  apportion,
  balancedNumbers,
  type Cell,
  clumping,
  neighborKeys,
  numberMix,
  randomNumber,
  swapEqualOdds,
} from './balance';
import { fogIslandsOf, fogKinds, fogMayBeSea, fogMixOf } from './fog';
import { autoHarbors, harborTarget } from './harbors';
import { landMixOf } from './land-mix';
import { islandLevels, islandsOf, numberLeanings } from './numbers';
import { rulesOf } from './special';
import {
  BASE_POOL,
  type BoardDesign,
  boardExpansions,
  type DesignHarbor,
  type DesignTile,
  type FillKind,
  FOG_POOL,
  type FogKind,
  type FogMix,
  type LandMix,
  type Pool,
  SIDE_DIRECTIONS,
  tileKey,
} from './types';

/** How far a harbor sign sits out from its edge, toward the sea tile. */
const HARBOR_OFFSET = 38;
/**
 * Base game harbor mix: four 3:1 harbors and one 2:1 per resource the map produces, from a tile
 * or from fog that may hide one (lodestone also only on Cartographers maps).
 */
function harborWeights(design: BoardDesign, terrains: Map<string, Terrain>): [Resource | 'any', number][] {
  const fog = fogIslandsOf(design).flatMap(island => fogKinds(fogMixOf(island)).map(([k]) => k));
  const produced = new Set([...terrains.values(), ...fog].map(terrainResource));
  const kinds = mapResources(design).filter(r => produced.has(r));
  return [['any', 4], ...kinds.map(r => [r, 1] as [Resource, number])];
}

/** The resources a design's random harbors and links may draw: lodestone only on Cartographers maps. */
function mapResources(design: BoardDesign): readonly Resource[] {
  return boardExpansions(design).includes('cartographers') ? RESOURCES : CLASSIC_RESOURCES;
}

interface LinkGroup {
  tiles: DesignTile[];
  /** A member with a set terrain (or a harbor with a set resource) decides for the whole group. */
  fixed: Terrain | null;
  /** Harbors in the group need a resource, so the group can't become desert or gold. */
  harbor: boolean;
}

function linkGroups(design: BoardDesign): Map<string, LinkGroup> {
  const groups = new Map<string, LinkGroup>();
  const group = (link: string) => {
    if (!groups.has(link)) groups.set(link, { tiles: [], fixed: null, harbor: false });
    return groups.get(link)!;
  };
  for (const tile of design.tiles) {
    if (!tile.link || tile.kind === 'sea') continue;
    const g = group(tile.link);
    g.tiles.push(tile);
    if (tile.kind !== 'land') g.fixed ??= tile.kind;
  }
  for (const harbor of design.harbors) {
    if (!harbor.link) continue;
    const g = group(harbor.link);
    g.harbor = true;
    if (RESOURCES.includes(harbor.kind as Resource)) g.fixed ??= harbor.kind as Resource;
  }
  // A letter named only by "not A" marks or a rule still gets a terrain, so "not A" means something
  // even when no tile carries A itself ("A in mountains" with only "not A" tiles: none are mountains).
  const named = [
    ...design.tiles.map(t => t.notLink),
    ...design.harbors.map(h => h.notLink),
    ...(design.linkRules ?? []).flatMap(rule => rule.links),
  ];
  for (const link of named) if (link) group(link);
  return groups;
}

/** A mix as a map of the kinds random land can become (icebergs are drawn on the sea instead). */
function poolMap(pool: Pool | undefined): Map<FillKind, number> {
  const map = new Map(
    Object.entries({ ...(pool ?? BASE_POOL) }).filter(([kind, w]) => kind !== 'iceberg' && (w ?? 0) > 0),
  ) as Map<FillKind, number>;
  if (!map.size) for (const [k, w] of Object.entries(BASE_POOL)) map.set(k as FillKind, w!);
  return map;
}

/** The mixes in play: the board's under '', and each island's own under its first tile's key. */
interface Mixes {
  /** The mix a tile's island draws from. */
  keyOf: (t: { q: number; r: number }) => string;
  pools: Map<string, Map<FillKind, number>>;
  /** The terrains a mix gives as exact counts. */
  exactOf: (key: string) => FillKind[];
}

function mixesOf(design: BoardDesign): Mixes {
  const keys = new Map<string, string>();
  const own = new Map<string, LandMix>();
  const islands = design.tiles.some(t => t.landMix) ? islandsOf(design) : [];
  for (const island of islands) {
    const mix = landMixOf(island);
    if (!mix) continue;
    const key = tileKey(island[0]!.q, island[0]!.r);
    own.set(key, mix);
    for (const t of island) keys.set(tileKey(t.q, t.r), key);
  }
  const pools = new Map([['', poolMap(design.pool)]]);
  for (const [key, mix] of own) pools.set(key, poolMap(mix.pool));
  return {
    keyOf: t => keys.get(tileKey(t.q, t.r)) ?? '',
    pools,
    exactOf: key => (key ? own.get(key)?.exact : design.exactMix?.['']) ?? [],
  };
}

/**
 * A terrain for each open link letter that satisfies the board's link rules ("B, C in mountains or
 * hills", "A, B, C distinct"), drawn by what the mix still has room for. A letter on several
 * islands takes a terrain all their mixes allow, so no island gets one its mix leaves out. A short
 * backtracking search; if the rules can't all hold, the remaining letters take their first allowed terrain.
 */
function chooseLinks(
  design: BoardDesign,
  open: [string, LinkGroup][],
  fixed: Map<string, Terrain>,
  counts: Map<string, Map<FillKind, number>>,
  { keyOf, pools }: Mixes,
  random: () => number,
): Map<string, FillKind> {
  const rules = design.linkRules ?? [];
  const options = new Map<string, FillKind[]>();
  for (const [link, g] of open) {
    const members = g.tiles.filter(t => t.kind === 'land');
    // A group with no tiles of its own (only harbors or "Not" marks) goes by the board's mix.
    const keys = members.length ? [...new Set(members.map(keyOf))] : [''];
    const first = keys[0]!;
    const inEvery = (k: FillKind) => keys.every(key => pools.get(key)!.has(k));
    const room = (k: FillKind) => keys.reduce((n, key) => n + Math.max(0, counts.get(key)!.get(k) ?? 0), 0);
    const drawn = [...counts.get(first)!.keys()].filter(inEvery);
    const shared = drawn.length ? drawn : [...pools.get(first)!.keys()].filter(inEvery);
    const fits = (k: FillKind) =>
      !g.harbor || (RESOURCES.includes(k as Resource) && !design.harborExclude.includes(k as Resource));
    let allowed = (shared.length ? shared : [...pools.get(first)!.keys()]).filter(fits);
    for (const rule of rules)
      if (rule.kind === 'in' && rule.links.includes(link)) {
        const within = allowed.filter(k => rule.terrains.includes(k));
        allowed = within.length ? within : rule.terrains.filter(fits);
      }
    // A weighted order by what the mix still has room for, so every kind can come up.
    const ordered: FillKind[] = [];
    const left = [...allowed];
    while (left.length) {
      const k = weightedPick(left, x => room(x) + 0.25, random)!;
      ordered.push(k);
      left.splice(left.indexOf(k), 1);
    }
    options.set(link, ordered.length ? ordered : [shuffled(mapResources(design), random)[0]!]);
  }
  // Most constrained first.
  const order = open.map(([link]) => link).sort((a, b) => options.get(a)!.length - options.get(b)!.length);
  const chosen = new Map<string, FillKind>();
  const clashes = (link: string, kind: FillKind) =>
    rules.some(
      rule =>
        rule.kind === 'distinct' &&
        rule.links.includes(link) &&
        rule.links.some(other => other !== link && (chosen.get(other) ?? fixed.get(other)) === kind),
    );
  let budget = 2000;
  const search = (i: number): boolean => {
    if (i === order.length) return true;
    const link = order[i]!;
    for (const kind of options.get(link)!) {
      if (budget-- <= 0) break;
      if (clashes(link, kind)) continue;
      chosen.set(link, kind);
      if (search(i + 1)) return true;
      chosen.delete(link);
    }
    return false;
  };
  if (!search(0)) for (const link of order) if (!chosen.has(link)) chosen.set(link, options.get(link)![0]!);
  return chosen;
}

/**
 * "Not A" tiles: swap a single tile's draw with another in the same mix when it came out as the
 * terrain its letter got. Tiles with no swap left are drawn again as a balanced draw from the mix
 * without that terrain, counting what the other tiles already hold (so a rare kind stays rare).
 */
function keepNotLinks(
  singles: DesignTile[],
  kinds: FillKind[],
  links: Map<string, Terrain>,
  { keyOf: mixKey, pools, exactOf }: Mixes,
  random: () => number,
): void {
  const banned = (i: number) => (singles[i]!.notLink ? links.get(singles[i]!.notLink!) : undefined);
  const stuck = new Map<string, number[]>();
  singles.forEach((tile, i) => {
    const not = banned(i);
    if (!not || kinds[i] !== not) return;
    // Swap with a random partner: always taking the first in tile order piled the displaced
    // terrain onto the same few tiles every time.
    const partners = singles.flatMap((other, k) =>
      k !== i && mixKey(other) === mixKey(tile) && kinds[k] !== not && banned(k) !== kinds[i] ? [k] : [],
    );
    const j = partners.length ? partners[Math.floor(random() * partners.length)]! : -1;
    if (j >= 0) [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
    else {
      const key = `${mixKey(tile)}|${not}`;
      stuck.set(key, [...(stuck.get(key) ?? []), i]);
    }
  });
  for (const [key, tiles] of stuck) {
    const [mix, not] = key.split('|') as [string, FillKind];
    // Exact terrains already have their count, so the redraw takes from the shared ones.
    const exact = new Set(exactOf(mix));
    const allowed = [...pools.get(mix)!].filter(([k]) => k !== not);
    const shared = allowed.filter(([k]) => !exact.has(k));
    const weights = new Map(shared.length ? shared : allowed);
    const held = new Map<FillKind, number>();
    singles.forEach((t, i) => {
      if (mixKey(t) === mix && !tiles.includes(i)) held.set(kinds[i]!, (held.get(kinds[i]!) ?? 0) + 1);
    });
    const draw = shuffled(apportion(tiles.length, weights, held, random), random);
    tiles.forEach((i, n) => {
      kinds[i] = draw[n] ?? kinds[i]!;
    });
  }
}

/**
 * The terrains a mix's `size` random tiles get: each exact terrain its count less the set tiles of
 * that terrain (cut short when tiles run out), the rest a balanced draw by share. With every
 * terrain exact, any tiles left over follow the exact counts' proportions.
 */
function mixDraw(
  size: number,
  pool: Map<FillKind, number>,
  exact: FillKind[],
  fixed: Map<FillKind, number>,
  random: () => number,
): FillKind[] {
  const exactKinds = exact.filter(k => pool.has(k));
  const drawn: FillKind[] = [];
  for (const k of shuffled(exactKinds, random)) {
    const n = Math.min(size - drawn.length, Math.max(0, Math.round(pool.get(k)!) - (fixed.get(k) ?? 0)));
    drawn.push(...Array<FillKind>(n).fill(k));
  }
  const shares = new Map([...pool].filter(([k]) => !exactKinds.includes(k)));
  if (!shares.size) return [...drawn, ...apportion(size - drawn.length, pool, new Map(), random)];
  return [...drawn, ...apportion(size - drawn.length, shares, fixed, random)];
}

/**
 * Fill random land: linked groups first (each a block of one terrain), then single tiles spread
 * out. Islands with their own mix draw from it; everything else from the board's mix.
 */
function resolveTerrains(
  design: BoardDesign,
  random: () => number,
): { terrains: Map<string, Terrain>; links: Map<string, Terrain> } {
  const terrains = new Map<string, Terrain>();
  const groups = linkGroups(design);
  for (const tile of design.tiles) if (tile.kind !== 'land') terrains.set(tileKey(tile.q, tile.r), tile.kind);
  for (const g of groups.values())
    if (g.fixed) for (const tile of g.tiles) terrains.set(tileKey(tile.q, tile.r), g.fixed);

  const mixes = mixesOf(design);
  const { keyOf: mixKey, pools, exactOf } = mixes;
  const open = design.tiles.filter(t => t.kind === 'land' && !terrains.has(tileKey(t.q, t.r)));
  const counts = new Map<string, Map<FillKind, number>>();
  for (const [key, pool] of pools) {
    const fixedCounts = new Map<FillKind, number>();
    for (const tile of design.tiles) {
      const terrain = terrains.get(tileKey(tile.q, tile.r));
      if (terrain && mixKey(tile) === key && pool.has(terrain as FillKind))
        fixedCounts.set(terrain as FillKind, (fixedCounts.get(terrain as FillKind) ?? 0) + 1);
    }
    const mine = new Map<FillKind, number>();
    const size = open.filter(t => mixKey(t) === key).length;
    for (const kind of mixDraw(size, pool, exactOf(key), fixedCounts, random))
      mine.set(kind, (mine.get(kind) ?? 0) + 1);
    counts.set(key, mine);
  }

  const links = new Map<string, Terrain>();
  for (const [link, g] of groups) if (g.fixed) links.set(link, g.fixed);
  const openGroups = [...groups].filter(([, g]) => !g.fixed).sort((a, b) => b[1].tiles.length - a[1].tiles.length);
  const choices = chooseLinks(design, openGroups, links, counts, mixes, random);
  for (const [link, g] of openGroups) {
    const members = g.tiles.filter(t => t.kind === 'land');
    const kind = choices.get(link)!;
    for (const tile of members) {
      const own = counts.get(mixKey(tile))!;
      own.set(kind, (own.get(kind) ?? 0) - 1);
    }
    links.set(link, kind);
    for (const tile of members) terrains.set(tileKey(tile.q, tile.r), kind);
  }

  const singles = open.filter(t => !terrains.has(tileKey(t.q, t.r)));
  const bags = new Map<string, FillKind[]>();
  for (const [key, mix] of counts) {
    const bag = [...mix].flatMap(([k, n]) => Array<FillKind>(Math.max(0, n)).fill(k));
    const need = singles.filter(t => mixKey(t) === key).length;
    const weighted = [...pools.get(key)!].flatMap(([k, w]) => Array<FillKind>(Math.max(1, Math.round(w))).fill(k));
    while (bag.length < need) bag.push(weighted[Math.floor(random() * weighted.length)]!);
    bags.set(key, bag);
  }
  let best: { cost: number; kinds: FillKind[] } | null = null;
  for (let attempt = 0; attempt < 24 && singles.length; attempt++) {
    const shuffledBags = new Map([...bags].map(([key, bag]) => [key, shuffled(bag, random)]));
    const kinds = singles.map(t => shuffledBags.get(mixKey(t))!.pop()!);
    keepNotLinks(singles, kinds, links, mixes, random);
    const layout = new Map<string, Cell & { kind: string }>();
    for (const tile of design.tiles) {
      const k = tileKey(tile.q, tile.r);
      const terrain = terrains.get(k);
      if (terrain && isLandTerrain(terrain)) layout.set(k, { q: tile.q, r: tile.r, kind: terrain });
    }
    singles.forEach((t, i) => {
      layout.set(tileKey(t.q, t.r), { q: t.q, r: t.r, kind: kinds[i]! });
    });
    const cost = clumping(layout);
    if (!best || cost < best.cost) best = { cost, kinds };
  }
  singles.forEach((t, i) => {
    terrains.set(tileKey(t.q, t.r), best!.kinds[i]!);
  });
  return { terrains, links };
}

function weightedPick<K>(items: K[], weight: (item: K) => number, random: () => number): K | undefined {
  const total = items.reduce((n, item) => n + weight(item), 0);
  let at = random() * total;
  for (const item of items) {
    at -= weight(item);
    if (at < 0) return item;
  }
  return items.at(-1);
}

type DrawnHarbor = { q: number; r: number; side: number; resource: Resource | 'any'; drawn: boolean };

/**
 * "Not A" harbors: swap a drawn harbor holding A's resource with one that may take it and whose
 * resource this harbor may hold. Harbors with no such partner redraw from the kinds left to them
 * (3:1 when none are).
 */
function keepHarborNotLinks(
  valid: DesignHarbor[],
  drawn: DrawnHarbor[],
  links: Map<string, Terrain>,
  weights: Map<Resource | 'any', number>,
  random: () => number,
): void {
  const banned = (i: number) => (valid[i]!.notLink ? links.get(valid[i]!.notLink!) : undefined);
  const clashes = (i: number) => drawn[i]!.drawn && drawn[i]!.resource === banned(i);
  drawn.forEach((harbor, i) => {
    if (!clashes(i)) return;
    const partners = drawn.flatMap((other, k) =>
      k !== i && other.drawn && other.resource !== banned(i) && banned(k) !== harbor.resource ? [k] : [],
    );
    if (!partners.length) return;
    const partner = drawn[partners[Math.floor(random() * partners.length)]!]!;
    [harbor.resource, partner.resource] = [partner.resource, harbor.resource];
  });
  const held = new Map<Resource | 'any', number>();
  for (const [i, h] of drawn.entries()) if (!clashes(i)) held.set(h.resource, (held.get(h.resource) ?? 0) + 1);
  drawn.forEach((harbor, i) => {
    if (!clashes(i)) return;
    const allowed = new Map([...weights].filter(([kind]) => kind !== banned(i)));
    harbor.resource = apportion(1, allowed, held, random)[0] ?? 'any';
    held.set(harbor.resource, (held.get(harbor.resource) ?? 0) + 1);
  });
}

/** Harbor resources: fixed ones stay, linked ones follow their group, the rest are a balanced draw. */
function resolveHarbors(
  design: BoardDesign,
  terrains: Map<string, Terrain>,
  links: Map<string, Terrain>,
  random: () => number,
): { q: number; r: number; side: number; resource: Resource | 'any' }[] {
  const seen = new Set<string>();
  const valid = design.harbors.filter(h => {
    const land = terrains.get(tileKey(h.q, h.r));
    const [dq, dr] = SIDE_DIRECTIONS[h.side] ?? [0, 0];
    const across = terrains.get(tileKey(h.q + dq, h.r + dr));
    const edge = [tileKey(h.q, h.r), tileKey(h.q + dq, h.r + dr)].sort().join('|');
    // A harbor on fog only stands when the fog can't turn out to be sea (the editor enforces this too).
    const onFog = land === 'fog' && fogMayBeSea(design, h.q, h.r);
    if (!land || isWater(land) || onFog || (across && !isWater(across)) || seen.has(edge)) return false;
    seen.add(edge);
    return true;
  });
  const resolved = valid.map(h => {
    const linked = h.link ? links.get(h.link) : undefined;
    const resource: Resource | 'any' | null =
      h.kind !== 'random' ? h.kind : linked && RESOURCES.includes(linked as Resource) ? (linked as Resource) : null;
    return { q: h.q, r: h.r, side: h.side, resource };
  });
  const kinds = harborWeights(design, terrains);
  const allowed = kinds.filter(([k]) => !design.harborExclude.includes(k));
  // With every kind excluded, random harbors fall back to 3:1.
  const weights = new Map(allowed.length ? allowed : kinds.slice(0, 1));
  const fixed = new Map<Resource | 'any', number>();
  for (const h of resolved) if (h.resource) fixed.set(h.resource, (fixed.get(h.resource) ?? 0) + 1);
  const draw = shuffled(apportion(resolved.filter(h => !h.resource).length, weights, fixed, random), random);
  const drawn = resolved.map(h => ({ ...h, resource: h.resource ?? draw.pop() ?? 'any', drawn: !h.resource }));
  keepHarborNotLinks(valid, drawn, links, weights, random);
  return drawn.map(({ drawn: _d, ...h }) => h);
}

/** Harbor kinds a balanced draw gives this design's harbors (fixed ones kept), keyed by `q,r,side`. */
export function drawHarborKinds(
  design: BoardDesign,
  random: () => number = Math.random,
): Map<string, Resource | 'any'> {
  const tiles = [...new Map(design.tiles.map(t => [tileKey(t.q, t.r), t])).values()];
  const unique = { ...design, tiles };
  const { terrains, links } = resolveTerrains(unique, random);
  return new Map(resolveHarbors(unique, terrains, links, random).map(h => [`${h.q},${h.r},${h.side}`, h.resource]));
}

/** Connected land tiles get the same island number (1, 2, …). */
function markIslands(board: Board): void {
  const byKey = new Map(board.hexes.map(h => [tileKey(h.q, h.r), h]));
  let island = 0;
  for (const start of board.hexes) {
    if (!isLandTerrain(start.terrain) || start.island !== undefined) continue;
    island++;
    const queue = [start];
    start.island = island;
    while (queue.length) {
      const hex = queue.pop()!;
      for (const k of neighborKeys(hex)) {
        const next = byKey.get(k);
        if (next && isLandTerrain(next.terrain) && next.island === undefined) {
          next.island = island;
          queue.push(next);
        }
      }
    }
  }
}

/**
 * Turn `pool.iceberg` percent of the open sea into icebergs, spread apart, never on the pirate's
 * start or in front of a harbor.
 */
function placeIcebergs(
  design: BoardDesign,
  terrains: Map<string, Terrain>,
  harbors: DesignHarbor[],
  random: () => number,
): void {
  const percent = design.pool.iceberg ?? 0;
  if (percent <= 0) return;
  const blocked = new Set(
    harbors.map(h => {
      const [dq, dr] = SIDE_DIRECTIONS[h.side]!;
      return tileKey(h.q + dq, h.r + dr);
    }),
  );
  if (design.pirate) blocked.add(tileKey(design.pirate.q, design.pirate.r));
  const sea = design.tiles.filter(t => terrains.get(tileKey(t.q, t.r)) === 'sea');
  let count = Math.round((sea.length * Math.min(100, percent)) / 100);
  const open = shuffled(
    sea.filter(t => !blocked.has(tileKey(t.q, t.r))),
    random,
  );
  const nearIce = (t: DesignTile) => neighborKeys(t).some(k => terrains.get(k) === 'iceberg');
  for (const spread of [true, false])
    for (const tile of open) {
      if (count <= 0) return;
      const k = tileKey(tile.q, tile.r);
      if (terrains.get(k) !== 'sea' || (spread && nearIce(tile))) continue;
      terrains.set(k, 'iceberg');
      count--;
    }
}

/** A number per iceberg: the one the design set, or a draw from the base mix (without 2 and 12 when `noEnds`). */
function icebergNumbers(tiles: DesignTile[], terrains: Map<string, Terrain>, random: () => number, noEnds = false) {
  const numbers = new Map<string, number>();
  for (const t of tiles) {
    const k = tileKey(t.q, t.r);
    if (terrains.get(k) !== 'iceberg') continue;
    const set = t.kind === 'iceberg' && t.number && t.number !== 7 ? t.number : undefined;
    numbers.set(k, set ?? randomNumber(random, noEnds));
  }
  return numbers;
}

/**
 * A playable board from a design: random land and numbers filled (balanced), harbors placed (at
 * random spots when the design has none), icebergs drawn on the sea, islands numbered, and the
 * robber and pirate starting tiles. A fresh draw on every call.
 */
export function buildBoard(
  design: BoardDesign,
  random: () => number = Math.random,
): { board: Board; robber: string; pirate: string | null; fog: GameState['fog'] } {
  const tiles = [...new Map(design.tiles.map(t => [tileKey(t.q, t.r), t])).values()];
  const unique = { ...design, tiles };
  const { terrains, links } = resolveTerrains(unique, random);
  const harbors = design.harbors.length ? design.harbors : autoHarbors(tiles, harborTarget(unique), [], random);
  const resolvedHarbors = resolveHarbors({ ...unique, harbors }, terrains, links, random);
  placeIcebergs(unique, terrains, harbors, random);
  const lean = numberLeanings(unique);
  const producing = tiles
    .map(t => ({
      q: t.q,
      r: t.r,
      terrain: terrains.get(tileKey(t.q, t.r))!,
      pips: t.pips,
      ...lean(t.q, t.r, terrains.get(tileKey(t.q, t.r))!),
    }))
    .filter(c => isProducing(c.terrain));
  const fixed = new Map<string, number>();
  for (const t of tiles) {
    const valid = t.number && t.number >= 2 && t.number <= 12 && t.number !== 7;
    if (valid && isProducing(terrains.get(tileKey(t.q, t.r))!)) fixed.set(tileKey(t.q, t.r), t.number!);
  }
  const numbers = new Map([
    ...balancedNumbers(producing, design.swapNumbers ? swapEqualOdds(fixed, random) : fixed, random, {
      noTwoTwelve: design.noTwoTwelve,
    }),
    ...icebergNumbers(tiles, terrains, random, design.noTwoTwelve),
  ]);
  const board = buildGraph(
    tiles.map(t => {
      const k = tileKey(t.q, t.r);
      return { q: t.q, r: t.r, terrain: terrains.get(k)!, number: numbers.get(k) ?? null };
    }),
  );
  markIslands(board);
  const byKey = new Map(board.hexes.map(h => [tileKey(h.q, h.r), h]));
  const closedIslands = new Set<number>();
  for (const t of tiles) {
    const hex = byKey.get(tileKey(t.q, t.r))!;
    if (hex.island === undefined) continue;
    if (t.bonus) hex.bonus = Math.min(3, Math.max(1, Math.round(t.bonus)));
    if (t.noSetup) closedIslands.add(hex.island);
  }
  for (const hex of board.hexes) if (hex.island !== undefined && closedIslands.has(hex.island)) hex.noSetup = true;
  for (const corner of design.noStart ?? []) {
    const [q, r, c] = corner.split(',').map(Number) as [number, number, number];
    const vertexId = byKey.get(tileKey(q, r))?.vertexIds[c];
    const vertex = vertexId ? board.vertices.find(v => v.id === vertexId) : undefined;
    if (vertex) vertex.noSetup = true;
  }

  const edgeId = new Map(board.edges.map(e => [[e.a, e.b].sort().join(':'), e.id]));
  const vertex = new Map(board.vertices.map(v => [v.id, v]));
  board.harbors = resolvedHarbors.map((h, i): Harbor => {
    const hex = byKey.get(tileKey(h.q, h.r))!;
    const a = hex.vertexIds[h.side]!;
    const b = hex.vertexIds[(h.side + 1) % 6]!;
    const [dq, dr] = SIDE_DIRECTIONS[h.side]!;
    const across = hexCenter(h.q + dq, h.r + dr);
    const mid = { x: (vertex.get(a)!.x + vertex.get(b)!.x) / 2, y: (vertex.get(a)!.y + vertex.get(b)!.y) / 2 };
    const length = Math.hypot(across.x - hex.x, across.y - hex.y);
    return {
      id: `port-${i}`,
      edgeId: edgeId.get([a, b].sort().join(':'))!,
      vertices: [a, b],
      resource: h.resource,
      x: mid.x + ((across.x - hex.x) / length) * HARBOR_OFFSET,
      y: mid.y + ((across.y - hex.y) / length) * HARBOR_OFFSET,
    };
  });

  const at = (cell: { q: number; r: number } | null) => (cell ? byKey.get(tileKey(cell.q, cell.r)) : undefined);
  const robberHex = at(design.robber);
  const robber =
    robberHex && !isWater(robberHex.terrain) ? robberHex.id : (board.hexes.find(h => h.terrain === 'desert')?.id ?? '');
  const pirate = pirateStart(design, board, at(design.pirate));
  const rules = rulesOf(design);
  if (rules) board.rules = rules;
  return { board, robber, pirate, fog: drawFog(design, board, random) };
}

/**
 * Exact fog counts as a shuffled stack, `size` long: cut short when the counts list more tiles than
 * the board has fog, topped up in proportion when they list fewer.
 */
function exactFog(counts: Map<FogKind, number>, size: number, random: () => number): FogKind[] {
  const stack = shuffled(
    [...counts].flatMap(([k, n]) => Array<FogKind>(Math.max(0, Math.round(n))).fill(k)),
    random,
  );
  if (stack.length >= size) return stack.slice(0, size);
  return shuffled([...stack, ...apportion(size - stack.length, counts, new Map(), random)], random);
}

/** One fog island's hidden tiles, `size` of them: a balanced draw from its mix, or its exact counts. */
function fogStack(mix: FogMix, size: number, random: () => number): FogKind[] {
  const weights = new Map(fogKinds(mix));
  if (!weights.size) for (const [k, w] of Object.entries(FOG_POOL)) weights.set(k as FogKind, w!);
  return mix.exact ? exactFog(weights, size, random) : shuffled(apportion(size, weights, new Map(), random), random);
}

/**
 * What lies under each fog tile, drawn now and kept hidden (the face-down stack): each fog island
 * draws from its own mix, and any land that will produce gets a number. Each fog island's number
 * levels (set in the editor, per terrain) shift the numbers its land draws, as on land.
 */
function drawFog(design: BoardDesign, board: Board, random: () => number): GameState['fog'] {
  const hexes = board.hexes.filter(h => h.terrain === 'fog');
  if (!hexes.length) return {};
  const drawn = new Map<string, FogKind>();
  const levels = new Map<string, ReturnType<typeof islandLevels>>();
  for (const island of fogIslandsOf(design)) {
    const stack = fogStack(fogMixOf(island), island.length, random);
    island.forEach((t, i) => {
      drawn.set(tileKey(t.q, t.r), stack[i]!);
      levels.set(tileKey(t.q, t.r), islandLevels(island));
    });
  }
  const kinds = hexes.map(h => drawn.get(tileKey(h.q, h.r)) ?? 'sea');
  const levelAt = (i: number) => levels.get(tileKey(hexes[i]!.q, hexes[i]!.r))?.[kinds[i] as FillKind] ?? 0;
  // One pool per level, sized to the producing tiles at that level, as balancedNumbers does for land.
  const pools = new Map<number, number[]>();
  const producing = hexes.flatMap((_, i) => (isProducing(kinds[i]!) ? [i] : []));
  for (const level of new Set(producing.map(levelAt))) {
    const count = producing.filter(i => levelAt(i) === level).length;
    pools.set(level, shuffled(apportion(count, numberMix(level, !!design.noTwoTwelve), new Map(), random), random));
  }
  return Object.fromEntries(
    hexes.map((hex, i) => {
      const terrain = kinds[i]!;
      return [hex.id, { terrain, number: isProducing(terrain) ? (pools.get(levelAt(i))!.pop() ?? null) : null }];
    }),
  );
}

/** The pirate's starting tile: only maps that play with ships have one; the design's start, else the farthest sea. */
function pirateStart(design: BoardDesign, board: Board, set: Board['hexes'][number] | undefined): string | null {
  if (!boardExpansions(design).includes('seafarers')) return null;
  return set?.terrain === 'sea' ? set.id : farthestSea(board);
}

/** Where the pirate starts when a map doesn't say: the open sea tile farthest from any land. */
export function farthestSea(board: Board): string | null {
  const land = board.hexes.filter(h => !isWater(h.terrain));
  let best: { id: string; distance: number } | null = null;
  for (const hex of board.hexes) {
    if (hex.terrain !== 'sea') continue;
    const distance = Math.min(...land.map(l => Math.hypot(l.x - hex.x, l.y - hex.y)));
    if (!best || distance > best.distance + 0.01) best = { id: hex.id, distance };
  }
  return best?.id ?? null;
}
