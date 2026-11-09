import { type DevelopmentType, RESOURCES, type TradeBag } from '../types';
import {
  addBag,
  addLog,
  BUILD_COSTS,
  bagCount,
  discoveryRule,
  emptyBag,
  type Handlers,
  needPhase,
  PIECE_LIMITS,
  pay,
  pieceCounts,
  requireRule,
  resourceCount,
} from './core';
import { roadSites, shipSites } from './legal';

type PlayAction = 'play-knight' | 'play-road-building' | 'play-monopoly' | 'play-plenty';
const CARD_FOR: Record<PlayAction, DevelopmentType> = {
  'play-knight': 'knight',
  'play-road-building': 'road-building',
  'play-monopoly': 'monopoly',
  'play-plenty': 'year-of-plenty',
};

/** Shared checks for playing a card; returns the card's index in the hand. */
function takeCard(ctx: Parameters<Handlers['play-knight']>[0], type: PlayAction, cardId: string): number {
  const { next, player } = ctx;
  requireRule(['roll', 'build'].includes(next.phase), 'Play development cards before rolling or while building.');
  requireRule(!next.developmentPlayed, 'Only one development card may be played each turn.');
  const index = player.development.findIndex(
    c => c.id === cardId && c.kind === CARD_FOR[type] && c.boughtTurn < next.turn,
  );
  requireRule(index >= 0, 'Choose a development card bought on an earlier turn.');
  return index;
}

function finishPlay(
  ctx: Parameters<Handlers['play-knight']>[0],
  index: number,
  type: PlayAction,
  gains: TradeBag | null,
) {
  const { next, player, playerId } = ctx;
  player.development.splice(index, 1);
  next.developmentPlayed = true;
  const card = CARD_FOR[type];
  addLog(next, `${player.name} played ${card.replaceAll('-', ' ')}.`, { kind: 'development', playerId, card, gains });
}

export const developmentHandlers: Pick<
  Handlers,
  'buy-development' | 'play-knight' | 'play-road-building' | 'play-monopoly' | 'play-plenty'
> = {
  'buy-development'({ next, player, playerId }) {
    needPhase(next, 'build', 'special-build');
    requireRule(next.developmentDeck.length, 'The development deck is empty.');
    // Jungle discoveries stand in for card costs first, one per resource, covering missing cards first.
    const cost = { ...BUILD_COSTS.development };
    const order = [...RESOURCES].sort((a, b) => player.resources[a] - player.resources[b]);
    for (const r of order)
      if (cost[r] && player.discoveries > 0) {
        cost[r]--;
        player.discoveries--;
      }
    pay(next, player, cost);
    player.development.push({ ...next.developmentDeck.pop()!, boughtTurn: next.turn });
    addLog(next, `${player.name} bought a development card.`, { kind: 'build', playerId, piece: 'development' });
  },

  'play-knight'(ctx, action) {
    const index = takeCard(ctx, action.type, action.cardId);
    ctx.player.knights++;
    ctx.next.resumePhase = ctx.next.phase as 'roll' | 'build';
    ctx.next.phase = 'robber';
    finishPlay(ctx, index, action.type, null);
  },

  'play-road-building'(ctx, action) {
    const { next, playerId } = ctx;
    const index = takeCard(ctx, action.type, action.cardId);
    const pieces = pieceCounts(next, playerId);
    const roads = pieces.roads < PIECE_LIMITS.roads && roadSites(next, playerId, false).length > 0;
    const ships = pieces.ships < PIECE_LIMITS.ships && shipSites(next, playerId, false).length > 0;
    requireRule(roads || ships, 'No roads or ships can be placed.');
    next.resumePhase = next.phase as 'roll' | 'build';
    next.phase = 'free-roads';
    const left = (roads ? PIECE_LIMITS.roads - pieces.roads : 0) + (ships ? PIECE_LIMITS.ships - pieces.ships : 0);
    next.freeRoads = Math.min(2, left);
    finishPlay(ctx, index, action.type, null);
  },

  'play-monopoly'(ctx, action) {
    const { next, player, playerId } = ctx;
    const resource = action.resource;
    requireRule(
      resource !== 'discovery' || discoveryRule(next).stealable,
      'Monopoly cannot take discoveries in this room.',
    );
    const index = takeCard(ctx, action.type, action.cardId);
    const gains: TradeBag = emptyBag();
    for (const other of next.players) {
      if (other.id === playerId) continue;
      const taken: TradeBag = {
        ...emptyBag(),
        [resource]: resource === 'discovery' ? other.discoveries : other.resources[resource],
      };
      addBag(other, taken, -1);
      addBag(player, taken);
      gains[resource] = (gains[resource] ?? 0) + (taken[resource] ?? 0);
    }
    finishPlay(ctx, index, action.type, gains);
  },

  'play-plenty'(ctx, action) {
    const { next, player } = ctx;
    const finds = action.resources.discovery ?? 0;
    requireRule(!finds || discoveryRule(next).stealable, 'Year of Plenty cannot take discoveries in this room.');
    const index = takeCard(ctx, action.type, action.cardId);
    // Discoveries come from the jungle, not the bank, so they never run out.
    const available = resourceCount(next.bank) + (discoveryRule(next).stealable ? 2 : 0);
    requireRule(
      available > 0 && bagCount(action.resources) === Math.min(2, available),
      'Choose two available resources, or all remaining cards if only one is left.',
    );
    requireRule(
      RESOURCES.every(r => next.bank[r] >= action.resources[r]),
      'The bank does not have those resources.',
    );
    for (const r of RESOURCES) next.bank[r] -= action.resources[r];
    addBag(player, action.resources);
    finishPlay(ctx, index, action.type, action.resources);
  },
};
