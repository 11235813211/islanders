import type { Economy } from './economy';
import { frontierSpots } from './plans';
import type { Graph, World } from './road-graph';

/**
 * Where roads and settlements help each other. A settlement route can lengthen the longest road,
 * and a road can bring an open corner closer, so neither has to be a separate goal.
 */

/** Spots further than this many pieces away don't count as opened by a road. */
const FARTHEST_SPOT = 6;

/**
 * The new pieces of a route: `firstEdge`, then the cheapest way on to `corner` over free edges and
 * our own, never through a rival's building. Null if that takes more than `pieces`.
 */
export function routeEdges(
  graph: Graph,
  world: World,
  me: number,
  firstEdge: string | null,
  corner: number,
  pieces: number,
): number[] | null {
  const first = firstEdge === null ? undefined : graph.indexOf.get(firstEdge);
  if (first === undefined) return null;
  const n = graph.links.length;
  const cost = new Int16Array(n).fill(32767);
  const nextEdge = new Int32Array(n).fill(-1);
  const nextCorner = new Int32Array(n).fill(-1);
  cost[corner] = 0;
  let level = [corner];
  for (let spent = 0; level.length && spent <= pieces; spent++) {
    const later: number[] = [];
    while (level.length) {
      const c = level.pop()!;
      if (cost[c]! !== spent) continue;
      if (c !== corner && world.corners[c]! >= 0 && world.corners[c] !== me) continue;
      for (const { edge, to } of graph.links[c]!) {
        const owner = world.edges[edge]!;
        if (owner !== -1 && owner !== me) continue;
        const step = owner === me ? 0 : 1;
        if (spent + step >= cost[to]!) continue;
        cost[to] = spent + step;
        nextEdge[to] = edge;
        nextCorner[to] = c;
        (step ? later : level).push(to);
      }
    }
    level = later;
  }
  const [a, b] = [graph.ends[first * 2]!, graph.ends[first * 2 + 1]!];
  let at = cost[a]! <= cost[b]! ? a : b;
  if (cost[at]! + 1 > pieces) return null;
  const route = [first];
  while (at !== corner) {
    const edge = nextEdge[at]!;
    if (world.edges[edge] === -1 && edge !== first) route.push(edge);
    at = nextCorner[at]!;
  }
  return route;
}

/**
 * Per corner: what a road reaching it opens up. The best open spot it brings closer, in points,
 * by the share of the way it covers and our odds of getting there first.
 */
export function openWeights(econ: Economy, graph: Graph): Float64Array {
  const { geo } = econ;
  const weights = new Float64Array(graph.links.length);
  for (const spot of frontierSpots(econ)) {
    if (spot.ours > FARTHEST_SPOT) continue;
    for (let c = 0; c < weights.length; c++) {
      const left = geo.distance[c * geo.n + spot.corner]!;
      if (left >= spot.ours) continue;
      const value = (spot.gain * econ.raceFactor(spot.corner, left) * (spot.ours - left)) / spot.ours;
      if (value > weights[c]!) weights[c] = value;
    }
  }
  return weights;
}
