import {
  boardIndex,
  isLandVertex,
  islandBonus,
  isRoadEdge,
  isShipEdge,
  terrainResource,
  vertexIsland,
} from '../../seafaring';
import { type Board, type GameView, RESOURCES, type Resource } from '../../types';
import { pips } from '../analysis';

/**
 * What never changes about a board during a game, worked out once per board object and per
 * Seafarers rule (boards are shared between states and views, so this cache hits on every move):
 * each corner's dice odds by resource, harbor, island, and piece distances between all corners.
 *
 * Everything is by corner index (board.vertices order) in typed arrays, so the setup lookahead
 * can score hundreds of positions cheaply.
 */
export interface Geometry {
  ids: string[];
  indexOf: Map<string, number>;
  /** Pips per resource per corner: pips[c * 5 + r]. The robber is ignored here. */
  pips: Float32Array;
  gold: Float32Array;
  volcano: Float32Array;
  jungle: Float32Array;
  /** Distinct numbers touching each corner (for spread). */
  numbers: number[][];
  /** Hex ids around each corner that produce something. */
  hexes: string[][];
  harbor: (Resource | 'any' | null)[];
  island: (number | null)[];
  /** Island bonus points for first settling the corner's island (0 when none). */
  bonus: Float32Array;
  /** No starting settlement may go here (a closed island or a marked corner). Volcanoes are separate. */
  noSetup: Uint8Array;
  /** Touches a volcano. */
  nearVolcano: Uint8Array;
  land: Uint8Array;
  /** Corner touches water (a ship can start here). */
  coast: Uint8Array;
  /** Corners joined by an edge a road or ship could take. */
  neighbors: number[][];
  /** Corners joined by any edge (the distance rule). */
  adjacent: number[][];
  /** Fewest new roads/ships between two corners (255: unreachable), ignoring other players. */
  distance: Uint8Array;
  /** Pips per resource across the whole board, for scarcity. */
  boardPips: Float32Array;
  n: number;
}

const cache = new WeakMap<Board, Map<boolean, Geometry>>();

/** The board's geometry; `seafaring` says whether ships may carry routes over water. */
export function geometry(view: GameView): Geometry {
  let byRule = cache.get(view.board);
  if (!byRule) {
    byRule = new Map();
    cache.set(view.board, byRule);
  }
  let geo = byRule.get(view.seafaring);
  if (!geo) {
    geo = build(view.board, view.seafaring);
    byRule.set(view.seafaring, geo);
  }
  return geo;
}

function build(board: Board, seafaring: boolean): Geometry {
  const index = boardIndex(board);
  const n = board.vertices.length;
  const ids = board.vertices.map(v => v.id);
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  const geo: Geometry = {
    ids,
    indexOf,
    pips: new Float32Array(n * 5),
    gold: new Float32Array(n),
    volcano: new Float32Array(n),
    jungle: new Float32Array(n),
    numbers: [],
    hexes: [],
    harbor: Array(n).fill(null),
    island: [],
    bonus: new Float32Array(n),
    noSetup: new Uint8Array(n),
    nearVolcano: new Uint8Array(n),
    land: new Uint8Array(n),
    coast: new Uint8Array(n),
    neighbors: [],
    adjacent: [],
    distance: new Uint8Array(n * n).fill(255),
    boardPips: new Float32Array(5),
    n,
  };
  for (const h of board.harbors) for (const v of h.vertices) geo.harbor[indexOf.get(v)!] = h.resource;
  board.vertices.forEach((v, c) => {
    const numbers = new Set<number>();
    const hexes: string[] = [];
    for (const hexId of v.hexIds) {
      const hex = index.hex.get(hexId)!;
      if (hex.noSetup) geo.noSetup[c] = 1;
      if (hex.terrain === 'volcano') geo.nearVolcano[c] = 1;
      const p = pips(hex.number);
      if (hex.terrain === 'sea' || hex.terrain === 'iceberg') geo.coast[c] = 1;
      if (!p) continue;
      const resource = terrainResource(hex.terrain);
      if (resource) geo.pips[c * 5 + RESOURCES.indexOf(resource)]! += p;
      else if (hex.terrain === 'gold') geo.gold[c]! += p;
      else if (hex.terrain === 'volcano') geo.volcano[c]! += p;
      else if (hex.terrain === 'jungle') geo.jungle[c]! += p;
      else continue;
      numbers.add(hex.number!);
      hexes.push(hexId);
    }
    geo.numbers.push([...numbers]);
    geo.hexes.push(hexes);
    geo.land[c] = isLandVertex(board, v.id) ? 1 : 0;
    const island = vertexIsland(board, v.id);
    geo.island.push(island);
    if (island !== null) geo.bonus[c] = islandBonus(board, island);
    if (v.noSetup) geo.noSetup[c] = 1;
    if (!seafaring) geo.coast[c] = 0;
  });
  for (const hex of board.hexes) {
    const resource = terrainResource(hex.terrain);
    if (resource) geo.boardPips[RESOURCES.indexOf(resource)]! += pips(hex.number);
  }
  // Corners joined by an edge a road or ship could take.
  for (const v of board.vertices) {
    geo.adjacent.push(
      v.edgeIds.map(id => {
        const e = index.edge.get(id)!;
        return indexOf.get(e.a === v.id ? e.b : e.a)!;
      }),
    );
    geo.neighbors.push(
      v.edgeIds
        .filter(id => isRoadEdge(board, id) || (seafaring && isShipEdge(board, id)))
        .map(id => {
          const e = index.edge.get(id)!;
          return indexOf.get(e.a === v.id ? e.b : e.a)!;
        }),
    );
  }
  const queue = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    const row = s * n;
    geo.distance[row + s] = 0;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    while (head < tail) {
      const c = queue[head++]!;
      const d = geo.distance[row + c]!;
      if (d >= 254) continue;
      for (const m of geo.neighbors[c]!) {
        if (geo.distance[row + m] !== 255) continue;
        geo.distance[row + m] = d + 1;
        queue[tail++] = m;
      }
    }
  }
  return geo;
}

/** Total pips at a corner (resources, gold, volcano, jungle). */
export function cornerPips(geo: Geometry, c: number): number {
  let sum = geo.gold[c]! + geo.volcano[c]! + geo.jungle[c]!;
  for (let r = 0; r < 5; r++) sum += geo.pips[c * 5 + r]!;
  return sum;
}

/** Fewest pieces from any of `from` to corner `c`. */
export function distanceFrom(geo: Geometry, from: readonly number[], c: number): number {
  let best = 255;
  for (const s of from) best = Math.min(best, geo.distance[s * geo.n + c]!);
  return best;
}

/** Corners where a settlement could still go: land, empty, and no building next door. */
export function openCorners(geo: Geometry, occupied: Uint8Array): number[] {
  const open: number[] = [];
  for (let c = 0; c < geo.n; c++) if (geo.land[c] && isOpen(geo, occupied, c)) open.push(c);
  return open;
}

/** Empty, with no building on a neighboring corner. */
export function isOpen(geo: Geometry, occupied: Uint8Array, c: number): boolean {
  if (occupied[c]) return false;
  for (const m of geo.adjacent[c]!) if (occupied[m]) return false;
  return true;
}
