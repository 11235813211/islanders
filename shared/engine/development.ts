import { type DevelopmentType, type Player, RESOURCES, type ResourceBag, type TradeBag } from '../types';
import {
  addBag,
  addLog,
  BUILD_COSTS,
  bagCount,
  discoveriesLeft,
  discoveryRule,
  emptyBag,
  type Handlers,
  needPhase,
  pay,
  pieceCounts,
  pieceLimits,
  requireRule,
  resourceCount,
  tally,
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
  tally(next, playerId, 'played', card);
  addLog(next, `${player.name} played ${card.replaceAll('-', ' ')}.`, { kind: 'development', playerId, card, gains });
}

/** Without a choice, discoveries pay first, covering the cards you are missing before the others. */
export function defaultDiscoveries(player: Player): ResourceBag {
  const covered = emptyBag();
  let left = player.discoveries;
  const order = [...RESOURCES].sort((a, b) => player.resources[a] - player.resources[b]);
  for (const r of order)
    if (BUILD_COSTS.development[r] && left > 0) {
      covered[r] = 1;
      left--;
    }
  return covered;
}

export const developmentHandlers: Pick<
  Handlers,
  'buy-development' | 'play-knight' | 'play-road-building' | 'play-monopoly' | 'play-plenty'
> = {
  'buy-development'({ next, player, playerId }, action) {
    needPhase(next, 'build', 'special-build');
    requireRule(next.developmentDeck.length, 'The development deck is empty.');
    const cost = { ...BUILD_COSTS.development };
    const covered = action.discoveries ?? defaultDiscoveries(player);
    requireRule(
      RESOURCES.every(r => covered[r] <= cost[r]) && resourceCount(covered) <= player.discoveries,
      'Discoveries can pay for each of the card’s resources once.',
    );
    for (const r of RESOURCES) cost[r] -= covered[r];
    pay(next, player, cost);
    player.discoveries -= resourceCount(covered);
    tally(next, playerId, 'cardsOut', 'build', resourceCount(covered));
    tally(next, playerId, 'built', 'development');
    player.development.push({ ...next.developmentDeck.pop()!, boughtTurn: next.turn });
    addLog(next, `${player.name} bought a development card.`, {
      kind: 'build',
      playerId,
      piece: 'development',
      paid: cost,
    });
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
    const limits = pieceLimits(next, playerId);
    const roads = pieces.roads < limits.roads && roadSites(next, playerId, false).length > 0;
    const ships = pieces.ships < limits.ships && shipSites(next, playerId, false).length > 0;
    requireRule(roads || ships, 'No roads or ships can be placed.');
    next.resumePhase = next.phase as 'roll' | 'build';
    next.phase = 'free-roads';
    const left = (roads ? limits.roads - pieces.roads : 0) + (ships ? limits.ships - pieces.ships : 0);
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
      tally(next, other.id, 'cardsOut', 'monopoly', bagCount(taken));
      tally(next, playerId, 'cardsIn', 'monopoly', bagCount(taken));
      gains[resource] = (gains[resource] ?? 0) + (taken[resource] ?? 0);
    }
    finishPlay(ctx, index, action.type, gains);
  },

  'play-plenty'(ctx, action) {
    const { next, player } = ctx;
    const finds = action.resources.discovery ?? 0;
    requireRule(!finds || discoveryRule(next).stealable, 'Year of Plenty cannot take discoveries in this room.');
    const index = takeCard(ctx, action.type, action.cardId);
    const left = discoveryRule(next).stealable ? discoveriesLeft(next) : 0;
    const available = resourceCount(next.bank) + left;
    requireRule(
      available > 0 && bagCount(action.resources) === Math.min(2, available),
      'Choose two available resources, or all remaining cards if only one is left.',
    );
    requireRule(
      RESOURCES.every(r => next.bank[r] >= action.resources[r]),
      'The bank does not have those resources.',
    );
    requireRule(finds <= left, 'There are not that many discoveries left.');
    for (const r of RESOURCES) next.bank[r] -= action.resources[r];
    addBag(player, action.resources);
    tally(next, player.id, 'cardsIn', 'plenty', bagCount(action.resources));
    finishPlay(ctx, index, action.type, action.resources);
  },
};
