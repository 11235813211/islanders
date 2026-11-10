import { victoryPoints } from '../rules';
import { boardIndex, isLandTerrain, isLandVertex, isRoadEdge, isShipEdge, otherEnd } from '../seafaring';
import { type GameState, type LegalMoves, type Player, RESOURCES } from '../types';
import {
  BUILD_COSTS,
  canAfford,
  discoveryRule,
  getActivePlayerId,
  PIECE_LIMITS,
  pieceCounts,
  resourceCount,
  seaRules,
} from './core';

/**
 * Open land corners at least two edges from any building; outside setup, touching your road or ship.
 * Setup settlements stay off closed islands, and away from volcanoes unless the room allows it.
 */
export function settlementSites(state: GameState, playerId: string, setup: boolean): string[] {
  const index = boardIndex(state.board);
  return state.board.vertices
    .filter(vertex => {
      if (state.buildings[vertex.id] || !isLandVertex(state.board, vertex.id)) return false;
      if (vertex.edgeIds.some(id => state.buildings[otherEnd(index.edge.get(id)!, vertex.id)])) return false;
      if (setup && vertex.noSetup) return false;
      if (setup)
        return !vertex.hexIds.some(id => {
          const hex = index.hex.get(id)!;
          return hex.noSetup || (hex.terrain === 'volcano' && !state.settings.volcanoStart);
        });
      return vertex.edgeIds.some(id => state.roads[id] === playerId || state.ships[id] === playerId);
    })
    .map(vertex => vertex.id);
}

/** Can a route of `kind` continue from this corner? Through your own building, or along your own piece of that kind. */
function reaches(state: GameState, playerId: string, vertexId: string, kind: 'roads' | 'ships', skip?: string) {
  const building = state.buildings[vertexId];
  if (building) return building.playerId === playerId;
  return boardIndex(state.board)
    .vertex.get(vertexId)!
    .edgeIds.some(id => id !== skip && state[kind][id] === playerId);
}

export function roadSites(state: GameState, playerId: string, setup: boolean): string[] {
  return state.board.edges
    .filter(edge => {
      if (state.roads[edge.id] || state.ships[edge.id] || !isRoadEdge(state.board, edge.id)) return false;
      if (setup) return edge.a === state.lastSettlement || edge.b === state.lastSettlement;
      return [edge.a, edge.b].some(id => reaches(state, playerId, id, 'roads'));
    })
    .map(edge => edge.id);
}

/** Edges beside the pirate can't take new or moved ships. */
function besidePirate(state: GameState, edgeId: string): boolean {
  return (
    !!state.pirate &&
    boardIndex(state.board)
      .edgeHexes.get(edgeId)!
      .some(h => h.id === state.pirate)
  );
}

/** Open sea edges a ship may go on. `moving` is a ship being moved (it no longer counts as a link). */
export function shipSites(state: GameState, playerId: string, setup: boolean, moving?: string): string[] {
  if (!seaRules(state)) return [];
  return state.board.edges
    .filter(edge => {
      if (edge.id === moving || state.roads[edge.id] || (state.ships[edge.id] && edge.id !== moving)) return false;
      if (!isShipEdge(state.board, edge.id) || besidePirate(state, edge.id)) return false;
      if (setup) return edge.a === state.lastSettlement || edge.b === state.lastSettlement;
      return [edge.a, edge.b].some(id => reaches(state, playerId, id, 'ships', moving));
    })
    .map(edge => edge.id);
}

/**
 * A ship at the end of its line: one of its corners has no other of your ships. The published rule
 * (`open`) also needs that corner free of your buildings, so a route closed by settlements stays put.
 */
function movableEnd(state: GameState, playerId: string, edgeId: string): boolean {
  const index = boardIndex(state.board);
  const edge = index.edge.get(edgeId)!;
  const published = state.settings.shipMoving === 'open';
  return [edge.a, edge.b].some(
    id =>
      (!published || state.buildings[id]?.playerId !== playerId) &&
      !index.vertex.get(id)!.edgeIds.some(other => other !== edgeId && state.ships[other] === playerId),
  );
}

/** Each ship you may move this turn, and where it may go. */
export function shipMoves(state: GameState, playerId: string): Record<string, string[]> {
  if (state.shipMoved || state.phase !== 'build') return {};
  const moves: Record<string, string[]> = {};
  for (const [edgeId, owner] of Object.entries(state.ships)) {
    if (owner !== playerId || state.shipsBuilt.includes(edgeId) || besidePirate(state, edgeId)) continue;
    if (!movableEnd(state, playerId, edgeId)) continue;
    const targets = shipSites(state, playerId, false, edgeId);
    if (targets.length) moves[edgeId] = targets;
  }
  return moves;
}

/** Players who can be robbed from the hex the robber or pirate just moved to. */
export function stealTargets(state: GameState, playerId: string): string[] {
  const index = boardIndex(state.board);
  const hex = index.hex.get(state.stealHex ?? state.robber);
  if (!hex) return [];
  const owners = new Set<string>();
  if (hex.terrain === 'sea') {
    for (const [edgeId, owner] of Object.entries(state.ships))
      if (index.edgeHexes.get(edgeId)!.includes(hex)) owners.add(owner);
  } else for (const id of hex.vertexIds) if (state.buildings[id]) owners.add(state.buildings[id].playerId);
  const stealable = discoveryRule(state).stealable;
  return state.players
    .filter(
      p => p.id !== playerId && owners.has(p.id) && resourceCount(p.resources) + (stealable ? p.discoveries : 0) > 0,
    )
    .map(p => p.id);
}

/** Land hexes for the robber and, on sea maps, open sea for the pirate. */
function robberHexes(state: GameState, selfId: string): string[] {
  const index = boardIndex(state.board);
  const protectedHex = (hexId: string) => {
    if (!state.settings.friendlyRobber) return false;
    const owners = index.hex
      .get(hexId)!
      .vertexIds.map(id => state.buildings[id]?.playerId)
      .filter((id): id is string => !!id);
    return owners.some(id => id !== selfId && victoryPoints(state, id, false) <= 2);
  };
  return state.board.hexes
    .filter(hex => {
      if (hex.terrain === 'sea') return seaRules(state) && hex.id !== state.pirate && !protectedHex(hex.id);
      return isLandTerrain(hex.terrain) && hex.id !== state.robber && !protectedHex(hex.id);
    })
    .map(hex => hex.id);
}

/** Enough cards for a development card, with jungle discoveries standing in for missing ones. */
export function affordsDevelopment(state: GameState, player: Player): boolean {
  if (!state.developmentDeck.length) return false;
  const cost = BUILD_COSTS.development;
  const missing = RESOURCES.reduce((n, r) => n + Math.max(0, cost[r] - player.resources[r]), 0);
  return missing <= player.discoveries;
}

/** Moves the given seat may make right now. Empty unless it is that seat's turn. */
export function legalMoves(state: GameState, selfId: string): LegalMoves {
  const legal: LegalMoves = {
    settlements: [],
    roads: [],
    ships: [],
    cities: [],
    robberHexes: [],
    stealTargets: [],
    shipMoves: {},
    development: false,
  };
  const player = state.players.find(candidate => candidate.id === selfId);
  if (!player || getActivePlayerId(state) !== selfId || state.pausedAt !== null) return legal;
  const pieces = pieceCounts(state, selfId);
  if (state.phase === 'setup-settlement') legal.settlements = settlementSites(state, selfId, true);
  if (state.phase === 'setup-road') {
    legal.roads = roadSites(state, selfId, true);
    legal.ships = shipSites(state, selfId, true);
  }
  if (state.phase === 'robber') legal.robberHexes = robberHexes(state, selfId);
  if (state.phase === 'steal') legal.stealTargets = stealTargets(state, selfId);
  if (state.phase === 'free-roads') {
    if (pieces.roads < PIECE_LIMITS.roads) legal.roads = roadSites(state, selfId, false);
    if (pieces.ships < PIECE_LIMITS.ships) legal.ships = shipSites(state, selfId, false);
  }
  if (state.phase === 'build' || state.phase === 'special-build') {
    legal.development = affordsDevelopment(state, player);
    if (pieces.settlements < PIECE_LIMITS.settlements && canAfford(player, BUILD_COSTS.settlement))
      legal.settlements = settlementSites(state, selfId, false);
    if (pieces.roads < PIECE_LIMITS.roads && canAfford(player, BUILD_COSTS.road))
      legal.roads = roadSites(state, selfId, false);
    if (pieces.ships < PIECE_LIMITS.ships && canAfford(player, BUILD_COSTS.ship))
      legal.ships = shipSites(state, selfId, false);
    if (pieces.cities < PIECE_LIMITS.cities && canAfford(player, BUILD_COSTS.city)) {
      legal.cities = Object.entries(state.buildings)
        .filter(([, building]) => building.playerId === selfId && building.kind === 'settlement')
        .map(([vertexId]) => vertexId);
    }
    if (state.phase === 'build') legal.shipMoves = shipMoves(state, selfId);
  }
  return legal;
}
