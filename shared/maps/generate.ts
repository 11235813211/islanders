import { buildGraph, hexCenter, shuffled } from '../board';
import { isLandTerrain, isProducing, isWater } from '../seafaring';
import { type Board, type Harbor, RESOURCES, type Resource, type Terrain } from '../types';
import { apportion, balancedNumbers, type Cell, clumping, neighborKeys } from './balance';
import { BASE_POOL, type BoardDesign, type DesignTile, type FillKind, SIDE_DIRECTIONS, tileKey } from './types';

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
  return groups;
}

/** Fill random land: linked groups first (each a block of one terrain), then single tiles spread out. */
function resolveTerrains(
  design: BoardDesign,
  random: () => number,
): { terrains: Map<string, Terrain>; links: Map<string, Terrain> } {
  const terrains = new Map<string, Terrain>();
  const groups = linkGroups(design);
  for (const tile of design.tiles) if (tile.kind !== 'land') terrains.set(tileKey(tile.q, tile.r), tile.kind);
  for (const g of groups.values())
    if (g.fixed) for (const tile of g.tiles) terrains.set(tileKey(tile.q, tile.r), g.fixed);

  const pool = new Map(
    Object.entries({ ...(design.pool ?? BASE_POOL) }).filter(([kind, w]) => kind !== 'sea' && (w ?? 0) > 0),
  ) as Map<FillKind, number>;
  if (!pool.size) for (const [k, w] of Object.entries(BASE_POOL)) pool.set(k as FillKind, w!);
  const fixedCounts = new Map<FillKind, number>();
  for (const terrain of terrains.values())
    if (pool.has(terrain as FillKind))
      fixedCounts.set(terrain as FillKind, (fixedCounts.get(terrain as FillKind) ?? 0) + 1);
  const open = design.tiles.filter(t => t.kind === 'land' && !terrains.has(tileKey(t.q, t.r)));
  const counts = new Map<FillKind, number>();
  for (const kind of apportion(open.length, pool, fixedCounts, random)) counts.set(kind, (counts.get(kind) ?? 0) + 1);

  const links = new Map<string, Terrain>();
  for (const [link, g] of groups) if (g.fixed) links.set(link, g.fixed);
  const openGroups = [...groups].filter(([, g]) => !g.fixed).sort((a, b) => b[1].tiles.length - a[1].tiles.length);
  for (const [link, g] of openGroups) {
    const size = g.tiles.filter(t => t.kind === 'land').length;
    const allowed = [...counts.keys()].filter(k => !g.harbor || RESOURCES.includes(k as Resource));
    const ranked = shuffled(allowed, random).sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
    const kind: FillKind = ranked[0] ?? shuffled(RESOURCES, random)[0]!;
    counts.set(kind, (counts.get(kind) ?? 0) - size);
    links.set(link, kind);
    for (const tile of g.tiles) if (tile.kind === 'land') terrains.set(tileKey(tile.q, tile.r), kind);
  }

  const singles = open.filter(t => !terrains.has(tileKey(t.q, t.r)));
  const bag = [...counts].flatMap(([k, n]) => Array<FillKind>(Math.max(0, n)).fill(k));
  const weighted = [...pool].flatMap(([k, w]) => Array<FillKind>(Math.max(1, Math.round(w))).fill(k));
  while (bag.length < singles.length) bag.push(weighted[Math.floor(random() * weighted.length)]!);
  let best: { cost: number; kinds: FillKind[] } | null = null;
  for (let attempt = 0; attempt < 24 && singles.length; attempt++) {
    const kinds = shuffled(bag, random).slice(0, singles.length);
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
    if (!land || isWater(land) || (across && !isWater(across)) || seen.has(edge)) return false;
    seen.add(edge);
    return true;
  });
  const resolved = valid.map(h => {
    const linked = h.link ? links.get(h.link) : undefined;
    const resource: Resource | 'any' | null =
      h.kind !== 'random' ? h.kind : linked && RESOURCES.includes(linked as Resource) ? (linked as Resource) : null;
    return { q: h.q, r: h.r, side: h.side, resource };
  });
  const weights = new Map(HARBOR_WEIGHTS.filter(([k]) => k === 'any' || !design.harborExclude.includes(k)));
  const fixed = new Map<Resource | 'any', number>();
  for (const h of resolved) if (h.resource) fixed.set(h.resource, (fixed.get(h.resource) ?? 0) + 1);
  const draw = shuffled(apportion(resolved.filter(h => !h.resource).length, weights, fixed, random), random);
  return resolved.map(h => ({ ...h, resource: h.resource ?? draw.pop() ?? 'any' }));
}

/** Connected land tiles get the same island number (1, 2, …). */
function markIslands(board: Board): void {
  const byKey = new Map(board.hexes.map(h => [tileKey(h.q, h.r), h]));
  let island = 0;
  for (const start of board.hexes) {
    if (isWater(start.terrain) || start.island !== undefined) continue;
    island++;
    const queue = [start];
    start.island = island;
    while (queue.length) {
      const hex = queue.pop()!;
      for (const k of neighborKeys(hex)) {
        const next = byKey.get(k);
        if (next && !isWater(next.terrain) && next.island === undefined) {
          next.island = island;
          queue.push(next);
        }
      }
    }
  }
}

/**
 * A playable board from a design: random land and numbers filled (balanced), harbors placed,
 * islands numbered, and the robber and pirate starting tiles. A fresh draw on every call.
 */
export function buildBoard(
  design: BoardDesign,
  random: () => number = Math.random,
): { board: Board; robber: string; pirate: string | null } {
  const tiles = [...new Map(design.tiles.map(t => [tileKey(t.q, t.r), t])).values()];
  const unique = { ...design, tiles };
  const { terrains, links } = resolveTerrains(unique, random);
  const producing = tiles
    .map(t => ({ q: t.q, r: t.r, terrain: terrains.get(tileKey(t.q, t.r))! }))
    .filter(c => isProducing(c.terrain));
  const fixed = new Map<string, number>();
  for (const t of tiles) {
    const valid = t.number && t.number >= 2 && t.number <= 12 && t.number !== 7;
    if (valid && isProducing(terrains.get(tileKey(t.q, t.r))!)) fixed.set(tileKey(t.q, t.r), t.number!);
  }
  const numbers = balancedNumbers(producing, fixed, random);
  const board = buildGraph(
    tiles.map(t => {
      const k = tileKey(t.q, t.r);
      return { q: t.q, r: t.r, terrain: terrains.get(k)!, number: numbers.get(k) ?? null };
    }),
  );
  markIslands(board);
  const byKey = new Map(board.hexes.map(h => [tileKey(h.q, h.r), h]));
  const closed = new Set<number>();
  for (const t of tiles) {
    const hex = byKey.get(tileKey(t.q, t.r))!;
    if (hex.island === undefined) continue;
    if (t.bonus) hex.bonus = Math.min(3, Math.max(1, Math.round(t.bonus)));
    if (t.noSetup) closed.add(hex.island);
  }
  for (const hex of board.hexes) if (hex.island !== undefined && closed.has(hex.island)) hex.noSetup = true;

  const edgeId = new Map(board.edges.map(e => [[e.a, e.b].sort().join(':'), e.id]));
  const vertex = new Map(board.vertices.map(v => [v.id, v]));
  board.harbors = resolveHarbors(unique, terrains, links, random).map((h, i): Harbor => {
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
  return { board, robber, pirate: pirateHex?.terrain === 'sea' ? pirateHex.id : null };
}
