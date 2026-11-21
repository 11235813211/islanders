import type { Crossings, GameSettings } from './types';

/**
 * Crossing routes (settings.crossRoutes): on maps with routes, players whose starting settlements
 * chose different routes may build roads and ships on the same edges and past each other's
 * settlements and cities. An edge's first piece stays in `roads`/`ships`; any others sit in
 * `crossings`. Everything that asks whose piece is on an edge goes through here.
 */

/** Pieces on the board, from a game state or a view (bots pass trimmed copies, so the extras are optional). */
export interface EdgePieces {
  roads: Record<string, string>;
  ships?: Record<string, string>;
  crossings?: Crossings;
}

/** What deciding who may cross whom looks at. */
export interface CrossRules {
  settings: Pick<GameSettings, 'crossRoutes'>;
  routeOf?: Record<string, number>;
}

/** Whether these two players may build through each other: crossing is on and they hold different routes. */
export function crosses(state: CrossRules, a: string, b: string): boolean {
  if (!state.settings.crossRoutes || a === b) return false;
  const ra = state.routeOf?.[a];
  const rb = state.routeOf?.[b];
  return ra !== undefined && rb !== undefined && ra !== rb;
}

/** The piece this player has on an edge, if any. Hot path: no allocations. */
export function pieceOn(state: EdgePieces, playerId: string, edgeId: string): 'road' | 'ship' | null {
  if (state.roads[edgeId] === playerId) return 'road';
  if (state.ships?.[edgeId] === playerId) return 'ship';
  return state.crossings?.[edgeId]?.[playerId] ?? null;
}

/** Everyone with a piece on an edge. */
export function edgeOwners(state: EdgePieces, edgeId: string): string[] {
  const owners: string[] = [];
  const road = state.roads[edgeId];
  const ship = state.ships?.[edgeId];
  if (road) owners.push(road);
  if (ship) owners.push(ship);
  for (const id in state.crossings?.[edgeId]) owners.push(id);
  return owners;
}

/** Edges with this player's pieces of `kind` (both kinds when absent). */
export function ownEdges(state: EdgePieces, playerId: string, kind?: 'road' | 'ship'): string[] {
  const edges: string[] = [];
  if (kind !== 'ship') for (const id in state.roads) if (state.roads[id] === playerId) edges.push(id);
  if (kind !== 'road') for (const id in state.ships) if (state.ships![id] === playerId) edges.push(id);
  for (const id in state.crossings) {
    const piece = state.crossings[id]![playerId];
    if (piece && (!kind || piece === kind)) edges.push(id);
  }
  return edges;
}

/** Whether a player may put a new piece on this edge: empty, or holding only pieces of players they cross. */
export function edgeOpen(state: EdgePieces & CrossRules, playerId: string, edgeId: string): boolean {
  const road = state.roads[edgeId];
  const ship = state.ships?.[edgeId];
  if (!road && !ship && !state.crossings?.[edgeId]) return true;
  return edgeOwners(state, edgeId).every(owner => crosses(state, playerId, owner));
}

/** Place a piece: on an empty edge it is the edge's own piece, on a shared one a crossing. */
export function placePiece(
  next: { roads: Record<string, string>; ships: Record<string, string>; crossings: Crossings },
  playerId: string,
  edgeId: string,
  kind: 'road' | 'ship',
): void {
  if (!next.roads[edgeId] && !next.ships[edgeId]) {
    if (kind === 'road') next.roads[edgeId] = playerId;
    else next.ships[edgeId] = playerId;
    return;
  }
  next.crossings[edgeId] = { ...next.crossings[edgeId], [playerId]: kind };
}

/** Take a player's piece off an edge, wherever it is stored. */
export function removePiece(
  next: { roads: Record<string, string>; ships: Record<string, string>; crossings: Crossings },
  playerId: string,
  edgeId: string,
): void {
  if (next.roads[edgeId] === playerId) delete next.roads[edgeId];
  else if (next.ships[edgeId] === playerId) delete next.ships[edgeId];
  else if (next.crossings[edgeId]?.[playerId]) {
    const { [playerId]: _gone, ...rest } = next.crossings[edgeId]!;
    if (Object.keys(rest).length) next.crossings[edgeId] = rest;
    else delete next.crossings[edgeId];
  }
}

/** Every piece of `kind` on the board, as [edge id, owner] pairs, crossings included. */
export function allPieces(state: EdgePieces, kind: 'road' | 'ship'): [string, string][] {
  const main = kind === 'road' ? state.roads : (state.ships ?? {});
  const pieces = Object.entries(main);
  for (const id in state.crossings)
    for (const [owner, piece] of Object.entries(state.crossings[id]!)) if (piece === kind) pieces.push([id, owner]);
  return pieces;
}
