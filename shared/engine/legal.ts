import { victoryPoints } from '../rules';
import type { GameState, LegalMoves } from '../types';
import { BUILD_COSTS, canAfford, getActivePlayerId, PIECE_LIMITS, pieceCounts, resourceCount } from './core';

export function settlementSites(state: GameState, playerId: string, setup: boolean): string[] {
  return state.board.vertices
    .filter(vertex => {
      if (state.buildings[vertex.id]) return false;
      const incident = state.board.edges.filter(edge => edge.a === vertex.id || edge.b === vertex.id);
      if (incident.some(edge => state.buildings[edge.a === vertex.id ? edge.b : edge.a])) return false;
      return setup || incident.some(edge => state.roads[edge.id] === playerId);
    })
    .map(vertex => vertex.id);
}

export function roadSites(state: GameState, playerId: string, setup: boolean): string[] {
  return state.board.edges
    .filter(edge => {
      if (state.roads[edge.id]) return false;
      if (setup) return edge.a === state.lastSettlement || edge.b === state.lastSettlement;
      return [edge.a, edge.b].some(vertexId => {
        const building = state.buildings[vertexId];
        if (building) return building.playerId === playerId;
        return state.board.vertices
          .find(vertex => vertex.id === vertexId)!
          .edgeIds.some(edgeId => state.roads[edgeId] === playerId);
      });
    })
    .map(edge => edge.id);
}

export function stealTargets(state: GameState, playerId: string): string[] {
  const hex = state.board.hexes.find(candidate => candidate.id === state.robber)!;
  return state.players
    .filter(
      player =>
        player.id !== playerId &&
        resourceCount(player.resources) > 0 &&
        hex.vertexIds.some(vertexId => state.buildings[vertexId]?.playerId === player.id),
    )
    .map(player => player.id);
}

function robberHexes(state: GameState, selfId: string): string[] {
  return state.board.hexes
    .filter(
      hex =>
        hex.id !== state.robber &&
        (!state.settings.friendlyRobber ||
          !hex.vertexIds.some(id => {
            const b = state.buildings[id];
            return b && b.playerId !== selfId && victoryPoints(state, b.playerId, false) <= 2;
          })),
    )
    .map(hex => hex.id);
}

/** Moves the given seat may make right now. Empty unless it is that seat's turn. */
export function legalMoves(state: GameState, selfId: string): LegalMoves {
  const legal: LegalMoves = { settlements: [], roads: [], cities: [], robberHexes: [], stealTargets: [] };
  const player = state.players.find(candidate => candidate.id === selfId);
  if (!player || getActivePlayerId(state) !== selfId || state.pausedAt !== null) return legal;
  const pieces = pieceCounts(state, selfId);
  if (state.phase === 'setup-settlement') legal.settlements = settlementSites(state, selfId, true);
  if (state.phase === 'setup-road') legal.roads = roadSites(state, selfId, true);
  if (state.phase === 'robber') legal.robberHexes = robberHexes(state, selfId);
  if (state.phase === 'steal') legal.stealTargets = stealTargets(state, selfId);
  if (state.phase === 'free-roads' && pieces.roads < PIECE_LIMITS.roads) legal.roads = roadSites(state, selfId, false);
  if (state.phase === 'build') {
    if (pieces.settlements < PIECE_LIMITS.settlements && canAfford(player, BUILD_COSTS.settlement))
      legal.settlements = settlementSites(state, selfId, false);
    if (pieces.roads < PIECE_LIMITS.roads && canAfford(player, BUILD_COSTS.road))
      legal.roads = roadSites(state, selfId, false);
    if (pieces.cities < PIECE_LIMITS.cities && canAfford(player, BUILD_COSTS.city)) {
      legal.cities = Object.entries(state.buildings)
        .filter(([, building]) => building.playerId === selfId && building.kind === 'settlement')
        .map(([vertexId]) => vertexId);
    }
  }
  return legal;
}
