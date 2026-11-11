import { type Board, type Edge, type Hex, RESOURCES, type Resource, type Terrain, type Vertex } from './types';

/**
 * Board geometry for sea maps, shared by the engine, bots, and the client. On the standard
 * island every tile is land, so these rules reduce to the base game's.
 */

export const isWater = (terrain: Terrain) => terrain === 'sea' || terrain === 'iceberg';
/** Fog is neither: nothing is built beside it until it is revealed. */
export const isLandTerrain = (terrain: Terrain) => !isWater(terrain) && terrain !== 'fog';
/** Terrains that carry a number token: the producing ones, and icebergs (whose number makes them drift). */
export const takesToken = (terrain: Terrain) => isProducing(terrain) || terrain === 'iceberg';
/** Terrains that pay something when their number is rolled. */
export const isProducing = (terrain: Terrain) =>
  RESOURCES.includes(terrain as Resource) || terrain === 'gold' || terrain === 'jungle' || terrain === 'volcano';
/** Gold fields and volcanoes let each owner pick a resource. */
export const paysChoice = (terrain: Terrain) => terrain === 'gold' || terrain === 'volcano';
export const terrainResource = (terrain: Terrain): Resource | null =>
  RESOURCES.includes(terrain as Resource) ? (terrain as Resource) : null;

/** Die face (1–6) → the volcano corner that erupts. Faces run clockwise from the top corner. */
export const ERUPTION_CORNER = [4, 5, 0, 1, 2, 3] as const;

export interface BoardIndex {
  hex: Map<string, Hex>;
  vertex: Map<string, Vertex>;
  edge: Map<string, Edge>;
  /** Hexes on either side of each edge (one on the map border). */
  edgeHexes: Map<string, Hex[]>;
  /** The map has sea tiles: ships and the pirate are in play. */
  seafaring: boolean;
}

const indexes = new WeakMap<Board, BoardIndex>();

/** Lookup tables for a board, built once per board object. */
export function boardIndex(board: Board): BoardIndex {
  const cached = indexes.get(board);
  if (cached) return cached;
  const hex = new Map(board.hexes.map(h => [h.id, h]));
  const vertex = new Map(board.vertices.map(v => [v.id, v]));
  const edge = new Map(board.edges.map(e => [e.id, e]));
  const edgeHexes = new Map<string, Hex[]>();
  for (const e of board.edges) {
    const other = vertex.get(e.b)!.hexIds;
    edgeHexes.set(
      e.id,
      vertex
        .get(e.a)!
        .hexIds.filter(id => other.includes(id))
        .map(id => hex.get(id)!),
    );
  }
  const index = { hex, vertex, edge, edgeHexes, seafaring: board.hexes.some(h => h.terrain === 'sea') };
  indexes.set(board, index);
  return index;
}

/** A corner where a settlement may stand: it touches land. */
export function isLandVertex(board: Board, vertexId: string): boolean {
  const index = boardIndex(board);
  return index.vertex.get(vertexId)!.hexIds.some(id => isLandTerrain(index.hex.get(id)!.terrain));
}

/** Roads run along edges that touch land. */
export function isRoadEdge(board: Board, edgeId: string): boolean {
  return boardIndex(board)
    .edgeHexes.get(edgeId)!
    .some(h => isLandTerrain(h.terrain));
}

/** Ships sail along edges beside water. Icebergs are water too, but one that drifts sinks the ship beside it. */
export function isShipEdge(board: Board, edgeId: string): boolean {
  const index = boardIndex(board);
  if (!index.seafaring) return false;
  return index.edgeHexes.get(edgeId)!.some(h => isWater(h.terrain));
}

/** The island a corner belongs to, or null for open water. */
export function vertexIsland(board: Board, vertexId: string): number | null {
  const index = boardIndex(board);
  for (const id of index.vertex.get(vertexId)!.hexIds) {
    const h = index.hex.get(id)!;
    if (h.island !== undefined) return h.island;
  }
  return null;
}

const bonuses = new WeakMap<Board, Map<number, number>>();

/** Bonus points for first settling an island (the largest chip on any of its tiles). Cached per board. */
export function islandBonus(board: Board, island: number): number {
  let byIsland = bonuses.get(board);
  if (!byIsland) {
    byIsland = new Map();
    for (const h of board.hexes)
      if (h.island !== undefined) byIsland.set(h.island, Math.max(byIsland.get(h.island) ?? 0, h.bonus ?? 0));
    bonuses.set(board, byIsland);
  }
  return byIsland.get(island) ?? 0;
}

/** The other end of an edge. */
export function otherEnd(edge: Edge, vertexId: string): string {
  return edge.a === vertexId ? edge.b : edge.a;
}
