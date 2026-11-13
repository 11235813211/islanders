import { chartedNumbers, hexNumbers, linksAnywhere, victoryPoints } from '../rules';
import {
  boardIndex,
  isLandTerrain,
  isLandVertex,
  isProducing,
  isRoadEdge,
  isShipEdge,
  isWater,
  otherEnd,
} from '../seafaring';
import { type GameState, type LegalMoves, type Player, RESOURCES } from '../types';
import {
  BUILD_COSTS,
  canAfford,
  cartographersRules,
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
      // No settlement at either end of a relay station.
      if (vertex.edgeIds.some(id => state.relays.includes(id))) return false;
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

/** What placing a route piece looks at: a game state, or a bot's view of one. */
type RouteState = Pick<GameState, 'board' | 'roads' | 'ships' | 'buildings' | 'settings'> &
  Partial<Pick<GameState, 'lastSettlement'>>;

/**
 * Can a route of `kind` continue from this corner? Through your own building, or along your own
 * piece of that kind (or of either kind, when the room lets roads and ships join anywhere).
 */
function reaches(state: RouteState, playerId: string, vertexId: string, kind: 'roads' | 'ships', skip?: string) {
  const building = state.buildings[vertexId];
  if (building) return building.playerId === playerId;
  // Called for both ends of every edge on every legal-move check, so no allocations here.
  const either = linksAnywhere(state);
  const own = state[kind];
  for (const id of boardIndex(state.board).vertex.get(vertexId)!.edgeIds) {
    if (id === skip) continue;
    if (own[id] === playerId || (either && (state.roads[id] === playerId || state.ships[id] === playerId))) return true;
  }
  return false;
}

export function roadSites(state: RouteState, playerId: string, setup: boolean): string[] {
  return state.board.edges
    .filter(edge => {
      if (state.roads[edge.id] || state.ships[edge.id] || !isRoadEdge(state.board, edge.id)) return false;
      if (setup) return edge.a === state.lastSettlement || edge.b === state.lastSettlement;
      return [edge.a, edge.b].some(id => reaches(state, playerId, id, 'roads'));
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
  return roadSites(state, playerId, false).filter(id => {
    const edge = index.edge.get(id)!;
    return [edge.a, edge.b].every(v => !state.buildings[v] && !relayCorners.has(v));
  });
}

/**
 * Your ships that may become survey ships: out at sea (no land on either side), away from the
 * pirate, and not beside a tile another survey ship (anyone's) already borders.
 */
export function surveySites(state: GameState, playerId: string): string[] {
  return cartographersRules(state) ? surveySpots(state, playerId) : [];
}

/** The rule behind surveySites, on anything with a board and ships (bots call it with their view). */
export function surveySpots(
  state: Pick<GameState, 'board' | 'ships' | 'surveys' | 'pirate'>,
  playerId: string,
): string[] {
  const index = boardIndex(state.board);
  const surveyed = new Set(state.surveys.flatMap(id => index.edgeHexes.get(id)!.map(h => h.id)));
  return Object.keys(state.ships).filter(id => {
    if (state.ships[id] !== playerId || state.surveys.includes(id) || besidePirate(state, id)) return false;
    const hexes = index.edgeHexes.get(id)!;
    return hexes.every(h => isWater(h.terrain) && !surveyed.has(h.id));
  });
}

/** Tiles a survey ship may chart: producing land with room for another step (see chartedNumbers). */
export function chartHexes(state: Pick<GameState, 'board' | 'settings'>): string[] {
  return state.board.hexes
    .filter(hex => {
      if (!isProducing(hex.terrain) || hex.number === null) return false;
      if (!state.settings.chartSpecial && (hex.terrain === 'gold' || hex.terrain === 'volcano')) return false;
      return chartedNumbers(hexNumbers(hex), true) !== null;
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
      if (edge.id === moving || state.roads[edge.id] || (state.ships[edge.id] && edge.id !== moving)) return false;
      if (!isShipEdge(state.board, edge.id) || besidePirate(state, edge.id)) return false;
      if (setup) return edge.a === state.lastSettlement || edge.b === state.lastSettlement;
      return [edge.a, edge.b].some(id => reaches(state, playerId, id, 'ships', moving));
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
  const joined = (other: string) =>
    other !== edgeId && (state.ships[other] === playerId || (roads && state.roads[other] === playerId));
  return [edge.a, edge.b].some(
    id => state.buildings[id]?.playerId !== playerId && !index.vertex.get(id)!.edgeIds.some(joined),
  );
}

/** Each ship you may move this turn, and where it may go. */
export function shipMoves(state: GameState, playerId: string): Record<string, string[]> {
  if (state.shipMoved || state.phase !== 'build') return {};
  const moves: Record<string, string[]> = {};
  for (const [edgeId, owner] of Object.entries(state.ships)) {
    if (owner !== playerId || state.shipsBuilt.includes(edgeId) || besidePirate(state, edgeId)) continue;
    // A survey ship stays where it is.
    if (state.surveys.includes(edgeId)) continue;
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
  // Friendly robber: nobody with 2 or fewer visible points is robbed or blocked. On the sea that
  // means any tile touching an end of their ship, where the pirate would stop them building on.
  const shipEnds = new Map<string, string[]>();
  for (const [edgeId, owner] of Object.entries(state.ships)) {
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
    relays: [],
    surveys: [],
    chartHexes: [],
    shipMoves: {},
    development: false,
  };
  const player = state.players.find(candidate => candidate.id === selfId);
  // Charting is off-turn; tiles show from the 7 on, so a choice can be lined up during the robber.
  if (player && state.pendingCharts[selfId] && state.pausedAt === null) legal.chartHexes = chartHexes(state);
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
    if (pieces.relays < PIECE_LIMITS.relays && canAfford(player, BUILD_COSTS.relay))
      legal.relays = relaySites(state, selfId);
    if (pieces.surveys < PIECE_LIMITS.surveys && canAfford(player, BUILD_COSTS.survey))
      legal.surveys = surveySites(state, selfId);
    if (state.phase === 'build') legal.shipMoves = shipMoves(state, selfId);
  }
  return legal;
}
