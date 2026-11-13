import { buildGraph, hexCenter, shuffled } from '../board';
import { isLandTerrain, isProducing, isWater } from '../seafaring';
import { type Board, type GameState, type Harbor, RESOURCES, type Resource, type Terrain } from '../types';
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
import { fogMayBeSea, islandRichness } from './edit';
import { autoHarbors, harborTarget } from './harbors';
import {
  BASE_POOL,
  type BoardDesign,
  type DesignHarbor,
  type DesignTile,
  type FillKind,
  FOG_POOL,
  type FogKind,
  type Pool,
  SIDE_DIRECTIONS,
  tileKey,
} from './types';

/** How far a harbor sign sits out from its edge, toward the sea tile. */
const HARBOR_OFFSET = 38;
/** Base game harbor mix: four 3:1 harbors and one 2:1 per resource. */
const HARBOR_WEIGHTS: [Resource | 'any', number][] = [['any', 4], ...RESOURCES.map(r => [r, 1] as [Resource, number])];

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

/**
 * Which mix each tile draws from: '' for the board's, or the key of the island tile that carries
 * an island's own mix (design.islandPools). Islands are connected land and random land.
 */
function mixGroups(design: BoardDesign): Map<string, string> {
  const group = new Map<string, string>();
  const own = design.islandPools ?? {};
  const byKey = new Map(design.tiles.map(t => [tileKey(t.q, t.r), t]));
  const isLand = (t: DesignTile | undefined) => !!t && t.kind !== 'sea' && t.kind !== 'iceberg' && t.kind !== 'fog';
  const seen = new Set<string>();
  for (const tile of design.tiles) {
    const start = tileKey(tile.q, tile.r);
    if (!isLand(tile) || seen.has(start)) continue;
    const island: string[] = [];
    const queue = [tile];
    seen.add(start);
    while (queue.length) {
      const t = queue.pop()!;
      island.push(tileKey(t.q, t.r));
      for (const k of neighborKeys(t))
        if (!seen.has(k) && isLand(byKey.get(k))) {
          seen.add(k);
          queue.push(byKey.get(k)!);
        }
    }
    const anchor = island.find(k => own[k]) ?? '';
    for (const k of island) group.set(k, anchor);
  }
  return group;
}

/**
 * A terrain for each open link letter that satisfies the board's link rules ("B, C in mountains or
 * hills", "A, B, C distinct"), drawn by what the mix still has room for. A short backtracking
 * search; if the rules can't all hold, the remaining letters take their first allowed terrain.
 */
function chooseLinks(
  design: BoardDesign,
  open: [string, LinkGroup][],
  fixed: Map<string, Terrain>,
  counts: Map<string, Map<FillKind, number>>,
  mixKey: (t: { q: number; r: number }) => string,
  random: () => number,
): Map<string, FillKind> {
  const rules = design.linkRules ?? [];
  const options = new Map<string, FillKind[]>();
  for (const [link, g] of open) {
    const members = g.tiles.filter(t => t.kind === 'land');
    // A linked group draws from the mix of its first tile's island (or the board's).
    const mix = counts.get(members[0] ? mixKey(members[0]) : '')!;
    const fits = (k: FillKind) =>
      !g.harbor || (RESOURCES.includes(k as Resource) && !design.harborExclude.includes(k as Resource));
    let allowed = [...mix.keys()].filter(fits);
    for (const rule of rules)
      if (rule.kind === 'in' && rule.links.includes(link)) {
        const within = allowed.filter(k => rule.terrains.includes(k));
        allowed = within.length ? within : rule.terrains.filter(fits);
      }
    // A weighted order by what the mix still has room for, so every kind can come up.
    const ordered: FillKind[] = [];
    const left = [...allowed];
    while (left.length) {
      const k = weightedPick(left, x => Math.max(0, mix.get(x) ?? 0) + 0.25, random)!;
      ordered.push(k);
      left.splice(left.indexOf(k), 1);
    }
    options.set(link, ordered.length ? ordered : [shuffled(RESOURCES, random)[0]!]);
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
 * terrain its letter got, or draw again from the mix when no swap fits.
 */
function keepNotLinks(
  singles: DesignTile[],
  kinds: FillKind[],
  links: Map<string, Terrain>,
  pools: Map<string, Map<FillKind, number>>,
  mixKey: (t: { q: number; r: number }) => string,
  random: () => number,
): void {
  const banned = (i: number) => (singles[i]!.notLink ? links.get(singles[i]!.notLink!) : undefined);
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
      const rest = [...pools.get(mixKey(tile))!.keys()].filter(k => k !== not);
      if (rest.length) kinds[i] = rest[Math.floor(random() * rest.length)]!;
    }
  });
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

  const mixOf = mixGroups(design);
  const mixKey = (t: { q: number; r: number }) => mixOf.get(tileKey(t.q, t.r)) ?? '';
  const pools = new Map<string, Map<FillKind, number>>([['', poolMap(design.pool)]]);
  for (const key of new Set(mixOf.values())) if (key) pools.set(key, poolMap(design.islandPools![key]));
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
    for (const kind of apportion(size, pool, fixedCounts, random)) mine.set(kind, (mine.get(kind) ?? 0) + 1);
    counts.set(key, mine);
  }

  const links = new Map<string, Terrain>();
  for (const [link, g] of groups) if (g.fixed) links.set(link, g.fixed);
  const openGroups = [...groups].filter(([, g]) => !g.fixed).sort((a, b) => b[1].tiles.length - a[1].tiles.length);
  const choices = chooseLinks(design, openGroups, links, counts, mixKey, random);
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
    keepNotLinks(singles, kinds, links, pools, mixKey, random);
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
    const onFog = land === 'fog' && fogMayBeSea(design);
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
  const allowed = HARBOR_WEIGHTS.filter(([k]) => !design.harborExclude.includes(k));
  // With every kind excluded, random harbors fall back to 3:1.
  const weights = new Map(allowed.length ? allowed : HARBOR_WEIGHTS.slice(0, 1));
  const fixed = new Map<Resource | 'any', number>();
  for (const h of resolved) if (h.resource) fixed.set(h.resource, (fixed.get(h.resource) ?? 0) + 1);
  const draw = shuffled(apportion(resolved.filter(h => !h.resource).length, weights, fixed, random), random);
  const drawn = resolved.map(h => ({ ...h, resource: h.resource ?? draw.pop() ?? 'any', drawn: !h.resource }));
  // "Not A" harbors: swap with another drawn harbor, or fall back to 3:1.
  valid.forEach((h, i) => {
    const not = h.notLink ? links.get(h.notLink) : undefined;
    if (!not || drawn[i]!.resource !== not || !drawn[i]!.drawn) return;
    const j = drawn.findIndex((d, k) => k !== i && d.drawn && d.resource !== not);
    if (j >= 0) [drawn[i]!.resource, drawn[j]!.resource] = [drawn[j]!.resource, drawn[i]!.resource];
    else drawn[i]!.resource = 'any';
  });
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
  const rich = islandRichness(unique);
  const producing = tiles
    .map(t => ({
      q: t.q,
      r: t.r,
      terrain: terrains.get(tileKey(t.q, t.r))!,
      pips: t.pips,
      rich: rich.get(tileKey(t.q, t.r)),
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
      bias: design.numberBias,
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
  const pirateHex = at(design.pirate);
  const pirate = pirateHex?.terrain === 'sea' ? pirateHex.id : farthestSea(board);
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

/**
 * What lies under each fog tile, drawn now and kept hidden (the face-down stack): a balanced draw
 * from the design's fog mix, and a number for any land that will produce.
 */
function drawFog(design: BoardDesign, board: Board, random: () => number): GameState['fog'] {
  const hexes = board.hexes.filter(h => h.terrain === 'fog');
  if (!hexes.length) return {};
  const weights = new Map(
    Object.entries(design.fogPool ?? FOG_POOL).filter(([, w]) => (w ?? 0) > 0) as [FogKind, number][],
  );
  if (!weights.size) for (const [k, w] of Object.entries(FOG_POOL)) weights.set(k as FogKind, w!);
  const kinds = design.fogExact
    ? exactFog(weights, hexes.length, random)
    : shuffled(apportion(hexes.length, weights, new Map(), random), random);
  const producing = kinds.filter(k => isProducing(k)).length;
  const mix = numberMix(0, !!design.noTwoTwelve);
  const numbers = shuffled(apportion(producing, mix, new Map(), random), random);
  return Object.fromEntries(
    hexes.map((hex, i) => {
      const terrain = kinds[i]!;
      return [hex.id, { terrain, number: isProducing(terrain) ? (numbers.pop() ?? null) : null }];
    }),
  );
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
