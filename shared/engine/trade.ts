import { tradeRates } from '../rules';
import { type GameState, type Player, RESOURCES, type ResourceBag, type TradeOffer } from '../types';
import {
  addLog,
  bumpStat,
  canAfford,
  emptyBag,
  getActivePlayerId,
  type Handlers,
  needPhase,
  requireRule,
  resourceCount,
  TRADE_OFFER_MS,
} from './core';

function requireFairShape(give: ResourceBag, want: ResourceBag): void {
  requireRule(
    resourceCount(give) > 0 && resourceCount(want) > 0,
    'A trade must give and receive at least one resource.',
  );
  requireRule(
    RESOURCES.every(resource => give[resource] === 0 || want[resource] === 0),
    'Give and receive different resource types.',
  );
}

function openOffer(next: GameState, offerId: string, now: number): TradeOffer {
  const offer = next.tradeOffer;
  requireRule(
    offer && offer.id === offerId && offer.expiresAt > now && offer.fromId === getActivePlayerId(next),
    'This trade offer is no longer available.',
  );
  return offer;
}

/** `a` gives `aGives` and receives `bGives`; `b` the reverse. */
function exchange(next: GameState, a: Player, b: Player, aGives: ResourceBag, bGives: ResourceBag): void {
  requireRule(canAfford(a, aGives) && canAfford(b, bGives), 'Both players must have the resources in the offer.');
  for (const resource of RESOURCES) {
    a.resources[resource] += bGives[resource] - aGives[resource];
    b.resources[resource] += aGives[resource] - bGives[resource];
  }
  bumpStat(next, a.id, 'trades');
  bumpStat(next, b.id, 'trades');
  next.tradeOffer = null;
}

/** Drop the offer if its author can no longer pay, and any counters whose authors can't. */
export function pruneTradeOffer(next: GameState): void {
  const offer = next.tradeOffer;
  if (!offer) return;
  const owner = (id: string) => next.players.find(p => p.id === id)!;
  if (!canAfford(owner(offer.fromId), offer.give)) {
    next.tradeOffer = null;
    addLog(next, 'The trade offer closed because the offered resources changed.');
    return;
  }
  offer.counters = offer.counters.filter(counter => canAfford(owner(counter.fromId), counter.give));
}

export const tradeHandlers: Pick<
  Handlers,
  'trade' | 'offer-trade' | 'counter-trade' | 'accept-trade' | 'accept-counter' | 'decline-trade' | 'cancel-trade'
> = {
  /** Maritime trade with the bank at the player's best harbor rate. */
  trade({ next, player, playerId }, action) {
    needPhase(next, 'build');
    requireRule(action.give !== action.receive, 'Choose two different resource types.');
    const ratio = tradeRates(next, playerId)[action.give];
    requireRule(player.resources[action.give] >= ratio, `This maritime trade needs ${ratio} resources of one type.`);
    requireRule(next.bank[action.receive] > 0, 'The bank has no cards of that resource left.');
    player.resources[action.give] -= ratio;
    next.bank[action.give] += ratio;
    next.bank[action.receive]--;
    player.resources[action.receive]++;
    addLog(next, `${player.name} traded ${ratio} ${action.give} for one ${action.receive}.`, {
      kind: 'bank-trade',
      playerId,
      give: { ...emptyBag(), [action.give]: ratio },
      get: { ...emptyBag(), [action.receive]: 1 },
    });
  },

  'offer-trade'({ next, player, playerId, now }, action) {
    needPhase(next, 'build');
    requireFairShape(action.give, action.want);
    requireRule(canAfford(player, action.give), 'You do not have the resources you are offering.');
    const others = next.players.filter(p => p.id !== playerId).map(p => p.id);
    const to = action.to ?? others;
    requireRule(to.length && to.every(id => others.includes(id)), 'Choose who receives the offer.');
    next.tradeOffer = {
      id: `trade-${next.version + 1}`,
      fromId: playerId,
      give: structuredClone(action.give),
      want: structuredClone(action.want),
      to: [...new Set(to)],
      declinedBy: [],
      counters: [],
      createdAt: now,
      expiresAt: now + TRADE_OFFER_MS,
    };
    addLog(next, `${player.name} offered a trade.`, { kind: 'offer', playerId });
  },

  /** A recipient proposes different terms. It replaces their earlier counter. */
  'counter-trade'({ next, player, playerId, now }, action) {
    needPhase(next, 'build');
    const offer = openOffer(next, action.offerId, now);
    requireRule(offer.to.includes(playerId), 'This offer was not sent to you.');
    requireRule(!offer.declinedBy.includes(playerId), 'You already declined this offer.');
    requireFairShape(action.give, action.want);
    requireRule(canAfford(player, action.give), 'You do not have the resources you are offering.');
    offer.counters = [
      ...offer.counters.filter(counter => counter.fromId !== playerId),
      {
        id: `counter-${next.version + 1}`,
        fromId: playerId,
        give: structuredClone(action.give),
        want: structuredClone(action.want),
      },
    ];
    addLog(next, `${player.name} made a counter-offer.`);
  },

  'accept-trade'({ next, player, playerId, now }, action) {
    needPhase(next, 'build');
    const offer = openOffer(next, action.offerId, now);
    requireRule(offer.fromId !== playerId, 'You cannot accept your own trade.');
    requireRule(offer.to.includes(playerId), 'This offer was not sent to you.');
    const proposer = next.players.find(candidate => candidate.id === offer.fromId)!;
    exchange(next, proposer, player, offer.give, offer.want);
    addLog(next, `${player.name} accepted ${proposer.name}’s trade.`, {
      kind: 'player-trade',
      fromId: proposer.id,
      toId: playerId,
      give: offer.give,
      get: offer.want,
    });
  },

  'accept-counter'({ next, player, playerId, now }, action) {
    needPhase(next, 'build');
    const offer = openOffer(next, action.offerId, now);
    requireRule(offer.fromId === playerId, 'Only the offering player can accept a counter-offer.');
    const counter = offer.counters.find(c => c.id === action.counterId);
    requireRule(counter, 'That counter-offer is no longer available.');
    const other = next.players.find(p => p.id === counter.fromId)!;
    exchange(next, player, other, counter.want, counter.give);
    addLog(next, `${player.name} accepted ${other.name}’s counter-offer.`, {
      kind: 'player-trade',
      fromId: playerId,
      toId: other.id,
      give: counter.want,
      get: counter.give,
    });
  },

  'decline-trade'({ next, playerId, now }, action) {
    needPhase(next, 'build');
    const offer = next.tradeOffer;
    requireRule(
      offer && offer.id === action.offerId && offer.expiresAt > now,
      'This trade offer is no longer available.',
    );
    requireRule(offer.fromId !== playerId, 'Cancel your own trade instead.');
    requireRule(!offer.declinedBy.includes(playerId), 'You already declined this offer.');
    offer.declinedBy.push(playerId);
    offer.counters = offer.counters.filter(counter => counter.fromId !== playerId);
  },

  'cancel-trade'({ next, player, playerId }, action) {
    needPhase(next, 'build');
    requireRule(next.tradeOffer && next.tradeOffer.id === action.offerId, 'This trade offer is no longer available.');
    requireRule(next.tradeOffer.fromId === playerId, 'Only the offering player can cancel this trade.');
    next.tradeOffer = null;
    addLog(next, `${player.name} canceled the trade offer.`);
  },
};
