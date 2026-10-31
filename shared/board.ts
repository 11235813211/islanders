import type { Board, Hex, Terrain, Vertex } from './types';

export const HEX_RADIUS = 60;

function shuffled<T>(items: readonly T[], random: () => number): T[] {
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

/** A stable graph is shared by the renderer and the authoritative rules. */
export function generateBoard(random: () => number = Math.random): Board {
  const terrains = shuffled<Terrain>([
    'wood', 'wood', 'wood', 'wood', 'sheep', 'sheep', 'sheep', 'sheep',
    'wheat', 'wheat', 'wheat', 'wheat', 'brick', 'brick', 'brick', 'ore', 'ore', 'ore', 'desert',
  ], random);
  const board: Board = { hexes: [], vertices: [], edges: [] };
  const vertices = new Map<string, Vertex>();
  const edges = new Map<string, string>();
  for (let r = -2; r <= 2; r++) {
    for (let q = Math.max(-2, -r - 2); q <= Math.min(2, -r + 2); q++) {
      const hex: Hex = {
        id: `h${board.hexes.length}`, q, r,
        x: Math.sqrt(3) * HEX_RADIUS * (q + r / 2), y: 1.5 * HEX_RADIUS * r,
        terrain: terrains[board.hexes.length], number: null, vertexIds: [],
      };
      for (let corner = 0; corner < 6; corner++) {
        const angle = (30 + 60 * corner) * Math.PI / 180;
        const x = hex.x + HEX_RADIUS * Math.cos(angle);
        const y = hex.y + HEX_RADIUS * Math.sin(angle);
        const key = `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
        let vertex = vertices.get(key);
        if (!vertex) {
          vertex = { id: `v${board.vertices.length}`, x, y, hexIds: [], edgeIds: [] };
          vertices.set(key, vertex);
          board.vertices.push(vertex);
        }
        vertex.hexIds.push(hex.id);
        hex.vertexIds.push(vertex.id);
      }
      for (let corner = 0; corner < 6; corner++) {
        const a = hex.vertexIds[corner];
        const b = hex.vertexIds[(corner + 1) % 6];
        const key = [a, b].sort().join(':');
        if (!edges.has(key)) {
          const id = `e${board.edges.length}`;
          edges.set(key, id);
          board.edges.push({ id, a, b });
          board.vertices.find(v => v.id === a)!.edgeIds.push(id);
          board.vertices.find(v => v.id === b)!.edgeIds.push(id);
        }
      }
      board.hexes.push(hex);
    }
  }

  // Backtracking guarantees separated high-probability numbers even when a
  // deterministic test random source repeatedly returns the same value.
  const producing = shuffled(board.hexes.filter(h => h.terrain !== 'desert'), random);
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
  redHexes.forEach((hex, i) => { hex.number = redNumbers[i]; });
  const numbers = shuffled([2, 3, 3, 4, 4, 5, 5, 9, 9, 10, 10, 11, 11, 12], random);
  producing.filter(hex => hex.number === null).forEach((hex, i) => { hex.number = numbers[i]; });
  return board;
}
