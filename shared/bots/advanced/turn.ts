import { emptyBag } from '../../engine/core';
import { longestRoad } from '../../rules';
import { type DevelopmentCard, type GameAction, RESOURCES, type Resource } from '../../types';
import { bagValue, COSTS, canPay, linkAction, resourceWeights } from '../analysis';
import type { TurnOptions } from '../types';
import { choices, type Economy } from './economy';
import { blockedOwnPips } from './robber';
import { nextOffer } from './trade';

/**
 * The Advanced bot's own turn after rolling: play a card if it pays off, build the best city or
 * settlement it can, work toward its goal (roads to the target spot, bank trades, offers to
 * players), and spend spare cards only when that doesn't slow the goal.
 */

const plus = (hand: Record<Resource, number>, bag: Record<Resource, number>) => {
  const out = { ...hand };
  for (const r of RESOURCES) out[r] += bag[r];
  return out;
};

function playable(econ: Economy, kind: DevelopmentCard['kind']): DevelopmentCard | undefined {
  return econ.view.development.find(c => c.kind === kind && econ.view.playableDevelopment.includes(c.id));
}

/** A knight now: to free our own tiles, or when it takes Largest Army. */
export function knightNow(econ: Economy): GameAction | null {
  const knight = playable(econ, 'knight');
  if (!knight) return null;
  const { view, self } = econ;
  const mine = self.knights + 1;
  const others = Math.max(0, ...view.players.filter(p => p.id !== view.selfId).map(p => p.knights));
  const takesArmy = mine >= 3 && mine > others && view.largestArmyId !== view.selfId;
  return blockedOwnPips(view) >= econ.knobs.knightRelief || takesArmy
    ? { type: 'play-knight', cardId: knight.id }
    : null;
}

/** A development card worth playing now, if any. */
export function developmentPlay(econ: Economy): GameAction | null {
  const { view, self } = econ;
  const knight = knightNow(econ);
  if (knight) return knight;
  const plenty = playable(econ, 'year-of-plenty');
  if (plenty) {
    let best = emptyBag();
    let score = -Infinity;
    for (const bag of choices(econ, 2)) {
      const s = econ.handValue(plus(view.hand, bag));
      if (s > score) [best, score] = [bag, s];
    }
    const after = plus(view.hand, best);
    if (econ.goals.some(g => !canPay(view.hand, g.cost) && canPay(after, g.cost)))
      return { type: 'play-plenty', cardId: plenty.id, resources: best };
  }
  const monopoly = playable(econ, 'monopoly');
  if (monopoly) {
    const goal = econ.bestGoal();
    const weights = resourceWeights(econ.board, view.selfId);
    const held = (r: Resource) =>
      view.players.filter(p => p.id !== view.selfId).reduce((n, p) => n + econ.handOf(p.id)[r], 0);
    const want = (r: Resource) => held(r) * weights[r] * (goal && view.hand[r] < goal.cost[r] ? 1.5 : 1);
    const resource = [...RESOURCES].sort((a, b) => want(b) - want(a))[0]!;
    if (held(resource) >= 3) return { type: 'play-monopoly', cardId: monopoly.id, resource };
  }
  const roads = playable(econ, 'road-building');
  const links = view.legal.roads.length + view.legal.ships.length;
  if (roads && self.roadsLeft + self.shipsLeft >= 2 && self.settlementsLeft && links && econ.target?.distance)
    return { type: 'play-road-building', cardId: roads.id };
  return null;
}

/** Bank or harbor trade that makes the goal affordable this turn, giving up the least useful cards. */
function bankTrade(econ: Economy): GameAction | null {
  const { view } = econ;
  const goal = econ.bestGoal();
  if (!goal) return null;
  const cost = goal.cost;
  const missing = RESOURCES.filter(r => view.hand[r] < cost[r] && econ.bankHas(r));
  if (!missing.length || missing.length < RESOURCES.filter(r => view.hand[r] < cost[r]).length) return null;
  const shortfall = RESOURCES.reduce((n, r) => n + Math.max(0, cost[r] - view.hand[r]), 0);
  const credits = RESOURCES.reduce(
    (n, r) => n + Math.floor(Math.max(0, view.hand[r] - cost[r]) / view.tradeRates[r]),
    0,
  );
  if (credits < shortfall) return null;
  let best: { give: Resource; receive: Resource; value: number } | null = null;
  for (const give of RESOURCES) {
    if (view.hand[give] - cost[give] < view.tradeRates[give]) continue;
    for (const receive of missing) {
      const hand = { ...view.hand };
      hand[give] -= view.tradeRates[give];
      hand[receive]++;
      const value = econ.handValue(hand);
      if (!best || value > best.value) best = { give, receive, value };
    }
  }
  return best ? { type: 'trade', give: best.give, receive: best.receive } : null;
}

/** Our best settlement to upgrade. */
export function bestCity(econ: Economy): string {
  const weights = resourceWeights(econ.board, econ.view.selfId);
  return [...econ.view.legal.cities].sort(
    (a, b) => bagValue(econ.board.yieldAt(b), weights) - bagValue(econ.board.yieldAt(a), weights),
  )[0]!;
}

/** Our best open corner to settle now. */
export function bestSettlement(econ: Economy): string {
  return [...econ.view.legal.settlements].sort((a, b) => econ.spotWorth(b) - econ.spotWorth(a))[0]!;
}

/**
 * A road or ship that takes Longest Road (or keeps it from someone close behind), when the award
 * is within `longestRoadReach` pieces.
 */
export function longestRoadMove(econ: Economy): { action: GameAction; length: number } | null {
  const { view, self, knobs } = econ;
  const links = [...view.legal.roads, ...view.legal.ships];
  if (!links.length || knobs.longestRoadReach < 1) return null;
  const others = view.players.filter(p => p.id !== view.selfId);
  const best = Math.max(4, ...others.map(p => p.longestRoad));
  const holding = view.longestRoadId === view.selfId;
  const gap = holding ? 1 + best - self.longestRoad : best + 1 - self.longestRoad;
  if (gap < 1 || gap > knobs.longestRoadReach) return null;
  let pick: { id: string; length: number } | null = null;
  for (const id of links) {
    const ship = !view.legal.roads.includes(id);
    const trial = {
      ...view,
      roads: ship ? view.roads : { ...view.roads, [id]: view.selfId },
      ships: ship ? { ...view.ships, [id]: view.selfId } : view.ships,
    };
    const length = longestRoad(trial, view.selfId);
    if (length > self.longestRoad && (!pick || length > pick.length)) pick = { id, length };
  }
  if (!pick) return null;
  const action = linkAction(view, pick.id);
  return action ? { action, length: pick.length } : null;
}

/** A road or ship toward the target spot, if we can build it now. */
export function towardTarget(econ: Economy): GameAction | null {
  const t = econ.target;
  return t ? linkAction(econ.view, t.firstEdge, t.firstKind) : null;
}

/** One move of the build phase. */
export function buildStep(econ: Economy, { builds = 0, allowOffers = true }: TurnOptions): GameAction {
  const { view, knobs } = econ;
  if (builds >= 2 && !allowOffers) return { type: 'end-turn' };
  const play = developmentPlay(econ);
  if (play) return play;
  if (view.legal.cities.length) return { type: 'build-city', vertexId: bestCity(econ) };
  if (view.legal.settlements.length) return { type: 'build-settlement', vertexId: bestSettlement(econ) };
  const award = longestRoadMove(econ);
  if (award) return award.action;
  const goal = econ.bestGoal();
  if (goal?.goal === 'settlement') {
    const road = towardTarget(econ);
    if (road) return road;
  }
  const trade = bankTrade(econ);
  if (trade) return trade;
  if (allowOffers) {
    const offer = nextOffer(econ);
    if (offer) return offer;
  }
  if (view.legal.development) {
    const after = { ...view.hand };
    for (const r of RESOURCES) after[r] -= COSTS.development[r];
    const keeps = econ.handValue(after) + knobs.spareDevelopment >= econ.handValue(view.hand);
    if (goal?.goal === 'development' || keeps) return { type: 'buy-development' };
  }
  const near = knobs.spareRoads + (view.seafaring ? 2 : 0);
  if (econ.self.roadsLeft + econ.self.shipsLeft > 2 && (econ.target?.distance ?? 99) <= near) {
    const road = towardTarget(econ);
    if (road) return road;
  }
  return { type: 'end-turn' };
}
