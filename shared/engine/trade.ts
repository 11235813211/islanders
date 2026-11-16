import { TUNING } from '../default-settings';
import { bankTradeSize, tradeRates } from '../rules';
import {
  type DeferredTrade,
  type GameState,
  type Player,
  RESOURCES,
  type ResourceBag,
  type TradeBag,
  type TradeOffer,
} from '../types';
import {
  type ActionContext,
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
  resourceCount,
  tally,
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

/** How many offers one person may have open at once. */
export const MAX_OPEN_OFFERS = TUNING.maxOpenOffers;

function openOffer(next: GameState, offerId: string, now: number): TradeOffer {
  const offer = next.tradeOffers.find(o => o.id === offerId);
  requireRule(offer && offer.expiresAt > now, 'This trade offer is no longer available.');
  return offer;
}

const dropOffer = (next: GameState, offerId: string) => {
  next.tradeOffers = next.tradeOffers.filter(o => o.id !== offerId);
};

/** Recipients who can't pay what an offer asks are answered no for them, so nobody waits on them. */
function declineUnable(next: GameState, offer: TradeOffer, now: number): void {
  for (const id of offer.to) {
    const player = next.players.find(p => p.id === id)!;
    if (canAfford(player, offer.want) || offer.declinedBy.includes(id)) continue;
    if (offer.counters.some(c => c.fromId === id)) continue;
    offer.acceptedBy = offer.acceptedBy.filter(other => other !== id);
    offer.declinedBy.push(id);
  }
  closeIfRefused(offer, now);
}

/** A recipient's answer replaces any earlier one (yes, no, or a counter). */
function clearAnswer(offer: TradeOffer, playerId: string): void {
  offer.acceptedBy = offer.acceptedBy.filter(id => id !== playerId);
  offer.declinedBy = offer.declinedBy.filter(id => id !== playerId);
  offer.counters = offer.counters.filter(counter => counter.fromId !== playerId);
}

/** `a` gives `aGives` and receives `bGives`; `b` the reverse. */
function exchange(next: GameState, a: Player, b: Player, aGives: TradeBag, bGives: TradeBag, offerId: string): void {
  requireRule(canAfford(a, aGives) && canAfford(b, bGives), 'Both players must have the resources in the offer.');
  addBag(a, aGives, -1);
  addBag(b, aGives);
  addBag(b, bGives, -1);
  addBag(a, bGives);
  bumpStat(next, a.id, 'trades');
  bumpStat(next, b.id, 'trades');
  tally(next, a.id, 'cardsOut', 'trade', bagCount(aGives));
  tally(next, a.id, 'cardsIn', 'trade', bagCount(bGives));
  tally(next, b.id, 'cardsOut', 'trade', bagCount(bGives));
  tally(next, b.id, 'cardsIn', 'trade', bagCount(aGives));
  dropOffer(next, offerId);
}

/** An offer everyone turned down stays this long so everyone can see the answers, then fades. */
const REFUSED_LINGER_MS = 2500;

/** An offer everyone turned down stops waiting out its clock: it expires after a moment (see advanceTime). */
function closeIfRefused(offer: TradeOffer, now: number): void {
  if (!offer.to.every(id => offer.declinedBy.includes(id))) return;
  offer.expiresAt = Math.min(offer.expiresAt, now + REFUSED_LINGER_MS);
}

/**
 * Trade now if the player whose turn it is takes part; otherwise the two agreed off turn and the
 * trade waits for the next turn of either (reproposeDeferred).
 */
function tradeOrDefer(
  next: GameState,
  offerId: string,
  from: Player,
  other: Player,
  give: TradeBag,
  want: TradeBag,
  log: string,
): void {
  const active = getActivePlayerId(next);
  if (from.id === active || other.id === active) {
    exchange(next, from, other, give, want, offerId);
    addLog(next, log, { kind: 'player-trade', fromId: from.id, toId: other.id, give, get: want });
    return;
  }
  requireRule(canAfford(from, give) && canAfford(other, want), 'Both players must have the resources in the offer.');
  next.deferredTrades.push({ id: `deferred-${next.version + 1}`, fromId: from.id, toId: other.id, give, want });
  dropOffer(next, offerId);
  addLog(next, `${from.name} and ${other.name} agreed to trade. It will be offered again on the next turn of either.`);
}

/**
 * At the start of a turn (and whenever they have no offer open during it), an agreed off-turn trade
 * with the player whose turn it is comes back as their offer, already accepted by the other player.
 */
export function reproposeDeferred(next: GameState, now: number): void {
  const active = getActivePlayerId(next);
  if (next.phase !== 'build' || !active || next.tradeOffers.some(o => o.fromId === active)) return;
  const index = next.deferredTrades.findIndex(d => d.fromId === active || d.toId === active);
  if (index < 0) return;
  const [deferred] = next.deferredTrades.splice(index, 1) as [DeferredTrade];
  const mine = deferred.fromId === active;
  const partnerId = mine ? deferred.toId : deferred.fromId;
  const author = next.players.find(p => p.id === active)!;
  const partner = next.players.find(p => p.id === partnerId);
  if (!partner) return;
  const give = mine ? deferred.give : deferred.want;
  const want = mine ? deferred.want : deferred.give;
  next.tradeOffers.push({
    id: `trade-${next.version + 1}`,
    fromId: active,
    give,
    want,
    to: [partnerId],
    acceptedBy: canAfford(partner, want) ? [partnerId] : [],
    declinedBy: [],
    counters: [],
    createdAt: now,
    expiresAt: now + next.settings.tradeSeconds * 1000,
  });
  addLog(next, `${author.name}’s trade agreed with ${partner.name} is offered again.`, {
    kind: 'offer',
    playerId: active,
    give,
    want,
    to: [partnerId],
  });
}

/**
 * Drop offers whose authors can no longer pay, and counters whose authors can't; anyone who can no
 * longer pay what an offer asks is answered no.
 */
export function pruneTradeOffers(next: GameState, now: number): void {
  const owner = (id: string) => next.players.find(p => p.id === id)!;
  for (const offer of [...next.tradeOffers]) {
    if (!canAfford(owner(offer.fromId), offer.give)) {
      dropOffer(next, offer.id);
      addLog(next, `${owner(offer.fromId).name}’s trade offer closed because the offered resources changed.`);
      continue;
    }
    offer.counters = offer.counters.filter(counter => canAfford(owner(counter.fromId), counter.give));
    if (offer.expiresAt > now) declineUnable(next, offer, now);
  }
}

/** Trade with the bank at the player's harbor rates (see bankTradeSize). */
function bankExchange({ next, player, playerId }: ActionContext, give: ResourceBag, receive: ResourceBag): void {
  needPhase(next, 'build');
  requireRule(
    bankTradeSize(give, receive, tradeRates(next, playerId)) !== null,
    'Give each resource in a multiple of its trade rate, one card for each.',
  );
  requireRule(canAfford(player, give), `This trade needs ${describeBag(give)}.`);
  requireRule(
    RESOURCES.every(r => next.bank[r] >= receive[r]),
    'The bank does not have enough cards of that resource left.',
  );
  addBag(player, give, -1);
  addBag(player, receive);
  for (const r of RESOURCES) next.bank[r] += give[r] - receive[r];
  bumpStat(next, playerId, 'bankTrades');
  tally(next, playerId, 'cardsOut', 'bank', resourceCount(give));
  tally(next, playerId, 'cardsIn', 'bank', resourceCount(receive));
  addLog(next, `${player.name} traded ${describeBag(give)} for ${describeBag(receive)}.`, {
    kind: 'bank-trade',
    playerId,
    give: { ...give },
    get: { ...receive },
  });
}

/** "4 sheep and 3 ore": the kinds in a bag, with "one" for a single card. */
function describeBag(bag: ResourceBag): string {
  const parts = RESOURCES.filter(r => bag[r] > 0).map(r => `${bag[r] === 1 ? 'one' : bag[r]} ${r}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]!;
}

export const tradeHandlers: Pick<
  Handlers,
  | 'trade'
  | 'bank-trade'
  | 'offer-trade'
  | 'counter-trade'
  | 'accept-trade'
  | 'confirm-trade'
  | 'accept-counter'
  | 'decline-trade'
  | 'cancel-trade'
> = {
  /** Maritime trade with the bank at the player's best harbor rate, `count` times over. */
  trade(context, action) {
    const count = action.count ?? 1;
    const ratio = tradeRates(context.next, context.playerId)[action.give];
    requireRule(action.give !== action.receive, 'Choose two different resource types.');
    bankExchange(context, { ...emptyBag(), [action.give]: ratio * count }, { ...emptyBag(), [action.receive]: count });
  },

  /** One bank trade over several kinds at their own rates (e.g. 2 sheep + 3 ore for wheat and wood). */
  'bank-trade'(context, action) {
    bankExchange(context, action.give, action.receive);
  },

  /** Anyone may offer during a turn, up to MAX_OPEN_OFFERS at once; each is answered on its own. */
  'offer-trade'({ next, player, playerId, now }, action) {
    needPhase(next, 'build');
    requireRule(
      next.tradeOffers.filter(o => o.fromId === playerId && o.expiresAt > now).length < MAX_OPEN_OFFERS,
      `You can have ${MAX_OPEN_OFFERS} offers open at once. Cancel one first.`,
    );
    requireFairShape(next, action.give, action.want);
    requireRule(canAfford(player, action.give), 'You do not have the resources you are offering.');
    const others = next.players.filter(p => p.id !== playerId).map(p => p.id);
    const to = action.to ?? others;
    requireRule(to.length && to.every(id => others.includes(id)), 'Choose who receives the offer.');
    const offer: TradeOffer = {
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
    next.tradeOffers.push(offer);
    addLog(next, `${player.name} offered a trade.`, {
      kind: 'offer',
      playerId,
      give: offer.give,
      want: offer.want,
      to: offer.to,
    });
    // Nobody waits on an answer that can only be no (the no still shows for a moment).
    declineUnable(next, offer, now);
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
    addLog(next, `${player.name} made a counter-offer.`, {
      kind: 'counter',
      playerId,
      toId: offer.fromId,
      give: clean(action.give),
      want: clean(action.want),
    });
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
    tradeOrDefer(next, offer.id, player, other, offer.give, offer.want, `${player.name} traded with ${other.name}.`);
  },

  'accept-counter'({ next, player, playerId, now }, action) {
    needPhase(next, 'build');
    const offer = openOffer(next, action.offerId, now);
    requireRule(offer.fromId === playerId, 'Only the offering player can accept a counter-offer.');
    const counter = offer.counters.find(c => c.id === action.counterId);
    requireRule(counter, 'That counter-offer is no longer available.');
    const other = next.players.find(p => p.id === counter.fromId)!;
    tradeOrDefer(
      next,
      offer.id,
      player,
      other,
      counter.want,
      counter.give,
      `${player.name} accepted ${other.name}’s counter-offer.`,
    );
  },

  /** A recipient says no. The offer stays open, so they can still change their answer. */
  'decline-trade'({ next, playerId, now }, action) {
    needPhase(next, 'build');
    const offer = openOffer(next, action.offerId, now);
    requireRule(offer.fromId !== playerId, 'Cancel your own trade instead.');
    requireRule(offer.to.includes(playerId), 'This offer was not sent to you.');
    clearAnswer(offer, playerId);
    offer.declinedBy.push(playerId);
    closeIfRefused(offer, now);
  },

  'cancel-trade'({ next, player, playerId }, action) {
    needPhase(next, 'build');
    const offer = next.tradeOffers.find(o => o.id === action.offerId);
    requireRule(offer, 'This trade offer is no longer available.');
    requireRule(offer.fromId === playerId, 'Only the offering player can cancel this trade.');
    dropOffer(next, offer.id);
    addLog(next, `${player.name} canceled the trade offer.`);
  },
};
