import { tradeRates } from '../rules';
import { isBotGame } from '../settings';
import { type GameState, type Player, RESOURCES, type TradeBag, type TradeOffer } from '../types';
import {
  addBag,
  addLog,
  bagCount,
  bumpStat,
  canAfford,
  discoveryRule,
  emptyBag,
  getActivePlayerId,
  type Handlers,
  needPhase,
  requireRule,
} from './core';

function requireFairShape(next: GameState, give: TradeBag, want: TradeBag): void {
  requireRule(bagCount(give) > 0 && bagCount(want) > 0, 'A trade must give and receive at least one resource.');
  requireRule(
    RESOURCES.every(resource => give[resource] === 0 || want[resource] === 0) && !(give.discovery && want.discovery),
    'Give and receive different resource types.',
  );
  requireRule(
    discoveryRule(next).tradable || (!give.discovery && !want.discovery),
    'Discoveries cannot be traded in this room.',
  );
}

const clean = (bag: TradeBag): TradeBag => {
  const { discovery, ...cards } = structuredClone(bag);
  return discovery ? { ...cards, discovery } : cards;
};

function openOffer(next: GameState, offerId: string, now: number): TradeOffer {
  const offer = next.tradeOffer;
  requireRule(
    offer && offer.id === offerId && offer.expiresAt > now && offer.fromId === getActivePlayerId(next),
    'This trade offer is no longer available.',
  );
  return offer;
}

/** A recipient's answer replaces any earlier one (yes, no, or a counter). */
function clearAnswer(offer: TradeOffer, playerId: string): void {
  offer.acceptedBy = offer.acceptedBy.filter(id => id !== playerId);
  offer.declinedBy = offer.declinedBy.filter(id => id !== playerId);
  offer.counters = offer.counters.filter(counter => counter.fromId !== playerId);
}

/** `a` gives `aGives` and receives `bGives`; `b` the reverse. */
function exchange(next: GameState, a: Player, b: Player, aGives: TradeBag, bGives: TradeBag): void {
  requireRule(canAfford(a, aGives) && canAfford(b, bGives), 'Both players must have the resources in the offer.');
  addBag(a, aGives, -1);
  addBag(b, aGives);
  addBag(b, bGives, -1);
  addBag(a, bGives);
  bumpStat(next, a.id, 'trades');
  bumpStat(next, b.id, 'trades');
  next.tradeOffer = null;
}

/** In bot games an offer everyone turned down closes at once instead of waiting out its clock. */
function closeIfRefused(next: GameState): void {
  const offer = next.tradeOffer;
  if (!offer || !offer.to.every(id => offer.declinedBy.includes(id))) return;
  next.tradeOffer = null;
  addLog(next, 'Nobody took the trade.');
}

/** Drop the offer if its author can no longer pay, and any answers whose authors can't. */
export function pruneTradeOffer(next: GameState): void {
  const offer = next.tradeOffer;
  if (!offer) return;
  const owner = (id: string) => next.players.find(p => p.id === id)!;
  if (!canAfford(owner(offer.fromId), offer.give)) {
    next.tradeOffer = null;
    addLog(next, 'The trade offer closed because the offered resources changed.');
    return;
  }
  offer.acceptedBy = offer.acceptedBy.filter(id => canAfford(owner(id), offer.want));
  offer.counters = offer.counters.filter(counter => canAfford(owner(counter.fromId), counter.give));
}

export const tradeHandlers: Pick<
  Handlers,
  | 'trade'
  | 'offer-trade'
  | 'counter-trade'
  | 'accept-trade'
  | 'confirm-trade'
  | 'accept-counter'
  | 'decline-trade'
  | 'cancel-trade'
> = {
  /** Maritime trade with the bank at the player's best harbor rate, `count` times over. */
  trade({ next, player, playerId }, action) {
    needPhase(next, 'build');
    requireRule(action.give !== action.receive, 'Choose two different resource types.');
    const count = action.count ?? 1;
    const ratio = tradeRates(next, playerId)[action.give];
    requireRule(
      player.resources[action.give] >= ratio * count,
      `This maritime trade needs ${ratio * count} resources of one type.`,
    );
    requireRule(next.bank[action.receive] >= count, 'The bank does not have enough cards of that resource left.');
    player.resources[action.give] -= ratio * count;
    next.bank[action.give] += ratio * count;
    next.bank[action.receive] -= count;
    player.resources[action.receive] += count;
    addLog(
      next,
      `${player.name} traded ${ratio * count} ${action.give} for ${count === 1 ? 'one' : count} ${action.receive}.`,
      {
        kind: 'bank-trade',
        playerId,
        give: { ...emptyBag(), [action.give]: ratio * count },
        get: { ...emptyBag(), [action.receive]: count },
      },
    );
  },

  'offer-trade'({ next, player, playerId, now }, action) {
    needPhase(next, 'build');
    requireFairShape(next, action.give, action.want);
    requireRule(canAfford(player, action.give), 'You do not have the resources you are offering.');
    const others = next.players.filter(p => p.id !== playerId).map(p => p.id);
    const to = action.to ?? others;
    requireRule(to.length && to.every(id => others.includes(id)), 'Choose who receives the offer.');
    next.tradeOffer = {
      id: `trade-${next.version + 1}`,
      fromId: playerId,
      give: clean(action.give),
      want: clean(action.want),
      to: [...new Set(to)],
      acceptedBy: [],
      declinedBy: [],
      counters: [],
      createdAt: now,
      expiresAt: now + next.settings.tradeSeconds * 1000,
    };
    addLog(next, `${player.name} offered a trade.`, {
      kind: 'offer',
      playerId,
      give: next.tradeOffer.give,
      want: next.tradeOffer.want,
      to: next.tradeOffer.to,
    });
    // Against bots, nobody waits on an answer that can only be no.
    if (isBotGame(next)) {
      const offer = next.tradeOffer;
      for (const id of offer.to)
        if (!canAfford(next.players.find(p => p.id === id)!, offer.want)) offer.declinedBy.push(id);
      closeIfRefused(next);
    }
  },

  /** A recipient proposes different terms. It replaces their earlier answer. */
  'counter-trade'({ next, player, playerId, now }, action) {
    needPhase(next, 'build');
    const offer = openOffer(next, action.offerId, now);
    requireRule(offer.to.includes(playerId), 'This offer was not sent to you.');
    requireFairShape(next, action.give, action.want);
    requireRule(canAfford(player, action.give), 'You do not have the resources you are offering.');
    clearAnswer(offer, playerId);
    offer.counters.push({
      id: `counter-${next.version + 1}`,
      fromId: playerId,
      give: clean(action.give),
      want: clean(action.want),
    });
    addLog(next, `${player.name} made a counter-offer.`);
  },

  /** A recipient says yes. The offering player then picks whom to trade with (confirm-trade). */
  'accept-trade'({ next, player, playerId, now }, action) {
    needPhase(next, 'build');
    const offer = openOffer(next, action.offerId, now);
    requireRule(offer.fromId !== playerId, 'You cannot accept your own trade.');
    requireRule(offer.to.includes(playerId), 'This offer was not sent to you.');
    requireRule(canAfford(player, offer.want), 'You do not have the resources this offer asks for.');
    clearAnswer(offer, playerId);
    offer.acceptedBy.push(playerId);
  },

  'confirm-trade'({ next, player, playerId, now }, action) {
    needPhase(next, 'build');
    const offer = openOffer(next, action.offerId, now);
    requireRule(offer.fromId === playerId, 'Only the offering player can complete this trade.');
    requireRule(offer.acceptedBy.includes(action.playerId), 'That player has not accepted this offer.');
    const other = next.players.find(p => p.id === action.playerId)!;
    exchange(next, player, other, offer.give, offer.want);
    addLog(next, `${player.name} traded with ${other.name}.`, {
      kind: 'player-trade',
      fromId: playerId,
      toId: other.id,
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

  /** A recipient says no. The offer stays open, so they can still change their answer. */
  'decline-trade'({ next, playerId, now }, action) {
    needPhase(next, 'build');
    const offer = next.tradeOffer;
    requireRule(
      offer && offer.id === action.offerId && offer.expiresAt > now,
      'This trade offer is no longer available.',
    );
    requireRule(offer.fromId !== playerId, 'Cancel your own trade instead.');
    requireRule(offer.to.includes(playerId), 'This offer was not sent to you.');
    clearAnswer(offer, playerId);
    offer.declinedBy.push(playerId);
    if (isBotGame(next)) closeIfRefused(next);
  },

  'cancel-trade'({ next, player, playerId }, action) {
    needPhase(next, 'build');
    requireRule(next.tradeOffer && next.tradeOffer.id === action.offerId, 'This trade offer is no longer available.');
    requireRule(next.tradeOffer.fromId === playerId, 'Only the offering player can cancel this trade.');
    next.tradeOffer = null;
    addLog(next, `${player.name} canceled the trade offer.`);
  },
};
