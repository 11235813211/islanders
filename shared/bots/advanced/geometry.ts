import { trainCorners } from '../../maps/candy-board';
import {
  boardIndex,
  isLandVertex,
  islandBonus,
  isRoadEdge,
  isShipEdge,
  terrainResource,
  vertexIsland,
} from '../../seafaring';
import { type Board, CLASSIC_RESOURCES, type GameView, type Resource } from '../../types';
import { hexPips, pips } from '../analysis';

/**
 * A resource's slot among the five the trained network knows, or -1 for lodestone (Cartographers),
 * which the Advanced bot's setup and network don't see.
 */
export const classicSlot = (resource: string): number => (CLASSIC_RESOURCES as readonly string[]).indexOf(resource);

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
  /** Free-choice pips: gold fields, plus candy train stops at `trainShare` (see addTrains). */
  gold: Float32Array;
  /** Candy train stops alone (already in `gold`): the train number's pips, less toward the end. */
  train: Float32Array;
  /** Lodestone pips (Cartographers), kept apart from the five the network knows. */
  lodestone: Float32Array;
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

const cache = new WeakMap<Board, Map<string, Geometry>>();

/**
 * The board's geometry; `seafaring` says whether ships may carry routes over water. `trainShare`
 * (knob trainSpot) is what a candy train stop's pip is worth next to a gold field's.
 */
export function geometry(view: GameView, trainShare: number): Geometry {
  let byRule = cache.get(view.board);
  if (!byRule) {
    byRule = new Map();
    cache.set(view.board, byRule);
  }
  const trains = view.settings.christmasCandy ? trainShare : 0;
  const key = `${view.seafaring}|${trains}`;
  let geo = byRule.get(key);
  if (!geo) {
    geo = build(view.board, view.seafaring);
    addTrains(geo, view.board, trains);
    byRule.set(key, geo);
  }
  return geo;
}

/** Share of a stop's worth left at the end of a track: later picks choose from fewer cards. */
const TRAIN_END = 0.7;

/**
 * Candy trains as gold: a building on a track takes a card of its choice (a city two) whenever the
 * train's number is rolled, like a gold field with that number. The first picks choose from the
 * most cards, so stops count less toward the end of the line.
 */
function addTrains(geo: Geometry, board: Board, share: number): void {
  if (share <= 0) return;
  for (const train of board.trains ?? []) {
    const corners = trainCorners(train);
    corners.forEach((id, i) => {
      const c = geo.indexOf.get(id);
      if (c === undefined) return;
      const along = corners.length > 1 ? i / (corners.length - 1) : 0;
      const p = pips(train.number) * share * (1 - (1 - TRAIN_END) * along);
      geo.train[c]! += p;
      geo.gold[c]! += p;
    });
  }
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
    train: new Float32Array(n),
    lodestone: new Float32Array(n),
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
      // Charted numbers count (Cartographers): the board object changes when a tile is charted.
      const p = hexPips(hex);
      if (hex.terrain === 'sea' || hex.terrain === 'iceberg') geo.coast[c] = 1;
      if (!p) continue;
      const resource = terrainResource(hex.terrain);
      if (resource) {
        // A split tile pays either of its two resources: half each.
        const halves = hex.split ? [resource, hex.split] : [resource];
        for (const r of halves) addPips(geo, c, r, p / halves.length);
      } else if (hex.terrain === 'gold') geo.gold[c]! += p;
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
    const slot = classicSlot(terrainResource(hex.terrain) ?? '');
    if (slot >= 0) geo.boardPips[slot]! += pips(hex.number);
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

/** Pips of one resource at corner `c`: the five classic ones by slot, lodestone apart. */
function addPips(geo: Geometry, c: number, resource: Resource, p: number): void {
  const slot = classicSlot(resource);
  if (slot >= 0) geo.pips[c * 5 + slot]! += p;
  else geo.lodestone[c]! += p;
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
