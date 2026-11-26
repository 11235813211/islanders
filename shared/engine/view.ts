import { copyData } from '../copy';
import { type KnightsView, TRACKS } from '../knights';
import { fogLandShare, fogMayErupt } from '../maps/fog';
import { routeFinished } from '../maps/special';
import { boardExpansions, type Pool } from '../maps/types';
import { longestRoad, megacityCount, tradeRates, victoryPoints } from '../rules';
import { bankShown } from '../settings';
import { type GameState, type GameView, type PlayerStats, RESOURCES, type Resource } from '../types';
import {
  cartographersRules,
  discoveriesLeft,
  emptyBag,
  emptyStats,
  getActivePlayerId,
  pieceCounts,
  pieceLimits,
  requireRule,
  resourceCount,
  seaRules,
  undoEndsTurn,
} from './core';
import { knightMoves } from './knights-legal';
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
  return {
    fogLand: fogLandShare(design),
    sea: boardExpansions(design).includes('seafarers'),
    volcano:
      design.tiles.some(t => t.kind === 'volcano' || draws(t.landMix?.pool)) ||
      draws(design.pool) ||
      fogMayErupt(design),
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

/** A player's stats; their dice totals stay hidden mid-game in rooms that don't track dice. */
function publicStats(state: GameState, playerId: string): PlayerStats {
  const stats = state.stats[playerId] ?? emptyStats();
  return state.settings.trackDice || state.phase === 'finished' ? stats : { ...stats, rolls: {} };
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
    inviteCode: state.inviteCode,
    boardPlayers: state.boardPlayers,
    version: state.version,
    board: null as unknown as GameView['board'],
    hostId: state.hostId,
    colorSwaps: state.colorSwaps,
    mapProposals: state.mapProposals,
    players: state.players.map(candidate => {
      const pieces = pieceCounts(state, candidate.id);
      const limits = pieceLimits(state, candidate.id);
      const route = state.routeOf[candidate.id] ?? null;
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
        route,
        routeDone: routeFinished(state.board, state.buildings, candidate.id, route),
        peakPoints: state.peakPoints[candidate.id] ?? 0,
        longestRoad: longestRoad(state, candidate.id),
        roadsLeft: limits.roads - pieces.roads,
        shipsLeft: limits.ships - pieces.ships,
        relaysLeft: limits.relays - pieces.relays,
        megacities: megacityCount(state, candidate.id),
        settlementsLeft: limits.settlements - pieces.settlements,
        citiesLeft: limits.cities - pieces.cities,
        stats: publicStats(state, candidate.id),
      };
    }),
    phase: state.phase,
    buildings: state.buildings,
    roads: state.roads,
    ships: state.ships,
    crossings: state.crossings,
    routeOf: state.routeOf,
    relays: state.relays,
    megacities: state.megacities,
    cartographers: cartographersRules(state),
    // Once the game is over, every fog tile shows what it hid.
    fogPeeks: Object.fromEntries(
      (finished ? Object.keys(state.fog) : (state.fogPeeks[selfId] ?? [])).flatMap(hexId =>
        state.fog[hexId] ? [[hexId, state.fog[hexId]]] : [],
      ),
    ),
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
    setupOrder: state.setupOrder,
    setupIndex: state.setupIndex,
    turnPlayerId: ['lobby', 'pick-board', 'finished'].includes(state.phase)
      ? null
      : (state.players[state.turnIndex]?.id ?? null),
    turn: state.turn,
    dice: state.dice,
    pendingDiscards: state.pendingDiscards,
    pendingGold: state.pendingGold,
    pendingSplit: state.pendingSplit,
    goldDeadline: state.goldDeadline,
    robberDeadline: state.robberDeadline,
    discardDeadline: state.discardDeadline,
    turnHeldAt: state.turnHeldAt,
    eruption: state.eruption,
    specialQueue: state.specialQueue,
    specialAsked: state.specialAsked,
    specialTraded: state.specialTraded,
    northPole: state.northPole,
    features: mapFeatures(state),
    winnerId: state.winnerId,
    // Only the thief and the victim learn which card was stolen.
    log: state.log.map(entry => {
      const event = entry.event;
      if (event?.kind === 'steal' && event.thiefId !== selfId && event.victimId !== selfId)
        return { ...entry, event: { ...event, resource: null } };
      return entry;
    }),
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
    tradeOffers: state.tradeOffers,
    testMode: state.testMode,
    map: state.map,
    seafaring: seaRules(state),
    boardPick: state.phase === 'pick-board' ? { shown: state.boardShown + 1, count: state.boardSeeds.length } : null,
    ck: knightsView(state, selfId),
  } satisfies GameView);
  view.board = freezeBoard(state.board);
  return view;
}

/** Cities & Knights as one seat sees it: decks and other hands only as counts. */
function knightsView(state: GameState, selfId: string): KnightsView | null {
  if (!state.ck) return null;
  const { decks, hands, sabotage: _sabotage, bishop: _bishop, ...board } = state.ck;
  return {
    ...board,
    deckCounts: Object.fromEntries(TRACKS.map(t => [t, decks[t].length])) as KnightsView['deckCounts'],
    handCounts: Object.fromEntries(Object.entries(hands).map(([id, cards]) => [id, cards.length])),
    hand: hands[selfId] ?? [],
    legal: knightMoves(state, selfId),
  };
}
