import { BUILD_COSTS, emptyBag } from '../../engine/core';
import { isRoadEdge, isShipEdge } from '../../seafaring';
import { type Board, type GameView, RESOURCES, type ResourceBag } from '../../types';
import { COSTS } from '../analysis';

/** The board as roads see it, and the search for each seat's longest possible trail. */

/** New pieces we look ahead per seat. */
export const MAX_NEW = 6;
/** Steps of the trail search per seat, so a tangled network can't cost a whole move. */
export const SEARCH_LIMIT = 2500;
/** Every edge a road or ship can use, by index. */
export interface Graph {
  ids: string[];
  /** Each edge's two corners: `ends[2 * edge]` and `ends[2 * edge + 1]`. */
  ends: Int32Array;
  indexOf: Map<string, number>;
  ship: Uint8Array;
  /** Per corner: the edges a road or ship could use, and the corner each leads to. */
  links: { edge: number; to: number }[][];
}

/** Who holds what: edge owners and building owners by seat (-1: nobody). */
export interface World {
  edges: Int8Array;
  corners: Int8Array;
}

/** How far a seat's longest trail can grow. */
export interface RoadReach {
  /** Per number of new pieces (index): the longest trail possible. Never falls. */
  curve: number[];
  /** Per number of new pieces: the new edges of that trail, in building order. */
  paths: number[][];
  /** Per number of new pieces: the corners that trail passes through. */
  corners: number[][];
}

const graphs = new WeakMap<Board, Map<boolean, Graph>>();

/** The road graph of a board (kept per board). */
export function graphOf(view: GameView, cornerOf: Map<string, number>): Graph {
  let bySea = graphs.get(view.board);
  if (!bySea) {
    bySea = new Map();
    graphs.set(view.board, bySea);
  }
  let graph = bySea.get(view.seafaring);
  if (graph) return graph;
  const { board, seafaring } = view;
  const usable = board.edges.filter(e => isRoadEdge(board, e.id) || (seafaring && isShipEdge(board, e.id)));
  const links: Graph['links'] = board.vertices.map(() => []);
  const ship = new Uint8Array(usable.length);
  const ends = new Int32Array(usable.length * 2);
  usable.forEach((e, edge) => {
    const [a, b] = [cornerOf.get(e.a)!, cornerOf.get(e.b)!];
    ends[edge * 2] = a;
    ends[edge * 2 + 1] = b;
    links[a]!.push({ edge, to: b });
    links[b]!.push({ edge, to: a });
    ship[edge] = isRoadEdge(board, e.id) ? 0 : 1;
  });
  graph = { ids: usable.map(e => e.id), ends, indexOf: new Map(usable.map((e, i) => [e.id, i])), ship, links };
  bySea.set(seafaring, graph);
  return graph;
}

/** Who holds which edges and corners now. */
export function worldOf(view: GameView, graph: Graph, cornerOf: Map<string, number>): World {
  const seat = new Map(view.players.map((p, i) => [p.id, i]));
  const edges = new Int8Array(graph.ids.length).fill(-1);
  for (const pieces of [view.roads, view.ships])
    for (const [id, owner] of Object.entries(pieces)) {
      const e = graph.indexOf.get(id);
      if (e !== undefined) edges[e] = seat.get(owner) ?? -1;
    }
  const corners = new Int8Array(view.board.vertices.length).fill(-1);
  for (const [id, b] of Object.entries(view.buildings)) corners[cornerOf.get(id)!] = seat.get(b.playerId) ?? -1;
  return { edges, corners };
}

/** The best corner a trail passes, by `prefer`. */
function trailScore(prefer: Float64Array, corners: number[]): number {
  let best = 0;
  for (const c of corners) if (prefer[c]! > best) best = prefer[c]!;
  return best;
}

/**
 * The longest trail a seat can make with each number of new pieces. Among equally long trails,
 * `prefer` (a score per corner) picks the one passing the best corner.
 */
export function reachOf(
  graph: Graph,
  world: World,
  seat: number,
  pieces: number,
  depth = MAX_NEW,
  limit = SEARCH_LIMIT,
  prefer?: Float64Array,
): RoadReach {
  const most = Math.min(depth, pieces);
  const curve = new Array<number>(most + 1).fill(0);
  const scores = new Array<number>(most + 1).fill(0);
  const paths: number[][] = Array.from({ length: most + 1 }, () => []);
  const corners: number[][] = Array.from({ length: most + 1 }, () => []);
  const used = new Uint8Array(world.edges.length);
  const fresh: number[] = [];
  const visited: number[] = [];
  let steps = 0;
  const walk = (c: number, length: number, paid: number) => {
    visited.push(c);
    const score = prefer && length >= curve[paid]! ? trailScore(prefer, visited) : 0;
    if (length > curve[paid]! || (length > 0 && length === curve[paid]! && score > scores[paid]!)) {
      curve[paid] = length;
      scores[paid] = score;
      paths[paid] = [...fresh];
      corners[paid] = [...visited];
    }
    const blocked = length > 0 && world.corners[c]! >= 0 && world.corners[c] !== seat;
    if (!blocked)
      for (const { edge, to } of graph.links[c]!) {
        if (used[edge] || steps > limit) continue;
        const owner = world.edges[edge]!;
        const free = owner === -1 && paid < most;
        if (owner !== seat && !free) continue;
        steps++;
        used[edge] = 1;
        if (free) fresh.push(edge);
        walk(to, length + 1, paid + (free ? 1 : 0));
        if (free) fresh.pop();
        used[edge] = 0;
      }
    visited.pop();
  };
  for (let c = 0; c < graph.links.length; c++) {
    const touches = world.corners[c] === seat || graph.links[c]!.some(l => world.edges[l.edge] === seat);
    if (touches) walk(c, 0, 0);
  }
  for (let p = 1; p <= most; p++)
    if (curve[p]! < curve[p - 1]!) {
      curve[p] = curve[p - 1]!;
      paths[p] = paths[p - 1]!;
      corners[p] = corners[p - 1]!;
    }
  return { curve, paths, corners };
}

/** What these new pieces cost. */
export function pathCost(graph: Graph, path: number[]): ResourceBag {
  const cost = emptyBag();
  for (const edge of path) {
    const piece = graph.ship[edge] ? BUILD_COSTS.ship : COSTS.road;
    for (const r of RESOURCES) cost[r] += piece[r];
  }
  return cost;
}
