import { copyData } from '../copy';
import { boardExpansions, FOG_POOL, type Pool } from '../maps/types';
import { longestRoad, tradeRates, victoryPoints } from '../rules';
import { bankShown } from '../settings';
import { type GameState, type GameView, RESOURCES, type Resource } from '../types';
import {
  discoveriesLeft,
  emptyBag,
  emptyStats,
  getActivePlayerId,
  PIECE_LIMITS,
  pieceCounts,
  requireRule,
  resourceCount,
  seaRules,
  undoEndsTurn,
} from './core';
import { legalMoves } from './legal';

/**
 * What the map has, or may draw from its random land: sea (so it needs Seafarers), volcanoes, and
 * the share of its fog mix that turns out to be producing land (public: the map shows its mix).
 */
function mapFeatures(state: GameState): GameView['features'] {
  const design = state.design;
  if (!design) return { sea: false, volcano: false, fogLand: 0 };
  const random = design.tiles.some(t => t.kind === 'land');
  const draws = (pool: Pool | undefined) => random && (pool?.volcano ?? 0) > 0;
  const fogVolcano = design.tiles.some(t => t.kind === 'fog') && ((design.fogPool ?? FOG_POOL).volcano ?? 0) > 0;
  const fog = Object.entries(design.fogPool ?? FOG_POOL);
  const fogTotal = fog.reduce((n, [, c]) => n + (c ?? 0), 0);
  const fogLand = fog.reduce((n, [k, c]) => n + (k === 'sea' || k === 'desert' ? 0 : (c ?? 0)), 0);
  return {
    fogLand: fogTotal ? fogLand / fogTotal : 0,
    sea: boardExpansions(design).includes('seafarers'),
    volcano:
      design.tiles.some(t => t.kind === 'volcano') ||
      draws(design.pool) ||
      Object.values(design.islandPools ?? {}).some(draws) ||
      fogVolcano,
  };
}

const frozen = new WeakSet<GameView['board']>();

/** Deep-freeze a board once (copying it on every view was most of a bot move's CPU time). */
function freezeBoard(board: GameView['board']): GameView['board'] {
  if (frozen.has(board)) return board;
  const deep = (value: unknown) => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
    for (const child of Object.values(value)) deep(child);
    Object.freeze(value);
  };
  deep(board);
  frozen.add(board);
  return board;
}

/** Explicit projection: internal state and opponents' hands never reach clients. */
export function getView(state: GameState, selfId: string): GameView {
  const player = state.players.find(candidate => candidate.id === selfId);
  requireRule(player || state.spectators.some(p => p.id === selfId), 'You are not a member of this room.');
  const active = getActivePlayerId(state);
  const finished = state.phase === 'finished';
  // The board is shared, not copied (states never change a board in place, see cloneState), and
  // frozen so a view still can't change the game.
  const view = copyData({
    roomId: state.roomId,
    version: state.version,
    board: null as unknown as GameView['board'],
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
    likelyHands: player?.bot ? state.handGuess.likely : null,
    // Exact bank counts reveal an opponent's hand by subtraction in a two-player
    // game, so by default they are sent only with three or more players (bankShown).
    bank: Object.fromEntries(RESOURCES.map(resource => [resource, state.bank[resource] > 0])) as Record<
      Resource,
      boolean
    >,
    bankCounts: bankShown(state.settings, state.players.length) ? state.bank : null,
    discoveryInSupply: discoveriesLeft(state) > 0,
    discoveryBank:
      bankShown(state.settings, state.players.length) && state.board.hexes.some(h => h.terrain === 'jungle')
        ? discoveriesLeft(state)
        : null,
    jungle: state.board.hexes.some(h => h.terrain === 'jungle'),
    activePlayerId: active,
    turnPlayerId: ['lobby', 'finished'].includes(state.phase) ? null : (state.players[state.turnIndex]?.id ?? null),
    turn: state.turn,
    dice: state.dice,
    pendingDiscards: state.pendingDiscards,
    pendingGold: state.pendingGold,
    goldDeadline: state.goldDeadline,
    robberDeadline: state.robberDeadline,
    eruption: state.eruption,
    specialQueue: state.specialQueue,
    specialAsked: state.specialAsked,
    features: mapFeatures(state),
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
    seafaring: seaRules(state),
  } satisfies GameView);
  view.board = freezeBoard(state.board);
  return view;
}
