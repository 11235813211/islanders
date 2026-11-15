import { BUILD_COSTS } from '../../engine/core';
import { type GameAction, RESOURCES, type Resource, type ResourceBag } from '../../types';
import { COSTS, canPay, linkAction, roadPaths, routeGoalAt } from '../analysis';
import { surveyMove } from '../cartographers';
import type { Economy } from './economy';
import { isOpen } from './geometry';
import { longestRoadMove } from './turn';
import { harborRates } from './value';

/**
 * Endgame checks, kept cheap (a few hundred combinations at most). Near the target, the bot asks
 * whether some set of points it can buy this turn wins: cities, settlements (with the roads to
 * them), a survey ship, Longest Road, paid for with its hand, bank and harbor trades, and a Year of
 * Plenty it holds. If so it plays that out move by move. The same check on an opponent's likely
 * hand says who could win on their next turn, so the robber and trades treat them as the danger.
 */

/** One way to score: what it costs and how many points it brings. */
interface Score {
  kind: 'city' | 'settlement' | 'survey' | 'road';
  points: number;
  cost: ResourceBag;
  /** The move that starts it (a build, or the first road toward a settlement). */
  start: GameAction | null;
  /** Settlements that need new roads: at most one of these per plan (their routes may overlap). */
  route?: boolean;
}

/** Most points a plan may combine (each one is a piece or an award). */
const MAX_PIECES = 4;
/** Farthest settlement the check considers, in roads or ships. */
const MAX_ROADS = 2;

const sum = (items: Score[]): ResourceBag => {
  const out = Object.fromEntries(RESOURCES.map(r => [r, 0])) as ResourceBag;
  for (const item of items) for (const r of RESOURCES) out[r] += item.cost[r];
  return out;
};

/** Cards still missing for `cost`, and whether trades (plus `wild` free picks) can cover them. */
function payable(econ: Economy, hand: ResourceBag, cost: ResourceBag, rates: Record<Resource, number>, wild: number) {
  let missing = 0;
  let credit = 0;
  for (const r of RESOURCES) {
    const gap = cost[r] - hand[r];
    if (gap > 0) {
      if (!econ.bankHas(r, gap)) return false;
      missing += gap;
    } else credit += Math.floor(-gap / rates[r]);
  }
  return missing <= credit + wild;
}

/** Points this seat can score this turn, one entry per piece or award. */
function ownScores(econ: Economy): Score[] {
  const { view, self } = econ;
  const out: Score[] = [];
  if (self.citiesLeft)
    for (const vertexId of view.legal.cities.length ? view.legal.cities : ownSettlements(econ))
      out.push({ kind: 'city', points: 1, cost: COSTS.city, start: { type: 'build-city', vertexId } });
  if (self.settlementsLeft) {
    for (const [vertexId, path] of roadPaths(econ.board)) {
      if (path.distance > MAX_ROADS || !econ.geo.land[econ.geo.indexOf.get(vertexId)!]) continue;
      const open = path.distance === 0 ? econ.spotIds.includes(vertexId) : isOpenCorner(econ, vertexId);
      if (!open || path.distance > self.roadsLeft + self.shipsLeft) continue;
      const c = econ.geo.indexOf.get(vertexId)!;
      const piece = path.firstKind === 'ship' ? BUILD_COSTS.ship : COSTS.road;
      const cost = { ...COSTS.settlement };
      for (const r of RESOURCES) cost[r] += piece[r] * path.distance;
      const goal = view.board.rules?.routeGoal;
      const points = 1 + econ.islandBonus(c) + (goal && routeGoalAt(view, vertexId) ? goal.points : 0);
      const start: GameAction | null = path.distance
        ? linkAction(view, path.firstEdge, path.firstKind)
        : { type: 'build-settlement', vertexId };
      out.push({ kind: 'settlement', points, cost, start, route: path.distance > 0 });
    }
  }
  if (econ.survey?.distance === 0)
    out.push({ kind: 'survey', points: 1, cost: econ.survey.cost, start: surveyMove(view) });
  const award = longestRoadMove(econ);
  if (award && view.longestRoadId !== view.selfId) {
    const others = Math.max(4, ...view.players.filter(p => p.id !== view.selfId).map(p => p.longestRoad));
    if (award.length > others) {
      const kind = award.action.type === 'build-ship' ? BUILD_COSTS.ship : COSTS.road;
      out.push({ kind: 'road', points: 2, cost: kind, start: award.action });
    }
  }
  return out;
}

function ownSettlements(econ: Economy): string[] {
  return Object.entries(econ.view.buildings)
    .filter(([, b]) => b.playerId === econ.view.selfId && b.kind === 'settlement')
    .map(([id]) => id);
}

/** Open for a settlement: nothing on the corner or beside it. */
function isOpenCorner(econ: Economy, vertexId: string): boolean {
  const occupied = new Uint8Array(econ.geo.n);
  for (const id of Object.keys(econ.view.buildings)) occupied[econ.geo.indexOf.get(id)!] = 1;
  return isOpen(econ.geo, occupied, econ.geo.indexOf.get(vertexId)!);
}

/** The cheapest set of scores reaching `need` points that can be paid for, or null. */
function bestPlan(
  econ: Economy,
  scores: Score[],
  need: number,
  hand: ResourceBag,
  rates: Record<Resource, number>,
  wild: number,
): Score[] | null {
  let best: { plan: Score[]; cards: number } | null = null;
  const walk = (from: number, plan: Score[], points: number) => {
    if (points >= need) {
      const cost = sum(plan);
      if (!payable(econ, hand, cost, rates, wild)) return;
      const cards = RESOURCES.reduce((n, r) => n + cost[r], 0);
      if (!best || cards < best.cards) best = { plan: [...plan], cards };
      return;
    }
    if (plan.length >= MAX_PIECES) return;
    for (let i = from; i < scores.length; i++) {
      const item = scores[i]!;
      if (item.route && plan.some(p => p.route)) continue;
      plan.push(item);
      walk(i + 1, plan, points + item.points);
      plan.pop();
    }
  };
  walk(0, [], 0);
  return (best as { plan: Score[] } | null)?.plan ?? null;
}

/** Points the seat still needs to win. */
function pointsToGo(econ: Economy): number {
  return econ.view.settings.victoryPoints - econ.self.points;
}

/**
 * A move toward winning this turn, when some set of builds this turn wins. Null otherwise (the
 * normal planner decides). Called again after every move, so it only picks the next step.
 */
export function winningMove(econ: Economy): GameAction | null {
  const { view } = econ;
  const need = pointsToGo(econ);
  const goal = view.board.rules?.routeGoal;
  // A required route can't be checked this cheaply.
  if (need > MAX_PIECES * 2 || need < 1 || (goal?.required && !econ.self.routeDone)) return null;
  const scores = ownScores(econ);
  if (scores.reduce((n, s) => n + s.points, 0) < need) return null;
  const plenty = view.development.find(c => c.kind === 'year-of-plenty' && view.playableDevelopment.includes(c.id));
  const plan =
    bestPlan(econ, scores, need, view.hand, view.tradeRates, 0) ??
    (plenty ? bestPlan(econ, scores, need, view.hand, view.tradeRates, 2) : null);
  if (!plan) return null;
  for (const item of plan)
    if (item.start && canPay(view.hand, item.cost) && item.kind !== 'settlement') return item.start;
  for (const item of plan)
    if (item.start && item.kind === 'settlement' && canPay(view.hand, startCost(item))) return item.start;
  const cost = sum(plan);
  const trade = tradeToward(econ, cost);
  if (trade) return trade;
  if (plenty) return { type: 'play-plenty', cardId: plenty.id, resources: missingPicks(econ, cost) };
  return null;
}

/** What the first move of a settlement plan costs: a road or ship, or the settlement itself. */
function startCost(item: Score): ResourceBag {
  if (!item.route) return item.cost;
  return item.start?.type === 'build-ship' ? BUILD_COSTS.ship : COSTS.road;
}

/** A bank or harbor trade of spare cards for one the plan is missing. */
function tradeToward(econ: Economy, cost: ResourceBag): GameAction | null {
  const { view } = econ;
  const want = RESOURCES.find(r => view.hand[r] < cost[r] && econ.bankHas(r));
  if (!want) return null;
  const spare = (r: Resource) => view.hand[r] - cost[r] - view.tradeRates[r];
  const give = RESOURCES.filter(r => r !== want && spare(r) >= 0).sort((a, b) => spare(b) - spare(a))[0];
  return give ? { type: 'trade', give, receive: want } : null;
}

/** Two picks for Year of Plenty: what the plan is still short of. */
function missingPicks(econ: Economy, cost: ResourceBag): ResourceBag {
  const picks = Object.fromEntries(RESOURCES.map(r => [r, 0])) as ResourceBag;
  let left = 2;
  for (const r of RESOURCES)
    while (left && econ.view.hand[r] + picks[r] < cost[r] && econ.bankHas(r, picks[r] + 1)) {
      picks[r]++;
      left--;
    }
  const fill = RESOURCES.find(r => econ.bankHas(r, picks[r] + 1)) ?? 'wheat';
  picks[fill] += left;
  return picks;
}

/**
 * Could this opponent win on their next turn? Their public points (hidden cards count as half a
 * point each), cities and settlement spots they already reach, Longest Road, paid with their likely
 * hand plus about a roll's worth of cards.
 */
export function couldWinNext(econ: Economy, playerId: string): boolean {
  const known = dangers.get(econ) ?? new Map<string, boolean>();
  dangers.set(econ, known);
  if (!known.has(playerId)) known.set(playerId, winsNext(econ, playerId));
  return known.get(playerId)!;
}

/** couldWinNext's answers, per decision (the robber asks about the same players many times). */
const dangers = new WeakMap<Economy, Map<string, boolean>>();

function winsNext(econ: Economy, playerId: string): boolean {
  const { view } = econ;
  const player = view.players.find(p => p.id === playerId)!;
  const need = view.settings.victoryPoints - player.publicPoints - Math.floor(player.developmentCount / 2);
  if (need > 3) return false;
  if (need <= 0) return true;
  // Copies of the same piece cost the same, so `need` of each kind is enough to judge.
  const scores: Score[] = [];
  const settlements = Object.values(view.buildings).filter(b => b.playerId === playerId && b.kind === 'settlement');
  for (let i = 0; i < Math.min(need, player.citiesLeft, settlements.length); i++)
    scores.push({ kind: 'city', points: 1, cost: COSTS.city, start: null });
  let spots = 0;
  for (const [vertexId, path] of roadPaths(econ.board, playerId))
    if (path.distance === 0 && econ.geo.land[econ.geo.indexOf.get(vertexId)!] && isOpenCorner(econ, vertexId)) spots++;
  for (let i = 0; i < Math.min(need, player.settlementsLeft, spots); i++)
    scores.push({ kind: 'settlement', points: 1, cost: COSTS.settlement, start: null });
  const others = Math.max(4, ...view.players.filter(p => p.id !== playerId).map(p => p.longestRoad));
  if (view.longestRoadId !== playerId && player.longestRoad + 1 > others && player.roadsLeft)
    scores.push({ kind: 'road', points: 2, cost: COSTS.road, start: null });
  return bestPlan(econ, scores, need, econ.handOf(playerId), harborRates(econ, playerId), ROLL_CARDS) !== null;
}

/** Cards an opponent's own roll is likely to add before they build. */
const ROLL_CARDS = 2;
