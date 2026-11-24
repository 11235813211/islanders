import { allPieces, crosses, edgeOpen, edgeOwners, ownEdges, pieceOn } from '../crossings';
import type { KnightsBoard } from '../knights';
import { chartedNumbers, hexNumbers, linksAnywhere, megacitySpots, victoryPoints } from '../rules';
import {
  boardIndex,
  isLandTerrain,
  isLandVertex,
  isProducing,
  isRoadEdge,
  isShipEdge,
  otherEnd,
  terrainResource,
} from '../seafaring';
import { type GameState, type LegalMoves, type Player, RESOURCES, type Resource, type ResourceBag } from '../types';
import {
  BUILD_COSTS,
  canAfford,
  cartographersRules,
  discoveryRule,
  getActivePlayerId,
  pieceCounts,
  pieceLimits,
  resourceCount,
  seaRules,
} from './core';
import { routeSetupSites } from './goals';

/**
 * Open land corners at least two edges from any building; outside setup, touching your road or ship.
 * Setup settlements stay off closed islands, and away from volcanoes unless the room allows it.
 */
export function settlementSites(state: GameState, playerId: string, setup: boolean): string[] {
  const index = boardIndex(state.board);
  return state.board.vertices
    .filter(vertex => {
      if (state.buildings[vertex.id] || state.ck?.knights[vertex.id] || !isLandVertex(state.board, vertex.id))
        return false;
      if (vertex.edgeIds.some(id => state.buildings[otherEnd(index.edge.get(id)!, vertex.id)])) return false;
      // No settlement at either end of a relay station.
      if (vertex.edgeIds.some(id => state.relays.includes(id))) return false;
      if (setup && vertex.noSetup) return false;
      if (setup)
        return !vertex.hexIds.some(id => {
          const hex = index.hex.get(id)!;
          return hex.noSetup || (hex.terrain === 'volcano' && !state.settings.volcanoStart);
        });
      return vertex.edgeIds.some(id => pieceOn(state, playerId, id));
    })
    .map(vertex => vertex.id);
}

/** What placing a route piece looks at: a game state, or a bot's view of one. */
type RouteState = Pick<GameState, 'board' | 'roads' | 'ships' | 'buildings' | 'settings'> &
  Partial<Pick<GameState, 'lastSettlement' | 'crossings' | 'routeOf' | 'relays'>> & {
    ck?: { knights: KnightsBoard['knights'] } | null;
  };

/**
 * Can a route of `kind` continue from this corner? Through your own building, or along your own
 * piece of that kind (or of either kind, when the room lets roads and ships join anywhere). Another
 * player's building stops it, unless you may cross that player.
 */
function reaches(state: RouteState, playerId: string, vertexId: string, kind: 'road' | 'ship', skip?: string) {
  const building = state.buildings[vertexId];
  if (building?.playerId === playerId) return true;
  if (building && !crosses(state, playerId, building.playerId)) return false;
  // Cities & Knights: another player's knight blocks a road, like a building.
  const knight = state.ck?.knights[vertexId];
  if (knight && knight.playerId !== playerId) return false;
  // Called for both ends of every edge on every legal-move check, so no allocations here.
  const either = linksAnywhere(state);
  for (const id of boardIndex(state.board).vertex.get(vertexId)!.edgeIds) {
    if (id === skip) continue;
    const piece = pieceOn(state, playerId, id);
    if (piece === kind || (either && piece)) return true;
  }
  return false;
}

export function roadSites(state: RouteState, playerId: string, setup: boolean): string[] {
  return state.board.edges
    .filter(edge => {
      if (!edgeOpen(state, playerId, edge.id) || !isRoadEdge(state.board, edge.id)) return false;
      // A relay station is never crossed.
      if (state.roads[edge.id] && state.relays?.includes(edge.id)) return false;
      if (setup) return edge.a === state.lastSettlement || edge.b === state.lastSettlement;
      return [edge.a, edge.b].some(id => reaches(state, playerId, id, 'road'));
    })
    .map(edge => edge.id);
}

/**
 * Where a relay station may go: anywhere a new road could, with nothing built at either end and
 * no other relay station (anyone's) sharing a corner with it.
 */
export function relaySites(state: GameState, playerId: string): string[] {
  return cartographersRules(state) ? relaySpots(state, playerId) : [];
}

/** The rule behind relaySites, on anything with a board and pieces (bots call it with their view). */
export function relaySpots(state: RouteState & Pick<GameState, 'relays'>, playerId: string): string[] {
  const index = boardIndex(state.board);
  const relayCorners = new Set(state.relays.flatMap(id => [index.edge.get(id)!.a, index.edge.get(id)!.b]));
  // A relay station sits alone on its edge, never on one shared with a crossing route.
  return roadSites(state, playerId, false).filter(id => {
    if (edgeOwners(state, id).length) return false;
    const edge = index.edge.get(id)!;
    return [edge.a, edge.b].every(v => !state.buildings[v] && !relayCorners.has(v));
  });
}

/** Tiles that can be split: a resource tile with a number, not split yet. */
export function splitHexes(state: Pick<GameState, 'board'>): string[] {
  return state.board.hexes.filter(h => terrainResource(h.terrain) && h.number !== null && !h.split).map(h => h.id);
}

/** A split that adds `resource`: the lodestone plus one card of that resource. */
export function splitCost(resource: Resource): ResourceBag {
  return { ...BUILD_COSTS.split, [resource]: BUILD_COSTS.split[resource] + 1 };
}

/** Can this hand pay for a split that adds `resource`? */
export function affordsSplit(hand: ResourceBag, resource: Resource): boolean {
  const cost = splitCost(resource);
  return RESOURCES.every(r => hand[r] >= cost[r]);
}

/** Tiles that can be charted: producing land with room for another step (see chartedNumbers). */
export function chartHexes(state: Pick<GameState, 'board' | 'settings'>): string[] {
  return state.board.hexes
    .filter(hex => {
      if (!isProducing(hex.terrain) || hex.number === null) return false;
      if (!state.settings.chartSpecial && (hex.terrain === 'gold' || hex.terrain === 'volcano')) return false;
      return chartedNumbers(hexNumbers(hex)) !== null;
    })
    .map(hex => hex.id);
}

/** Edges beside the pirate can't take new or moved ships. */
function besidePirate(state: Pick<GameState, 'board' | 'pirate'>, edgeId: string): boolean {
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
      if (edge.id === moving || !edgeOpen(state, playerId, edge.id)) return false;
      if (!isShipEdge(state.board, edge.id) || besidePirate(state, edge.id)) return false;
      if (setup) return edge.a === state.lastSettlement || edge.b === state.lastSettlement;
      return [edge.a, edge.b].some(id => reaches(state, playerId, id, 'ship', moving));
    })
    .map(edge => edge.id);
}

/**
 * The last ship of an open route: one of its corners has neither your building nor another of
 * your ships (nor your road, when roads and ships join anywhere), so a route closed at both ends
 * stays put. It may move anywhere a new ship could go, beside any of your settlements or ships.
 */
function movableEnd(state: GameState, playerId: string, edgeId: string): boolean {
  const index = boardIndex(state.board);
  const edge = index.edge.get(edgeId)!;
  const roads = linksAnywhere(state);
  const joined = (other: string) => {
    const piece = other === edgeId ? null : pieceOn(state, playerId, other);
    return piece === 'ship' || (roads && piece === 'road');
  };
  return [edge.a, edge.b].some(
    id => state.buildings[id]?.playerId !== playerId && !index.vertex.get(id)!.edgeIds.some(joined),
  );
}

/** Each ship you may move this turn, and where it may go. */
export function shipMoves(state: GameState, playerId: string): Record<string, string[]> {
  if (state.shipMoved || state.phase !== 'build') return {};
  const moves: Record<string, string[]> = {};
  for (const edgeId of ownEdges(state, playerId, 'ship')) {
    if (state.shipsBuilt.includes(edgeId) || besidePirate(state, edgeId)) continue;
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
    for (const [edgeId, owner] of allPieces(state, 'ship'))
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
  // Friendly robber: nobody with 2 or fewer visible points is robbed or blocked. On the sea that
  // means any tile touching an end of their ship, where the pirate would stop them building on.
  const shipEnds = new Map<string, string[]>();
  for (const [edgeId, owner] of allPieces(state, 'ship')) {
    const edge = index.edge.get(edgeId)!;
    for (const v of [edge.a, edge.b]) shipEnds.set(v, [...(shipEnds.get(v) ?? []), owner]);
  }
  const protectedHex = (hexId: string) => {
    if (!state.settings.friendlyRobber) return false;
    const hex = index.hex.get(hexId)!;
    const owners = hex.vertexIds.flatMap(id => [
      ...(state.buildings[id] ? [state.buildings[id]!.playerId] : []),
      ...(hex.terrain === 'sea' ? (shipEnds.get(id) ?? []) : []),
    ]);
    return owners.some(id => id !== selfId && victoryPoints(state, id, false) <= 2);
  };
  return state.board.hexes
    .filter(hex => {
      if (hex.terrain === 'sea') return seaRules(state) && hex.id !== state.pirate && !protectedHex(hex.id);
      return isLandTerrain(hex.terrain) && hex.id !== state.robber && !protectedHex(hex.id);
    })
    .map(hex => hex.id);
}

/** Cartographers: fog tiles this player hasn't peeked at, if they hold a lodestone to pay. */
export function peekHexes(state: GameState, player: Player): string[] {
  if (!cartographersRules(state) || !canAfford(player, BUILD_COSTS.peek)) return [];
  const seen = state.fogPeeks[player.id] ?? [];
  return Object.keys(state.fog).filter(hexId => !seen.includes(hexId));
}

/** Enough cards for a development card, with jungle discoveries standing in for missing ones. */
export function affordsDevelopment(state: GameState, player: Player): boolean {
  if (!state.developmentDeck.length || state.ck) return false;
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
    relays: [],
    chartHexes: [],
    splitHexes: [],
    megacities: [],
    peekHexes: [],
    shipMoves: {},
    development: false,
  };
  const player = state.players.find(candidate => candidate.id === selfId);
  if (!player || getActivePlayerId(state) !== selfId || state.pausedAt !== null) return legal;
  const pieces = pieceCounts(state, selfId);
  const limits = pieceLimits(state, selfId);
  if (state.phase === 'setup-settlement')
    legal.settlements = routeSetupSites(state, selfId, settlementSites(state, selfId, true));
  // Starting picks from gold, volcano, or split tiles come before the setup road.
  if (state.phase === 'setup-road' && !state.pendingGold[selfId]) {
    legal.roads = roadSites(state, selfId, true);
    legal.ships = shipSites(state, selfId, true);
  }
  if (state.phase === 'robber') legal.robberHexes = robberHexes(state, selfId);
  if (state.phase === 'steal') legal.stealTargets = stealTargets(state, selfId);
  if (state.phase === 'free-roads') {
    if (pieces.roads < limits.roads) legal.roads = roadSites(state, selfId, false);
    if (pieces.ships < limits.ships) legal.ships = shipSites(state, selfId, false);
  }
  if (state.phase === 'build' || state.phase === 'special-build') {
    legal.development = affordsDevelopment(state, player);
    if (pieces.settlements < limits.settlements && canAfford(player, BUILD_COSTS.settlement))
      legal.settlements = settlementSites(state, selfId, false);
    if (pieces.roads < limits.roads && canAfford(player, BUILD_COSTS.road))
      legal.roads = roadSites(state, selfId, false);
    if (pieces.ships < limits.ships && canAfford(player, BUILD_COSTS.ship))
      legal.ships = shipSites(state, selfId, false);
    if (pieces.cities < limits.cities && canAfford(player, BUILD_COSTS.city)) {
      legal.cities = Object.entries(state.buildings)
        .filter(([, building]) => building.playerId === selfId && building.kind === 'settlement')
        .map(([vertexId]) => vertexId);
    }
    if (pieces.relays < limits.relays && canAfford(player, BUILD_COSTS.relay)) legal.relays = relaySites(state, selfId);
    if (cartographersRules(state) && canAfford(player, BUILD_COSTS.megacity))
      legal.megacities = megacitySpots(state, selfId);
    if (state.phase === 'build') {
      legal.shipMoves = shipMoves(state, selfId);
      legal.peekHexes = peekHexes(state, player);
      if (cartographersRules(state) && canAfford(player, BUILD_COSTS.chart)) legal.chartHexes = chartHexes(state);
      if (cartographersRules(state) && RESOURCES.some(r => affordsSplit(player.resources, r)))
        legal.splitHexes = splitHexes(state);
    }
  }
  return legal;
}
