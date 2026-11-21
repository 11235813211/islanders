// Cities & Knights: what one seat may do with knights, walls, improvements, and progress cards.
import {
  KNIGHTS_COSTS,
  KNIGHTS_LIMITS,
  type KnightLevel,
  type KnightMoves,
  type KnightsState,
  type PROGRESS,
  TRACK_INFO,
  TRACKS,
  type Track,
} from '../knights';
import { victoryPoints } from '../rules';
import { boardIndex, isLandTerrain, isLandVertex, terrainResource } from '../seafaring';
import type { GameState } from '../types';
import { canAfford, emptyBag, getActivePlayerId, pieceCounts, pieceLimits } from './core';
import { hasPlainCity, knightReach, levelOf, robberLocked } from './knights';

const NO_MOVES = (): KnightMoves => ({
  build: [],
  activate: [],
  promote: [],
  moves: {},
  chase: [],
  walls: [],
  improve: [],
  playable: [],
  placeKnight: [],
  targets: {
    merchant: [],
    intrigue: [],
    diplomat: [],
    medicine: [],
    engineer: [],
    inventor: [],
    richer: [],
    spy: [],
    deserter: [],
  },
});

/** Knight pieces of this strength the player still has to place. */
export function knightsLeft(ck: Pick<KnightsState, 'knights'>, playerId: string, level: KnightLevel): number {
  const used = Object.values(ck.knights).filter(k => k.playerId === playerId && k.level === level).length;
  return KNIGHTS_LIMITS.knightsPerLevel - used;
}

/** Open corners on land touching one of your roads: where a new knight may stand. */
export function knightSites(state: GameState, playerId: string): string[] {
  const ck = state.ck!;
  const index = boardIndex(state.board);
  return state.board.vertices
    .filter(
      v =>
        !state.buildings[v.id] &&
        !ck.knights[v.id] &&
        isLandVertex(state.board, v.id) &&
        index.vertex.get(v.id)!.edgeIds.some(e => state.roads[e] === playerId),
    )
    .map(v => v.id);
}

/** What a city improvement to the next level costs now (the Crane takes one commodity off). */
export function improvementCost(state: GameState, playerId: string, track: Track) {
  const level = levelOf(state.ck!, playerId, track) + 1;
  const count = Math.max(0, level - (state.ck!.crane ? 1 : 0));
  return { ...emptyBag(), [TRACK_INFO[track].commodity]: count };
}

/** Can the player raise this track now: a city to improve, a level to go, the cost, and room for a metropolis? */
function canImprove(state: GameState, playerId: string, track: Track): boolean {
  const ck = state.ck!;
  const level = levelOf(ck, playerId, track);
  if (level >= KNIGHTS_LIMITS.maxLevel) return false;
  const player = state.players.find(p => p.id === playerId)!;
  if (!Object.values(state.buildings).some(b => b.playerId === playerId && b.kind === 'city')) return false;
  if (!canAfford(player, improvementCost(state, playerId, track))) return false;
  // Levels 4 and 5 can bring a metropolis, which needs a city of yours without one.
  const holder = ck.metropolis[track] ? state.buildings[ck.metropolis[track]!]?.playerId : null;
  return level + 1 < 4 || holder === playerId || hasPlainCity(state, playerId);
}

/** Your roads with a free end: no other road of yours, and no building of yours, at one end. */
export function openRoads(state: GameState): string[] {
  const index = boardIndex(state.board);
  return Object.entries(state.roads)
    .filter(([edgeId, owner]) => {
      const edge = index.edge.get(edgeId)!;
      return [edge.a, edge.b].some(
        v =>
          state.buildings[v]?.playerId !== owner &&
          !index.vertex.get(v)!.edgeIds.some(e => e !== edgeId && state.roads[e] === owner),
      );
    })
    .map(([edgeId]) => edgeId);
}

/** Opponent knights standing on a corner one of your roads touches (Intrigue). */
function knightsOnYourRoads(state: GameState, playerId: string): string[] {
  const index = boardIndex(state.board);
  return Object.entries(state.ck!.knights)
    .filter(([v, k]) => k.playerId !== playerId && index.vertex.get(v)!.edgeIds.some(e => state.roads[e] === playerId))
    .map(([v]) => v);
}

/** Land tiles with a resource beside one of your buildings (the Merchant). */
function merchantHexes(state: GameState, playerId: string): string[] {
  return state.board.hexes
    .filter(
      h =>
        isLandTerrain(h.terrain) &&
        terrainResource(h.terrain) &&
        h.vertexIds.some(v => state.buildings[v]?.playerId === playerId),
    )
    .map(h => h.id);
}

/** Tiles whose number the Inventor may swap: any number but 2, 12, 6, and 8. */
function inventorHexes(state: GameState): string[] {
  return state.board.hexes.filter(h => h.number !== null && ![2, 12, 6, 8].includes(h.number)).map(h => h.id);
}

/** Can this card be played right now (the phase, and whatever it needs being there)? */
function cardPlayable(state: GameState, playerId: string, kind: keyof typeof PROGRESS, moves: KnightMoves): boolean {
  if (kind === 'alchemist') return state.phase === 'roll';
  if (state.phase !== 'build') return false;
  const t = moves.targets;
  switch (kind) {
    case 'merchant':
      return t.merchant.length > 0;
    case 'intrigue':
      return t.intrigue.length > 0;
    case 'diplomat':
      return t.diplomat.length > 0;
    case 'medicine':
      return t.medicine.length > 0;
    case 'engineer':
      return t.engineer.length > 0;
    case 'inventor':
      return t.inventor.length > 1;
    case 'master-merchant':
      return t.richer.length > 0;
    case 'spy':
      return t.spy.length > 0;
    case 'deserter':
      return t.deserter.length > 0;
    case 'bishop':
      return !robberLocked(state);
    case 'smith':
      return Object.values(state.ck!.knights).some(k => k.playerId === playerId && k.level < 3);
    case 'warlord':
      return Object.values(state.ck!.knights).some(k => k.playerId === playerId && !k.active);
    default:
      return true;
  }
}

/** Everything the expansion lets this seat do now. Empty unless it is their move. */
export function knightMoves(state: GameState, selfId: string): KnightMoves {
  const moves = NO_MOVES();
  const ck = state.ck;
  const player = state.players.find(p => p.id === selfId);
  if (!ck || !player || state.pausedAt !== null || getActivePlayerId(state) !== selfId) return moves;
  if (state.phase === 'place-knight') {
    moves.placeKnight = knightSites(state, selfId);
    return moves;
  }
  if (state.phase !== 'build' && state.phase !== 'roll') return moves;
  const mine = Object.entries(ck.knights).filter(([, k]) => k.playerId === selfId);
  if (state.phase === 'build') {
    if (knightsLeft(ck, selfId, 1) > 0 && canAfford(player, KNIGHTS_COSTS.knight))
      moves.build = knightSites(state, selfId);
    if (canAfford(player, KNIGHTS_COSTS.activate)) moves.activate = mine.filter(([, k]) => !k.active).map(([v]) => v);
    const fortress = levelOf(ck, selfId, 'politics') >= 3;
    moves.promote = mine
      .filter(
        ([, k]) =>
          k.level < 3 &&
          k.promotedTurn !== state.turn &&
          (k.level < 2 || fortress) &&
          knightsLeft(ck, selfId, (k.level + 1) as KnightLevel) > 0 &&
          (ck.smith > 0 || canAfford(player, KNIGHTS_COSTS.promote)),
      )
      .map(([v]) => v);
    const ready = mine.filter(([, k]) => k.active && k.activeTurn < state.turn);
    for (const [v] of ready) {
      const to = knightReach(state, selfId, v, false);
      if (to.length) moves.moves[v] = to;
    }
    if (!robberLocked(state)) {
      const robber = boardIndex(state.board).hex.get(state.robber);
      moves.chase = ready.filter(([v]) => robber?.vertexIds.includes(v)).map(([v]) => v);
    }
    const ownWalls = ck.walls.filter(v => state.buildings[v]?.playerId === selfId).length;
    const wallSpots = Object.entries(state.buildings)
      .filter(([v, b]) => b.playerId === selfId && b.kind === 'city' && !ck.walls.includes(v))
      .map(([v]) => v);
    if (ownWalls < KNIGHTS_LIMITS.walls) {
      if (canAfford(player, KNIGHTS_COSTS.wall)) moves.walls = wallSpots;
      moves.targets.engineer = wallSpots;
    }
    moves.improve = TRACKS.filter(t => canImprove(state, selfId, t));
    moves.targets.merchant = merchantHexes(state, selfId);
    moves.targets.intrigue = knightsOnYourRoads(state, selfId);
    moves.targets.diplomat = openRoads(state);
    if (pieceCounts(state, selfId).cities < pieceLimits(state, selfId).cities)
      moves.targets.medicine = Object.entries(state.buildings)
        .filter(([, b]) => b.playerId === selfId && b.kind === 'settlement')
        .map(([v]) => v);
    moves.targets.inventor = inventorHexes(state);
    const points = victoryPoints(state, selfId, false);
    const others = state.players.filter(p => p.id !== selfId);
    moves.targets.richer = others.filter(p => victoryPoints(state, p.id, false) > points).map(p => p.id);
    moves.targets.spy = others.filter(p => (ck.hands[p.id] ?? []).length > 0).map(p => p.id);
    moves.targets.deserter = others
      .filter(p => Object.values(ck.knights).some(k => k.playerId === p.id))
      .map(p => p.id);
  }
  moves.playable = (ck.hands[selfId] ?? [])
    .filter(card => cardPlayable(state, selfId, card.kind, moves))
    .map(card => card.id);
  return moves;
}
