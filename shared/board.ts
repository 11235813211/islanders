import type { Board, Hex, Terrain, Vertex } from './types';

export const HEX_RADIUS = 60;

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
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

/** The standard island: 19 land tiles in a hexagon, nine harbors, and numbers. */
export function generateBoard(random: () => number = Math.random, layout: 'random' | 'ordered' = 'random'): Board {
  const terrains = shuffled<Terrain>(
    [
      ...Array<Terrain>(4).fill('wood'),
      ...Array<Terrain>(4).fill('sheep'),
      ...Array<Terrain>(4).fill('wheat'),
      ...Array<Terrain>(3).fill('brick'),
      ...Array<Terrain>(3).fill('ore'),
      'desert',
    ],
    random,
  );
  const cells: { q: number; r: number; terrain: Terrain }[] = [];
  for (let r = -2; r <= 2; r++)
    for (let q = Math.max(-2, -r - 2); q <= Math.min(2, -r + 2); q++)
      cells.push({ q, r, terrain: terrains[cells.length]! });
  const board = buildGraph(cells);
  board.harbors = generateHarbors(board, random);
  assignNumbers(board, layout, random);
  return board;
}

export const ORDERED_NUMBERS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

/** Counterclockwise rings from the northwest corner, then inward. */
export function spiralHexes(board: Board): Hex[] {
  const result: Hex[] = [];
  const directions = [
    [-1, 1],
    [0, 1],
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
  ];
  for (let radius = 2; radius > 0; radius--) {
    let q = 0,
      r = -radius;
    for (const [dq, dr] of directions)
      for (let step = 0; step < radius; step++) {
        result.push(board.hexes.find(hex => hex.q === q && hex.r === r)!);
        q += dq;
        r += dr;
      }
  }
  result.push(board.hexes.find(hex => hex.q === 0 && hex.r === 0)!);
  return result;
}

export function assignNumbers(board: Board, layout: 'random' | 'ordered', random: () => number = Math.random): void {
  for (const hex of board.hexes) hex.number = null;
  if (layout === 'ordered') {
    spiralHexes(board)
      .filter(hex => hex.terrain !== 'desert')
      .forEach((hex, index) => {
        hex.number = ORDERED_NUMBERS[index];
      });
    return;
  }
  // Backtracking guarantees separated high-probability numbers even when a
  // deterministic test random source repeatedly returns the same value.
  const producing = shuffled(
    board.hexes.filter(h => h.terrain !== 'desert'),
    random,
  );
  function chooseRed(start: number, chosen: Hex[]): Hex[] | undefined {
    if (chosen.length === 4) return chosen;
    for (let i = start; i < producing.length; i++) {
      if (chosen.every(other => !adjacent(producing[i], other))) {
        const found = chooseRed(i + 1, [...chosen, producing[i]]);
        if (found) return found;
      }
    }
    return undefined;
  }
  const redHexes = chooseRed(0, [])!;
  const redNumbers = shuffled([6, 6, 8, 8], random);
  redHexes.forEach((hex, i) => {
    hex.number = redNumbers[i];
  });
  const numbers = shuffled([2, 3, 3, 4, 4, 5, 5, 9, 9, 10, 10, 11, 11, 12], random);
  producing
    .filter(hex => hex.number === null)
    .forEach((hex, i) => {
      hex.number = numbers[i];
    });
}

/** Nine non-overlapping coastal edges: four general and five specialized ports. */
export function generateHarbors(board: Board, random: () => number = () => 0.5): Board['harbors'] {
  const vertices = new Map(board.vertices.map(v => [v.id, v]));
  const coast = board.edges.filter(
    edge => vertices.get(edge.a)!.hexIds.filter(id => vertices.get(edge.b)!.hexIds.includes(id)).length === 1,
  );
  coast.sort((a, b) => {
    const angle = (edge: typeof a) =>
      Math.atan2(vertices.get(edge.a)!.y + vertices.get(edge.b)!.y, vertices.get(edge.a)!.x + vertices.get(edge.b)!.x);
    return angle(a) - angle(b);
  });
  const kinds = shuffled<Board['harbors'][number]['resource']>(
    ['any', 'any', 'any', 'any', 'wood', 'brick', 'sheep', 'wheat', 'ore'],
    random,
  );
  return kinds.map((resource, i) => {
    const edge = coast[Math.floor((i * coast.length) / 9)];
    const a = vertices.get(edge.a)!,
      b = vertices.get(edge.b)!;
    const x = (a.x + b.x) / 2,
      y = (a.y + b.y) / 2,
      length = Math.hypot(x, y);
    return {
      id: `port-${i}`,
      edgeId: edge.id,
      vertices: [edge.a, edge.b],
      resource,
      x: x + (x / length) * 38,
      y: y + (y / length) * 38,
    };
  });
}
