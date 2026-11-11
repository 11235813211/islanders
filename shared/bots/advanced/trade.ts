import { emptyBag } from '../../engine/core';
import {
  type GameAction,
  type GameView,
  RESOURCES,
  type Resource,
  type ResourceBag,
  type TradeBag,
  type TradeOffer,
} from '../../types';
import type { Economy } from './economy';
import { threat } from './robber';

/**
 * Trades with other players. A trade is worth our gain in hand value (Economy.handValue) minus
 * a share of what it is worth to the partner, scaled by how close they are to winning. Offers
 * try the deal most in our favor first, then fairer ones, a few per turn.
 */

const apply = (hand: ResourceBag, get: TradeBag, give: TradeBag): ResourceBag => {
  const out = { ...hand };
  for (const r of RESOURCES) out[r] += (get[r] ?? 0) - (give[r] ?? 0);
  return out;
};

const bag = (r: Resource, n: number): ResourceBag => ({ ...emptyBag(), [r]: n });

const count = (bag: TradeBag) => RESOURCES.reduce((n, r) => n + (bag[r] ?? 0), 0);

/** Net worth to us of getting `get` for `give` with this partner, or -Infinity if we can't or won't. */
export function tradeGain(econ: Economy, partnerId: string, get: TradeBag, give: TradeBag): number {
  const { view, knobs } = econ;
  const partner = view.players.find(p => p.id === partnerId);
  if (!partner || partner.publicPoints >= view.settings.victoryPoints - knobs.tradeCutoff) return -Infinity;
  const after = apply(view.hand, get, give);
  if (RESOURCES.some(r => after[r] < 0)) return -Infinity;
  const ours = econ.handValue(after) - econ.handValue(view.hand);
  // Assume the partner gains about what a card is worth to a player saving for something.
  const theirs = 0.12 * Math.max(0, count(give) - count(get) + 1);
  return ours - knobs.partnerGain * theirs * threat(econ, partnerId);
}

/**
 * Answer an offer sent to us: yes if it's good for us; otherwise a counter (we give what they
 * asked for, but take a card we need instead) when that would be; otherwise no.
 */
export function respond(econ: Economy, offer: TradeOffer): GameAction {
  const { knobs, view } = econ;
  if (tradeGain(econ, offer.fromId, offer.give, offer.want) > knobs.tradeMargin)
    return { type: 'accept-trade', offerId: offer.id };
  const goal = econ.bestGoal();
  if (knobs.counters >= 0.5 && goal && !counteredLately(econ, offer.fromId)) {
    let best: { want: ResourceBag; gain: number } | null = null;
    for (const r of RESOURCES) {
      if (view.hand[r] >= goal.cost[r] || (offer.want[r] ?? 0) > 0) continue;
      const want = bag(r, 1);
      const gain = tradeGain(econ, offer.fromId, want, offer.want);
      if (gain > knobs.tradeMargin && (!best || gain > best.gain)) best = { want, gain };
    }
    if (best) {
      const give = Object.fromEntries(RESOURCES.map(r => [r, offer.want[r] ?? 0])) as ResourceBag;
      return { type: 'counter-trade', offerId: offer.id, give, want: best.want };
    }
  }
  return { type: 'decline-trade', offerId: offer.id };
}

/**
 * Whether we countered this person's offers in the last two rounds: a person who asks again has
 * heard our terms, and the same counter every time is just noise. Bots get countered freely.
 */
function counteredLately(econ: Economy, fromId: string): boolean {
  const { view } = econ;
  if (view.players.find(p => p.id === fromId)?.bot) return false;
  const since = view.turn - 2 * view.players.length;
  return view.log.some(
    e =>
      (e.turn ?? 0) > since &&
      e.event?.kind === 'counter' &&
      e.event.playerId === view.selfId &&
      e.event.toId === fromId,
  );
}

/** Our own offer has its answers: trade with the least dangerous taker, or the best counter. */
export function review(econ: Economy, offer: TradeOffer): GameAction {
  const partner = [...offer.acceptedBy].sort((a, b) => threat(econ, a) - threat(econ, b))[0];
  if (partner) return { type: 'confirm-trade', offerId: offer.id, playerId: partner };
  let best: { id: string; gain: number } | null = null;
  for (const c of offer.counters) {
    const gain = tradeGain(econ, c.fromId, c.give, c.want);
    if (gain > econ.knobs.tradeMargin && (!best || gain > best.gain)) best = { id: c.id, gain };
  }
  return best
    ? { type: 'accept-counter', offerId: offer.id, counterId: best.id }
    : { type: 'cancel-trade', offerId: offer.id };
}

interface Candidate {
  give: ResourceBag;
  want: ResourceBag;
  gain: number;
  /** Fair (1 for 1) or in the partner's favor: fine to send to people. */
  fair: boolean;
}

/** Offers worth making now, best for us first. */
function candidates(econ: Economy): Candidate[] {
  const { view, knobs } = econ;
  const goal = econ.bestGoal();
  if (!goal) return [];
  const wants = RESOURCES.filter(r => view.hand[r] < goal.cost[r]);
  const spares = RESOURCES.filter(r => view.hand[r] > goal.cost[r]);
  const base = econ.handValue(view.hand);
  const out: Candidate[] = [];
  const consider = (give: ResourceBag, want: ResourceBag, fair: boolean) => {
    const after = apply(view.hand, want, give);
    if (RESOURCES.some(r => after[r] < 0)) return;
    const gain = econ.handValue(after) - base;
    if (gain > knobs.tradeMargin) out.push({ give, want, gain, fair });
  };
  for (const w of wants)
    for (const s of spares) {
      if (knobs.greedyOffers >= 0.5 && goal.cost[w] - view.hand[w] >= 2) consider(bag(s, 1), bag(w, 2), false);
      consider(bag(s, 1), bag(w, 1), true);
      if (knobs.generousOffers >= 0.5 && view.hand[s] - goal.cost[s] >= 2) consider(bag(s, 2), bag(w, 1), true);
    }
  // Greedier deals first (when enabled); among equals, the one we gain most from.
  return out.sort((a, b) => count(a.give) / count(a.want) - count(b.give) / count(b.want) || b.gain - a.gain);
}

/** Offers this seat made this turn (from the log). */
function offersThisTurn(view: GameView): { give: TradeBag; want: TradeBag }[] {
  return view.log
    .filter(e => e.turn === view.turn && e.event?.kind === 'offer' && e.event.playerId === view.selfId)
    .map(e => e.event as { give: TradeBag; want: TradeBag });
}

const same = (a: TradeBag, b: TradeBag) => RESOURCES.every(r => (a[r] ?? 0) === (b[r] ?? 0));

/** Did this seat make an offer to a person within its last `turns` turns? */
function recentlyAskedPeople(view: GameView, turns: number): boolean {
  const since = view.turn - turns * view.players.length;
  const people = new Set(view.players.filter(p => !p.bot).map(p => p.id));
  return view.log.some(
    e =>
      e.event?.kind === 'offer' &&
      e.event.playerId === view.selfId &&
      (e.turn ?? 0) > since &&
      (e.event.to ?? []).some(id => people.has(id)),
  );
}

/** Most offers a bot makes in one turn at a table with people, whatever tuning says (offers clutter their screen). */
export const PEOPLE_TABLE_OFFERS = 1;

/** Could this player have what we want? Only asked when the count says it's at least likely. */
function mayHold(econ: Economy, playerId: string, want: TradeBag): boolean {
  if (!econ.view.likelyHands) return true;
  const hand = econ.handOf(playerId);
  return RESOURCES.every(r => !want[r] || hand[r] >= want[r] * MAY_HOLD);
}

/** How much of the wanted cards the count must show (a steal spreads one card over a hand). */
const MAY_HOLD = 0.5;

/**
 * The next offer to make this turn, or null. Bots get every kind; people only fair offers for
 * the last card a goal needs, at most every third turn (so the bot doesn't pester them).
 */
export function nextOffer(econ: Economy): GameAction | null {
  const { view, knobs } = econ;
  const made = offersThisTurn(view);
  const people = view.players.some(p => !p.bot);
  if (made.length >= Math.min(knobs.offersPerTurn, people ? PEOPLE_TABLE_OFFERS : 3)) return null;
  const goal = econ.bestGoal();
  const short = goal ? RESOURCES.reduce((n, r) => n + Math.max(0, goal.cost[r] - view.hand[r]), 0) : 0;
  const askPeople = short === 1 && !recentlyAskedPeople(view, 3);
  for (const c of candidates(econ)) {
    if (made.some(m => same(m.give, c.give) && same(m.want, c.want))) continue;
    const to = view.players
      .filter(p => p.id !== view.selfId && p.resourceCount > 0 && mayHold(econ, p.id, c.want))
      .filter(p => p.publicPoints < view.settings.victoryPoints - knobs.tradeCutoff)
      .filter(p => p.bot || (askPeople && c.fair))
      .map(p => p.id);
    if (to.length) return { type: 'offer-trade', give: c.give, want: c.want, to };
  }
  return null;
}
