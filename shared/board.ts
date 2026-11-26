import type { Board, Harbor, Hex, Terrain, Vertex } from './types';

export const HEX_RADIUS = 60;

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** A repeatable random sequence from a seed, so a drawn board can be drawn again exactly. */
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

function adjacent(a: Hex, b: Hex): boolean {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r)) === 1;
}

/** Pixel center of axial hex (q, r) in board units. */
export function hexCenter(q: number, r: number): { x: number; y: number } {
  return { x: Math.sqrt(3) * HEX_RADIUS * (q + r / 2), y: 1.5 * HEX_RADIUS * r };
}

/** Corner `corner` of a hex centered at (x, y); see Hex.vertexIds for the order. */
export function hexCorner(x: number, y: number, corner: number): { x: number; y: number } {
  const angle = ((30 + 60 * corner) * Math.PI) / 180;
  return { x: x + HEX_RADIUS * Math.cos(angle), y: y + HEX_RADIUS * Math.sin(angle) };
}

/** Tiles → hexes, shared corners, and edges. Hex ids follow the input order. */
export function buildGraph(cells: { q: number; r: number; terrain: Terrain; number?: number | null }[]): Board {
  const board: Board = { hexes: [], vertices: [], edges: [], harbors: [] };
  const vertices = new Map<string, Vertex>();
  const vertexById = new Map<string, Vertex>();
  const edges = new Map<string, string>();
  for (const cell of cells) {
    const { x, y } = hexCenter(cell.q, cell.r);
    const hex: Hex = {
      id: `h${board.hexes.length}`,
      q: cell.q,
      r: cell.r,
      x,
      y,
      terrain: cell.terrain,
      number: cell.number ?? null,
      vertexIds: [],
    };
    for (let corner = 0; corner < 6; corner++) {
      const point = hexCorner(x, y, corner);
      const key = `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)}`;
      let vertex = vertices.get(key);
      if (!vertex) {
        vertex = { id: `v${board.vertices.length}`, x: point.x, y: point.y, hexIds: [], edgeIds: [] };
        vertices.set(key, vertex);
        vertexById.set(vertex.id, vertex);
        board.vertices.push(vertex);
      }
      vertex.hexIds.push(hex.id);
      hex.vertexIds.push(vertex.id);
    }
    for (let corner = 0; corner < 6; corner++) {
      const a = hex.vertexIds[corner]!;
      const b = hex.vertexIds[(corner + 1) % 6]!;
      const key = [a, b].sort().join(':');
      if (!edges.has(key)) {
        const id = `e${board.edges.length}`;
        edges.set(key, id);
        board.edges.push({ id, a, b });
        vertexById.get(a)!.edgeIds.push(id);
        vertexById.get(b)!.edgeIds.push(id);
      }
    }
    board.hexes.push(hex);
  }
  return board;
}

/** The huge island's spiral order (35 numbers), checked to keep 6s and 8s apart wherever the deserts fall. */
const HUGE_ORDERED = [
  6, 5, 3, 10, 6, 11, 8, 4, 10, 8, 4, 6, 4, 8, 9, 4, 5, 12, 5, 10, 3, 5, 2, 9, 11, 3, 9, 3, 2, 6, 11, 8, 10, 9, 12,
];

/** The standard island's tiles, numbers, and harbors; `large` is for 5–6 players, `huge` for 7–8. */
const ISLANDS = {
  standard: {
    rows: [3, 4, 5, 4, 3],
    terrains: { wood: 4, sheep: 4, wheat: 4, brick: 3, ore: 3, desert: 1 },
    harbors: ['any', 'any', 'any', 'any', 'wood', 'brick', 'sheep', 'wheat', 'ore'],
    ordered: [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11],
  },
  large: {
    rows: [3, 4, 5, 6, 5, 4, 3],
    terrains: { wood: 6, sheep: 6, wheat: 6, brick: 5, ore: 5, desert: 2 },
    harbors: ['any', 'any', 'any', 'any', 'any', 'wood', 'brick', 'sheep', 'sheep', 'wheat', 'ore'],
    ordered: [2, 5, 4, 6, 3, 9, 8, 11, 11, 10, 6, 3, 8, 4, 8, 10, 11, 12, 10, 5, 4, 9, 5, 9, 12, 3, 2, 6],
  },
  huge: {
    rows: [4, 5, 6, 7, 6, 5, 4],
    terrains: { wood: 8, sheep: 8, wheat: 7, brick: 6, ore: 6, desert: 2 },
    harbors: ['any', 'any', 'any', 'any', 'any', 'any', 'wood', 'brick', 'sheep', 'sheep', 'wheat', 'wheat', 'ore'],
    ordered: HUGE_ORDERED,
  },
} satisfies Record<
  string,
  { rows: number[]; terrains: Partial<Record<Terrain, number>>; harbors: Harbor['resource'][]; ordered: number[] }
>;
type Island = (typeof ISLANDS)[keyof typeof ISLANDS];
/** Which base island a table plays: 2–4 players the standard one, 5–6 the large, 7–8 the huge. */
export type IslandSize = keyof typeof ISLANDS;
/** Row widths of each base island, for previews. */
export const ISLAND_ROWS: Record<IslandSize, number[]> = {
  standard: ISLANDS.standard.rows,
  large: ISLANDS.large.rows,
  huge: ISLANDS.huge.rows,
};

/** The base island for a player count. */
export const islandSize = (players: number): IslandSize =>
  players >= 7 ? 'huge' : players >= 5 ? 'large' : 'standard';

/**
 * Axial cells for rows of the given widths, centered on the middle row. The standard island
 * (3-4-5-4-3) comes out as the usual radius-2 hexagon.
 */
export function islandCells(rows: number[]): { q: number; r: number }[] {
  const middle = (rows.length - 1) / 2;
  const widest = Math.max(...rows);
  const cells: { q: number; r: number }[] = [];
  rows.forEach((width, i) => {
    const r = i - middle;
    // Keeps every row centered on x = (widest is odd ? 0 : -half a hex).
    const start = Math.round(-(width - 1) / 2 - r / 2 - (widest % 2 ? 0 : 0.5) + 0.01);
    for (let q = start; q < start + width; q++) cells.push({ q, r });
  });
  return cells;
}

/** A base island: standard (19 tiles, 9 harbors), large (30 tiles, 11 harbors), or huge (37 tiles, 13 harbors). */
export function generateBoard(
  random: () => number = Math.random,
  layout: 'random' | 'ordered' = 'random',
  size: IslandSize = 'standard',
  sea = false,
): Board {
  const island = ISLANDS[size];
  const terrains = shuffled(
    Object.entries(island.terrains).flatMap(([terrain, count]) => Array<Terrain>(count).fill(terrain as Terrain)),
    random,
  );
  const land = islandCells(island.rows).map((cell, i) => ({ ...cell, terrain: terrains[i]! }));
  const board = buildGraph(sea ? [...land, ...seaRing(land)] : land);
  board.harbors = generateHarbors(board, random);
  assignNumbers(board, layout, random);
  return board;
}

/** One ring of sea around the island (the Seafarers variation on the base game), after the land. */
function seaRing(land: { q: number; r: number }[]): { q: number; r: number; terrain: Terrain }[] {
  const taken = new Set(land.map(c => `${c.q},${c.r}`));
  const ring = new Map<string, { q: number; r: number; terrain: Terrain }>();
  for (const c of land)
    for (const [dq, dr] of AXIAL_NEIGHBORS) {
      const key = `${c.q + dq},${c.r + dr}`;
      if (!taken.has(key)) ring.set(key, { q: c.q + dq, r: c.r + dr, terrain: 'sea' });
    }
  return [...ring.values()];
}
const AXIAL_NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
] as const;
const landHexes = (board: Board) => board.hexes.filter(h => h.terrain !== 'sea');
/** The base island a board was drawn from, by its land tile count. */
const islandOf = (board: Board): Island => {
  const land = landHexes(board).length;
  return land > ISLANDS.large.rows.reduce((a, b) => a + b)
    ? ISLANDS.huge
    : land > 19
      ? ISLANDS.large
      : ISLANDS.standard;
};

export const ORDERED_NUMBERS = ISLANDS.standard.ordered;

/** Counterclockwise rings from the northwest corner, then inward, for any island built by islandCells. */
export function spiralHexes(board: Board): Hex[] {
  const land = landHexes(board);
  const remaining = new Set(land);
  const result: Hex[] = [];
  const cx = land.reduce((sum, h) => sum + h.x, 0) / land.length;
  const cy = land.reduce((sum, h) => sum + h.y, 0) / land.length;
  // Peel the outer ring each pass (hexes missing a neighbour), starting at its top-left hex.
  while (remaining.size) {
    const ring = [...remaining].filter(h => [...remaining].filter(o => adjacent(h, o)).length < 6);
    const degrees = (h: Hex) => (Math.atan2(h.y - cy, h.x - cx) * 180) / Math.PI;
    const first = ring.reduce((a, b) => (b.y < a.y - 1 || (Math.abs(b.y - a.y) < 1 && b.x < a.x) ? b : a));
    // Counterclockwise on screen is decreasing angle (y points down).
    const from = degrees(first) + 0.5;
    ring.sort((a, b) => ((((from - degrees(a)) % 360) + 360) % 360) - ((((from - degrees(b)) % 360) + 360) % 360));
    for (const h of ring) remaining.delete(h);
    result.push(...ring);
  }
  return result;
}

/** The base island's number tokens: its ordered spiral, or a random draw with no two red numbers touching. */
export function assignNumbers(board: Board, layout: 'random' | 'ordered', random: () => number = Math.random): void {
  for (const hex of board.hexes) hex.number = null;
  const ordered = islandOf(board).ordered;
  if (layout === 'ordered') {
    spiralHexes(board)
      .filter(hex => hex.terrain !== 'desert')
      .forEach((hex, index) => {
        hex.number = ordered[index] ?? null;
      });
    return;
  }
  // Backtracking guarantees separated high-probability numbers even when a
  // deterministic test random source repeatedly returns the same value.
  const producing = shuffled(
    landHexes(board).filter(h => h.terrain !== 'desert'),
    random,
  );
  const red = ordered.filter(n => n === 6 || n === 8);
  function chooseRed(start: number, chosen: Hex[]): Hex[] | undefined {
    if (chosen.length === red.length) return chosen;
    for (let i = start; i < producing.length; i++) {
      if (chosen.every(other => !adjacent(producing[i]!, other))) {
        const found = chooseRed(i + 1, [...chosen, producing[i]!]);
        if (found) return found;
      }
    }
    return undefined;
  }
  const redHexes = chooseRed(0, [])!;
  const redNumbers = shuffled(red, random);
  redHexes.forEach((hex, i) => {
    hex.number = redNumbers[i]!;
  });
  const numbers = shuffled(
    ordered.filter(n => n !== 6 && n !== 8),
    random,
  );
  producing
    .filter(hex => hex.number === null)
    .forEach((hex, i) => {
      hex.number = numbers[i]!;
    });
}

/** Evenly spaced coastal harbors: 9 on the standard island, 11 on the large one, 13 on the huge one. */
export function generateHarbors(board: Board, random: () => number = () => 0.5): Board['harbors'] {
  const vertices = new Map(board.vertices.map(v => [v.id, v]));
  const land = landHexes(board);
  const isLand = new Set(land.map(h => h.id));
  const cx = land.reduce((sum, h) => sum + h.x, 0) / land.length;
  const cy = land.reduce((sum, h) => sum + h.y, 0) / land.length;
  // Coast: edges with land on exactly one side (open water or the sea ring on the other).
  const coast = board.edges.filter(
    edge =>
      vertices.get(edge.a)!.hexIds.filter(id => vertices.get(edge.b)!.hexIds.includes(id) && isLand.has(id)).length ===
      1,
  );
  const middle = (edge: (typeof coast)[number]) => ({
    x: (vertices.get(edge.a)!.x + vertices.get(edge.b)!.x) / 2 - cx,
    y: (vertices.get(edge.a)!.y + vertices.get(edge.b)!.y) / 2 - cy,
  });
  coast.sort((a, b) => Math.atan2(middle(a).y, middle(a).x) - Math.atan2(middle(b).y, middle(b).x));
  const kinds = shuffled<Harbor['resource']>(islandOf(board).harbors, random);
  return kinds.map((resource, i) => {
    const edge = coast[Math.floor((i * coast.length) / kinds.length)]!;
    const { x, y } = middle(edge);
    const length = Math.hypot(x, y);
    return {
      id: `port-${i}`,
      edgeId: edge.id,
      vertices: [edge.a, edge.b],
      resource,
      x: cx + x + (x / length) * 38,
      y: cy + y + (y / length) * 38,
    };
  });
}
