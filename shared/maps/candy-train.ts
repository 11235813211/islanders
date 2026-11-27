import { hexCenter, hexCorner } from '../board';
import type { BoardDesign, CandyRoute, DesignTile } from './types';

export const CANDY_LIMITS = { routes: 4, corners: 80 } as const;
/** Numbers a train may be given in the editor (any roll but 7). */
export const CANDY_NUMBERS: readonly number[] = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
/** What an unset train number draws from each game. */
export const CANDY_DEFAULT_NUMBERS = [4, 10] as const;
export interface RailPoint {
  x: number;
  y: number;
}
export interface RailCorner extends RailPoint {
  key: string;
  neighbors: Set<string>;
}
const positionKey = (p: RailPoint) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;

/** One canonical key per physical corner, with edges restricted to land tiles. */
export function candyGraph(tiles: DesignTile[]): Map<string, RailCorner> {
  const physical = new Map<string, RailCorner>();
  const graph = new Map<string, RailCorner>();
  for (const tile of tiles) {
    if (['sea', 'iceberg', 'fog'].includes(tile.kind)) continue;
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

/** Select a corner near a tap; a generous radius keeps the editor usable on phones. */
export function candyCornerAt(design: BoardDesign, p: RailPoint): string | null {
  let best: RailCorner | undefined;
  let distance = 30;
  for (const corner of candyGraph(design.tiles).values()) {
    const d = Math.hypot(p.x - corner.x, p.y - corner.y);
    if (d < distance) {
      best = corner;
      distance = d;
    }
  }
  return best?.key ?? null;
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
  const last = canonical.at(-1);
  if (route.corners.length >= CANDY_LIMITS.corners || (last && !graph.get(last)?.neighbors.has(corner.key)))
    return design;
  return replaceCandyRoute(design, index, { ...route, corners: [...route.corners, corner.key] });
}

/** Update one railway while preserving the editor's snapshot undo history. */
export function replaceCandyRoute(design: BoardDesign, index: number, route: CandyRoute): BoardDesign {
  return { ...design, candyRoutes: design.candyRoutes?.map((r, i) => (i === index ? route : r)) };
}

/** Reject malformed, oversized, disconnected, or self-intersecting saved routes. */
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
    if (v.number !== undefined && !CANDY_NUMBERS.includes(v.number)) throw new Error('Invalid candy train number.');
    return { corners, side: v.side, ...(v.number !== undefined ? { number: v.number } : {}) };
  });
}

/** Tile erasure keeps only the connected prefix, never a track through missing land. */
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
      return { ...route, corners };
    }),
  };
}
