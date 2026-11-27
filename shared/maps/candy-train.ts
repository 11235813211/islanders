import { hexCenter, hexCorner } from '../board';
import { pips } from './balance';
import type { BoardDesign, CandyRoute, DesignTile } from './types';

export const CANDY_LIMITS = { routes: 4, corners: 80 } as const;
/** Dots a train's number may have, as on number tokens; the editor picks one per route. */
export const TRAIN_DOTS = [1, 2, 3, 4, 5] as const;
/** Dots of a route without its own (a 4 or a 10). */
export const DEFAULT_TRAIN_DOTS = 3;
/** The two rolls with `dots` dots: 1 → 2 and 12, 5 → 6 and 8. */
export const numbersWithDots = (dots: number): [number, number] => [1 + dots, 13 - dots];
/** A train's number for one game: either roll with the route's dots. */
export const trainNumber = (random: () => number, dots: number = DEFAULT_TRAIN_DOTS): number =>
  numbersWithDots(dots)[random() < 0.5 ? 0 : 1];
export interface RailPoint {
  x: number;
  y: number;
}
export interface RailCorner extends RailPoint {
  key: string;
  neighbors: Set<string>;
}
const positionKey = (p: RailPoint) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
const isLand = (tile: DesignTile) => !['sea', 'iceberg', 'fog'].includes(tile.kind);
const pixelKey = (p: RailPoint) => `${Math.round(p.x)},${Math.round(p.y)}`;
/** Center of a hex to the middle of a side: how far across an edge the neighboring tile's center lies. */
const APOTHEM = (() => {
  const a = hexCorner(0, 0, 0);
  const b = hexCorner(0, 0, 1);
  return Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2);
})();

/** One canonical key per physical corner, with edges restricted to land tiles. */
export function candyGraph(tiles: DesignTile[]): Map<string, RailCorner> {
  const physical = new Map<string, RailCorner>();
  const graph = new Map<string, RailCorner>();
  for (const tile of tiles) {
    if (!isLand(tile)) continue;
    const center = hexCenter(tile.q, tile.r);
    const corners = Array.from({ length: 6 }, (_, c) => {
      const p = hexCorner(center.x, center.y, c);
      const key = `${tile.q},${tile.r},${c}`;
      let corner = physical.get(positionKey(p));
      if (!corner) {
        corner = { ...p, key, neighbors: new Set() };
        physical.set(positionKey(p), corner);
      }
      graph.set(key, corner);
      return corner;
    });
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % 6]!;
      a.neighbors.add(b.key);
      b.neighbors.add(a.key);
    });
  }
  return graph;
}

/**
 * Rails sit RAIL_OFFSET to one `side` of the route's edges (left of travel for 1, as railPath draws
 * them), so each edge needs land on that side, or the track runs in the sea.
 */
export function railSideIsLand(tiles: DesignTile[], a: RailPoint, b: RailPoint, side: 1 | -1): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const center = {
    x: (a.x + b.x) / 2 + (-(b.y - a.y) / d) * side * APOTHEM,
    y: (a.y + b.y) / 2 + ((b.x - a.x) / d) * side * APOTHEM,
  };
  const key = pixelKey(center);
  return tiles.some(t => isLand(t) && pixelKey(hexCenter(t.q, t.r)) === key);
}

/** Whether every edge of `corners` has land on `side`. */
function railDry(tiles: DesignTile[], graph: Map<string, RailCorner>, corners: string[], side: 1 | -1): boolean {
  return corners.slice(1).every((key, i) => railSideIsLand(tiles, graph.get(corners[i]!)!, graph.get(key)!, side));
}

/**
 * Corners the route can grow to from its last corner (all corners while it is empty). The first
 * edge may go either way, since its side is picked to suit it; later ones need land on the rail side.
 */
export function candyExtensions(design: BoardDesign, index: number): string[] {
  const route = design.candyRoutes?.[index];
  if (!route || route.corners.length >= CANDY_LIMITS.corners) return [];
  const graph = candyGraph(design.tiles);
  const keys = route.corners.map(k => graph.get(k)?.key);
  const last = keys.at(-1) ? graph.get(keys.at(-1)!) : undefined;
  if (!last) return [...new Set([...graph.values()].map(p => p.key))];
  return [...last.neighbors].filter(
    key =>
      !keys.includes(key) && (keys.length === 1 || railSideIsLand(design.tiles, last, graph.get(key)!, route.side)),
  );
}

/** Extend a route one edge, or trim back to an already selected corner. */
export function extendCandyRoute(design: BoardDesign, index: number, key: string): BoardDesign {
  const routes = design.candyRoutes ?? [];
  const route = routes[index];
  if (!route) return design;
  const graph = candyGraph(design.tiles);
  const corner = graph.get(key);
  if (!corner) return design;
  const canonical = route.corners.map(k => graph.get(k)?.key);
  const existing = canonical.indexOf(corner.key);
  if (existing >= 0)
    return replaceCandyRoute(design, index, { ...route, corners: route.corners.slice(0, existing + 1) });
  if (!candyExtensions(design, index).includes(corner.key)) return design;
  const first = route.corners.length === 1 ? graph.get(canonical[0]!) : undefined;
  // The first edge picks the side with land; the rest of the route keeps it.
  const side = first && !railSideIsLand(design.tiles, first, corner, route.side) ? (-route.side as 1 | -1) : route.side;
  return replaceCandyRoute(design, index, { ...route, side, corners: [...route.corners, corner.key] });
}

/** Whether the route's rails can switch to its other side without running into the sea. */
export function canFlipRail(design: BoardDesign, index: number): boolean {
  const route = design.candyRoutes?.[index];
  if (!route) return false;
  return railDry(design.tiles, candyGraph(design.tiles), route.corners, -route.side as 1 | -1);
}

/**
 * Where a tap or drag at `p` takes the route: the corner past the nearer half of a highlighted
 * edge, an earlier corner to trim back to, or (while empty) the corner to start at. `reach` is how
 * close the point must be; a drag passes a smaller one so it extends only once past an edge's middle.
 */
export function candyStepAt(design: BoardDesign, index: number, p: RailPoint, reach = 26): string | null {
  const route = design.candyRoutes?.[index];
  if (!route) return null;
  const graph = candyGraph(design.tiles);
  const keys = route.corners.map(k => graph.get(k)?.key).filter((k): k is string => !!k);
  const last = keys.length ? graph.get(keys.at(-1)!)! : undefined;
  let best: string | null = null;
  let distance = reach;
  const consider = (key: string, d: number) => {
    if (d < distance) {
      best = key;
      distance = d;
    }
  };
  for (const key of candyExtensions(design, index)) {
    const b = graph.get(key)!;
    if (!last) consider(key, Math.hypot(p.x - b.x, p.y - b.y));
    else consider(key, segmentDistance(p, { x: (last.x + b.x) / 2, y: (last.y + b.y) / 2 }, b));
  }
  for (const key of keys.slice(0, -1)) {
    const c = graph.get(key)!;
    consider(key, Math.hypot(p.x - c.x, p.y - c.y));
  }
  return best;
}

function segmentDistance(p: RailPoint, a: RailPoint, b: RailPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/**
 * A route on land after its tiles change: if its rails now run in the sea but the other side is
 * dry, they switch sides; otherwise it keeps the part up to its first wet edge.
 */
function keepDry(tiles: DesignTile[], graph: Map<string, RailCorner>, route: CandyRoute): CandyRoute {
  if (railDry(tiles, graph, route.corners, route.side)) return route;
  const other = -route.side as 1 | -1;
  if (railDry(tiles, graph, route.corners, other)) return { ...route, side: other };
  const wet = route.corners
    .slice(1)
    .findIndex((key, i) => !railSideIsLand(tiles, graph.get(route.corners[i]!)!, graph.get(key)!, route.side));
  return { ...route, corners: route.corners.slice(0, wet + 1) };
}

/** Update one railway while preserving the editor's snapshot undo history. */
export function replaceCandyRoute(design: BoardDesign, index: number, route: CandyRoute): BoardDesign {
  return { ...design, candyRoutes: design.candyRoutes?.map((r, i) => (i === index ? route : r)) };
}

/** Reject malformed, oversized, disconnected, or self-intersecting saved routes; keep their rails off the sea. */
export function parseCandyRoutes(value: unknown, tiles: DesignTile[]): CandyRoute[] {
  if (!Array.isArray(value) || value.length > CANDY_LIMITS.routes)
    throw new Error('Use at most four candy train routes.');
  const graph = candyGraph(tiles);
  return value.map(v => {
    if (!v || (v.side !== 1 && v.side !== -1) || !Array.isArray(v.corners) || v.corners.length > CANDY_LIMITS.corners)
      throw new Error('Invalid candy train route.');
    const seen = new Set<string>();
    let last: RailCorner | undefined;
    const corners = v.corners.map((key: unknown) => {
      const p = typeof key === 'string' ? graph.get(key) : undefined;
      if (!p || seen.has(p.key) || (last && !last.neighbors.has(p.key)))
        throw new Error('Candy train routes must follow connected land edges without crossing themselves.');
      seen.add(p.key);
      last = p;
      return p.key;
    });
    // Boards saved before dots set a number; it keeps its dots.
    const dots = v.dots ?? (Number.isInteger(v.number) && v.number !== 7 ? pips(v.number) : undefined);
    if (dots !== undefined && !TRAIN_DOTS.includes(dots)) throw new Error('Invalid candy train dots.');
    return keepDry(tiles, graph, { corners, side: v.side, ...(dots !== undefined ? { dots } : {}) });
  });
}

/** Tile erasure keeps only the connected, dry prefix, never a track through missing land or over the sea. */
export function tidyCandyRoutes(design: BoardDesign): Pick<BoardDesign, 'candyRoutes'> {
  if (!design.candyRoutes) return {};
  const graph = candyGraph(design.tiles);
  const physical = new Map([...graph.values()].map(p => [positionKey(p), p]));
  return {
    candyRoutes: design.candyRoutes.map(route => {
      const corners: string[] = [];
      for (const key of route.corners) {
        // Another land tile may still own this corner after its original tile is erased.
        const [q, r, c] = key.split(',').map(Number) as [number, number, number];
        const center = hexCenter(q, r);
        const p = graph.get(key) ?? physical.get(positionKey(hexCorner(center.x, center.y, c)));
        const last = corners.at(-1);
        if (!p || (last && !graph.get(last)?.neighbors.has(p.key))) break;
        corners.push(p.key);
      }
      return keepDry(design.tiles, graph, { ...route, corners });
    }),
  };
}
