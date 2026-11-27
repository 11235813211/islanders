// A generated candy train for boards whose map has no routes (the standard island, or a design
// drawn without any). One snaking track covering about 1/7 of the corners, its rails always on
// the land side of each edge (railPath draws them to the leg's `side`). Sea maps split it into a few legs on different
// islands (the train tunnels from one to the next), so more of the table can reach it.
import { isLandTerrain } from '../seafaring';
import type { Board, CandyTrain } from '../types';
import { defaultTrainNumber } from './candy-train';

/** Share of the board's corners the track runs past. */
const COVER = 1 / 7;
/** Walks tried per leg; the snakiest that reaches its length wins. */
const TRIES = 60;
/** Turns the same way in a row before the track must bend back (three would circle a tile). */
const MAX_RUN = 2;
/** Most legs on a sea map, each on its own island where there are enough. */
const SEA_LEGS = 3;

interface Graph {
  /** Corner → corners one edge with land beside it away, with the land tiles' centers. */
  next: Map<string, string[]>;
  land: Map<string, { x: number; y: number }[]>;
  /** Corner → every corner one edge away (to keep the track from touching itself). */
  touching: Map<string, string[]>;
  at: Map<string, { x: number; y: number }>;
}

const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The board's corners joined by edges with land beside them, and which land tiles each edge has. */
function landGraph(board: Board): Graph {
  const land = new Map(board.hexes.filter(h => isLandTerrain(h.terrain)).map(h => [h.id, h]));
  const vertices = new Map(board.vertices.map(v => [v.id, v]));
  const next = new Map<string, string[]>();
  const touching = new Map<string, string[]>();
  const beside = new Map<string, { x: number; y: number }[]>();
  for (const edge of board.edges) {
    const a = vertices.get(edge.a)!;
    const b = vertices.get(edge.b)!;
    touching.set(a.id, [...(touching.get(a.id) ?? []), b.id]);
    touching.set(b.id, [...(touching.get(b.id) ?? []), a.id]);
    const tiles = a.hexIds.filter(id => b.hexIds.includes(id) && land.has(id)).map(id => land.get(id)!);
    if (!tiles.length) continue;
    beside.set(edgeKey(a.id, b.id), tiles);
    next.set(a.id, [...(next.get(a.id) ?? []), b.id]);
    next.set(b.id, [...(next.get(b.id) ?? []), a.id]);
  }
  return { next, land: beside, touching, at: vertices };
}

/** Whether going a → b, the rails on `side` (left of travel for 1, as railPath) are over land. */
function dry(graph: Graph, a: string, b: string, side: 1 | -1): boolean {
  const p = graph.at.get(a)!;
  const q = graph.at.get(b)!;
  return (graph.land.get(edgeKey(a, b)) ?? []).some(
    h => ((h.x - (p.x + q.x) / 2) * -(q.y - p.y) + (h.y - (p.y + q.y) / 2) * (q.x - p.x)) * side > 0,
  );
}

/** Which way the track turns at `b` coming from `a` and going on to `c`: 1 or -1. */
function turn(graph: Graph, a: string, b: string, c: string): number {
  const p = graph.at.get(a)!;
  const q = graph.at.get(b)!;
  const r = graph.at.get(c)!;
  return Math.sign((q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x));
}

/**
 * One self-avoiding walk of up to `length` corners from `start` with its rails on `side`, never
 * touching corners in `blocked` or its own earlier corners. Turns mix both ways, at most MAX_RUN in a row, so it snakes.
 */
function walk(
  graph: Graph,
  start: string,
  length: number,
  side: 1 | -1,
  blocked: Set<string>,
  random: () => number,
): string[] {
  const path = [start];
  let run = 0;
  let last = 0;
  while (path.length < length) {
    const here = path.at(-1)!;
    const before = path.at(-2);
    const options = (graph.next.get(here) ?? []).filter(c => {
      if (blocked.has(c) || path.includes(c) || !dry(graph, here, c, side)) return false;
      // Only the corner we came from may already touch the track.
      if ((graph.touching.get(c) ?? []).some(n => n !== here && path.includes(n))) return false;
      return !before || run < MAX_RUN || turn(graph, before, here, c) !== last;
    });
    if (!options.length) break;
    const pick = options[Math.floor(random() * options.length)]!;
    if (before) {
      const t = turn(graph, before, here, pick);
      run = t === last ? run + 1 : 1;
      last = t;
    }
    path.push(pick);
  }
  return path;
}

/** How much a path snakes: bends that change direction, beyond plain zigzags. */
function snakiness(graph: Graph, path: string[]): number {
  let score = 0;
  let previous = 0;
  let run = 0;
  for (let i = 2; i < path.length; i++) {
    const t = turn(graph, path[i - 2]!, path[i - 1]!, path[i]!);
    run = t === previous ? run + 1 : 1;
    // A second turn the same way is a curve; a zigzag alone just runs straight.
    if (run === 2) score++;
    previous = t;
  }
  return score;
}

interface Leg {
  vertexIds: string[];
  side: 1 | -1;
}

/** The best of TRIES walks of `length` corners among `corners` (either rail side), or the longest it found. */
function bestLeg(graph: Graph, corners: string[], length: number, blocked: Set<string>, random: () => number): Leg {
  const starts = corners.filter(c => !blocked.has(c) && graph.next.has(c));
  let best: Leg = { vertexIds: [], side: 1 };
  let bestScore = -1;
  for (let i = 0; i < TRIES && starts.length; i++) {
    const side = random() < 0.5 ? 1 : -1;
    const path = walk(graph, starts[Math.floor(random() * starts.length)]!, length, side, blocked, random);
    const score = Math.min(path.length, length) * 10 + snakiness(graph, path);
    if (score > bestScore) {
      best = { vertexIds: path, side };
      bestScore = score;
    }
  }
  return best;
}

/** The land tiles' islands, each as its corners, biggest first. */
function islands(board: Board): string[][] {
  const land = board.hexes.filter(h => isLandTerrain(h.terrain));
  const byKey = new Map(land.map(h => [`${h.q},${h.r}`, h]));
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const hex of land) {
    if (seen.has(hex.id)) continue;
    const corners = new Set<string>();
    const queue = [hex];
    seen.add(hex.id);
    while (queue.length) {
      const h = queue.pop()!;
      for (const id of h.vertexIds) corners.add(id);
      for (const [dq, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, -1],
        [-1, 1],
      ] as const) {
        const n = byKey.get(`${h.q + dq},${h.r + dr}`);
        if (n && !seen.has(n.id)) {
          seen.add(n.id);
          queue.push(n);
        }
      }
    }
    groups.push([...corners]);
  }
  return groups.sort((a, b) => b.length - a.length);
}

/**
 * A generated train for `board`: one snaking leg on a land-only board, a few legs on separate
 * islands on a sea map. More legs are added wherever the first ones fall short. Empty if the board
 * has no land.
 */
export function autoTrain(board: Board, random: () => number): CandyTrain[] {
  const graph = landGraph(board);
  const target = Math.max(4, Math.round(board.vertices.length * COVER));
  const sea = board.hexes.some(h => !isLandTerrain(h.terrain));
  const groups = sea ? islands(board).filter(g => g.filter(c => graph.next.has(c)).length >= 3) : [];
  const legsWanted = sea ? Math.max(1, Math.min(SEA_LEGS, groups.length)) : 1;
  const blocked = new Set<string>();
  const legs: Leg[] = [];
  let left = target;
  for (let i = 0; left >= 3 && i < SEA_LEGS + 2; i++) {
    const share = i < legsWanted ? Math.ceil(left / (legsWanted - i)) : left;
    const corners = sea && i < groups.length ? groups[i]! : [...graph.next.keys()];
    const leg = bestLeg(graph, corners, share, blocked, random);
    if (leg.vertexIds.length < 3) {
      if (i >= legsWanted) break;
      continue;
    }
    legs.push(leg);
    left -= leg.vertexIds.length;
    for (const c of leg.vertexIds) for (const n of [c, ...(graph.touching.get(c) ?? [])]) blocked.add(n);
  }
  if (!legs.length) return [];
  const [first, ...rest] = legs;
  return [{ ...first!, number: defaultTrainNumber(random), ...(rest.length ? { legs: rest } : {}) }];
}
