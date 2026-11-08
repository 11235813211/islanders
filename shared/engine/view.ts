import { longestRoad, tradeRates, victoryPoints } from '../rules';
import { boardIndex } from '../seafaring';
import { type GameState, type GameView, RESOURCES, type Resource } from '../types';
import {
  emptyBag,
  emptyStats,
  getActivePlayerId,
  PIECE_LIMITS,
  pieceCounts,
  requireRule,
  resourceCount,
  undoEndsTurn,
} from './core';
import { legalMoves } from './legal';

/** Explicit projection: internal state and opponents' hands never reach clients. */
export function getView(state: GameState, selfId: string): GameView {
  const player = state.players.find(candidate => candidate.id === selfId);
  requireRule(player || state.spectators.some(p => p.id === selfId), 'You are not a member of this room.');
  const active = getActivePlayerId(state);
  const finished = state.phase === 'finished';
  return structuredClone({
    roomId: state.roomId,
    version: state.version,
    board: state.board,
    hostId: state.hostId,
    players: state.players.map(candidate => {
      const pieces = pieceCounts(state, candidate.id);
      return {
        id: candidate.id,
        name: candidate.name,
        color: candidate.color,
        bot: candidate.bot ?? null,
        resourceCount: resourceCount(candidate.resources),
        publicPoints: victoryPoints(state, candidate.id, false),
        points: victoryPoints(state, candidate.id, candidate.id === selfId || finished),
        developmentCount: candidate.development.length,
        knights: candidate.knights,
        discoveries: candidate.discoveries,
        bonusPoints: state.bonusPoints[candidate.id] ?? 0,
        longestRoad: longestRoad(state, candidate.id),
        roadsLeft: PIECE_LIMITS.roads - pieces.roads,
        shipsLeft: PIECE_LIMITS.ships - pieces.ships,
        settlementsLeft: PIECE_LIMITS.settlements - pieces.settlements,
        citiesLeft: PIECE_LIMITS.cities - pieces.cities,
        stats: state.stats[candidate.id] ?? emptyStats(),
      };
    }),
    phase: state.phase,
    buildings: state.buildings,
    roads: state.roads,
    ships: state.ships,
    robber: state.robber,
    pirate: state.pirate,
    // Exact bank counts reveal an opponent's hand by subtraction in a two-player
    // game. Clients only need to know whether a bank trade can receive a card.
    bank: Object.fromEntries(RESOURCES.map(resource => [resource, state.bank[resource] > 0])) as Record<
      Resource,
      boolean
    >,
    activePlayerId: active,
    turnPlayerId: ['lobby', 'finished'].includes(state.phase) ? null : (state.players[state.turnIndex]?.id ?? null),
    turn: state.turn,
    dice: state.dice,
    pendingDiscards: state.pendingDiscards,
    pendingGold: state.pendingGold,
    winnerId: state.winnerId,
    // Only the thief and the victim learn which card was stolen.
    log: state.log.map(entry =>
      entry.event?.kind === 'steal' && entry.event.thiefId !== selfId && entry.event.victimId !== selfId
        ? { ...entry, event: { ...entry.event, resource: null } }
        : entry,
    ),
    selfId,
    role: player ? 'player' : 'spectator',
    hand: player?.resources ?? emptyBag(),
    legal: legalMoves(state, selfId),
    spectators: state.spectators,
    development: player?.development ?? [],
    developmentRemaining: state.developmentDeck.length,
    playableDevelopment:
      state.pausedAt === null &&
      !state.developmentPlayed &&
      active === selfId &&
      ['roll', 'build'].includes(state.phase)
        ? (player?.development ?? [])
            .filter(c => c.kind !== 'victory-point' && c.boughtTurn < state.turn)
            .map(c => c.id)
        : [],
    tradeRates: tradeRates(state, selfId),
    longestRoadId: state.longestRoadId,
    largestArmyId: state.largestArmyId,
    turnDeadline: state.turnDeadline,
    turnExpired: state.turnExpired,
    pausedAt: state.pausedAt,
    pauseReason: state.pauseReason,
    proposal: state.proposal,
    undoAvailable: state.undo
      ? {
          actorId: state.undo.actorId,
          description: state.undo.description,
          endsTurn: undoEndsTurn(state),
        }
      : null,
    chat: state.chat,
    settings: state.settings,
    rollDeadline: state.rollDeadline,
    diceCounts: state.settings.trackDice || finished ? state.diceCounts : {},
    tradeOffer: state.tradeOffer,
    testMode: state.testMode,
    map: state.map,
    seafaring: boardIndex(state.board).seafaring,
  } satisfies GameView);
}
