import { BUILD_COSTS } from '../../engine/core';
import { boardIndex } from '../../seafaring';
import { RESOURCES, type ResourceBag } from '../../types';
import { COSTS, resourceWeights } from '../analysis';
import type { Economy, Target } from './economy';
import { distanceFrom, isOpen } from './geometry';
import { goalLean } from './strategy';
import { cornerYield } from './value';

/**
 * What the Advanced bot works toward, chosen the way a player weighs options: every concrete plan
 * (a city here, a settlement there, a route to a spot, exploring fog, a development card, Longest
 * Road) gets its full cost, the turns until we can pay it, and its payoff in points: points now
 * plus the cards its production brings over the rest of the game, times the chance an opponent
 * doesn't take it first. The plan with the most payoff per turn of waiting wins, and every other
 * decision (trades, spare cards, the robber) serves it.
 *
 * Everything is in one currency (points), so no plan needs its own weight: the knobs are only how
 * many cards a point is worth and how long the game has left.
 */

export type PlanKind = 'city' | 'settlement' | 'route' | 'explore' | 'development' | 'road' | 'survey';

export interface Plan {
  kind: PlanKind;
  /** Every card the plan still needs, routes included. */
  cost: ResourceBag;
  /** Points, now and from production over the rest of the game, if it succeeds. */
  payoff: number;
  /** The corner it builds on or heads for. */
  vertexId?: string;
  /** Routes: the way there. */
  path?: Target;
}

const SHIP = BUILD_COSTS.ship;

/** Development deck shares (standard deck): points, knights, and progress cards. */
const DECK = { point: 5 / 25, knight: 14 / 25, progress: 6 / 25 };

/** Points per card, and rounds the game probably has left. */
function horizon(econ: Economy): { card: number; rounds: number } {
  const { view, knobs } = econ;
  const leader = Math.max(...view.players.map(p => (p.id === view.selfId ? p.points : p.publicPoints)));
  const left = Math.max(1, view.settings.victoryPoints - leader);
  return { card: knobs.pointPerCard, rounds: Math.min(25, Math.max(2, knobs.roundsPerPoint * left)) };
}

/** Points from extra production (pips) over the rounds left, rarer resources for us worth more. */
const weightCache = new WeakMap<Economy, ReturnType<typeof resourceWeights>>();

/** Our resource weights (rarer for us counts more), once per decision. */
function weightsOf(econ: Economy): ReturnType<typeof resourceWeights> {
  let w = weightCache.get(econ);
  if (!w) {
    w = resourceWeights(econ.board, econ.view.selfId);
    weightCache.set(econ, w);
  }
  return w;
}

export function productionPoints(econ: Economy, gain: { production: ResourceBag; choice: number }): number {
  const { card, rounds } = horizon(econ);
  const weights = weightsOf(econ);
  let cards = gain.choice * 1.3;
  for (const r of RESOURCES) cards += gain.production[r] * weights[r];
  // Pips are 36ths of a roll; every seat rolls once a round.
  return (cards / 36) * econ.view.players.length * rounds * card;
}

/**
 * Chance an open corner is still ours when we get there, `turns` from now: the rival model's odds
 * (rivals.ts, which already counts how long each player needs), or a rule of thumb by distance.
 */
function race(econ: Economy, c: number, distance: number, turns: number): number {
  if (econ.knobs.raceModel >= 0.5) return econ.raceFactor(c, distance);
  const them = econ.opponentDistance(c);
  if (them > distance + 1) return 1;
  const p = 1 - econ.knobs.racePenalty * (them <= distance ? 1 : 0.5);
  // The longer we wait, the likelier they get there first.
  return Math.max(0.05, p - 0.04 * turns);
}

function plus(a: ResourceBag, b: ResourceBag, times = 1): ResourceBag {
  const out = { ...a };
  for (const r of RESOURCES) out[r] += b[r] * times;
  return out;
}

/**
 * A settlement's return: its point, island bonus, and production over the rounds left, plus what
 * it makes possible next (a city there later: `cityOption` of that city's own return).
 */
function settlementPayoff(econ: Economy, vertexId: string): number {
  const c = econ.geo.indexOf.get(vertexId)!;
  const production = productionPoints(econ, cornerYield(econ, vertexId));
  let points = 1 + econ.islandBonus(c) + production;
  if (econ.self.citiesLeft) points += econ.knobs.cityOption * (1 + production / 2);
  if (econ.knobs.frontierOption > 0) points += econ.knobs.frontierOption * frontierGain(econ, c);
  const harbor = econ.geo.harbor[c];
  if (harbor === 'any') points += 0.3;
  else if (harbor && econ.production[harbor] >= 5) points += 0.5;
  return points;
}

/**
 * What settling corner `c` opens up: the best open corner two or three pieces beyond it that our
 * routes don't already come closer to, as a share of a settlement's return there, discounted by
 * distance and by the race for it.
 */
function frontierGain(econ: Economy, c: number): number {
  const { geo } = econ;
  let best = 0;
  for (const t of frontierSpots(econ)) {
    const d = geo.distance[c * geo.n + t.corner]!;
    // Two or three pieces on (one away is too close to settle), and not nearer to a route we have.
    if (d < 2 || d > 3 || t.ours <= d) continue;
    best = Math.max(best, (t.gain * econ.raceFactor(t.corner, d)) / (1 + econ.knobs.distanceCost * d ** 1.5));
  }
  return best;
}

const spotCache = new WeakMap<Economy, { corner: number; ours: number; gain: number }[]>();

/** Open land corners with our distance to them and a settlement's return there (once per decision). */
function frontierSpots(econ: Economy): { corner: number; ours: number; gain: number }[] {
  let spots = spotCache.get(econ);
  if (spots) return spots;
  const { geo } = econ;
  const occupied = new Uint8Array(geo.n);
  for (const id of Object.keys(econ.view.buildings)) occupied[geo.indexOf.get(id)!] = 1;
  const ours = econ.frontiers[econ.seat]!;
  spots = [];
  for (let t = 0; t < geo.n; t++) {
    if (!geo.land[t] || !isOpen(geo, occupied, t)) continue;
    const gain = 1 + productionPoints(econ, cornerYield(econ, geo.ids[t]!));
    spots.push({ corner: t, ours: distanceFrom(geo, ours, t), gain });
  }
  spotCache.set(econ, spots);
  return spots;
}

/** Every plan worth weighing now. */
export function makePlans(econ: Economy, paths: Map<string, Target>, fog: Map<string, Target>): Plan[] {
  const { view, self } = econ;
  const plans: Plan[] = [];
  const own = Object.entries(view.buildings).filter(([, b]) => b.playerId === view.selfId);
  if (self.citiesLeft)
    for (const [id, b] of own)
      if (b.kind === 'settlement')
        plans.push({
          kind: 'city',
          cost: COSTS.city,
          payoff: 1 + productionPoints(econ, cornerYield(econ, id)),
          vertexId: id,
        });
  if (self.settlementsLeft) {
    for (const id of econ.spotIds) {
      const turns = econ.turnsToAfford(view.hand, COSTS.settlement);
      const odds = race(econ, econ.geo.indexOf.get(id)!, 0, turns);
      plans.push({
        kind: 'settlement',
        cost: COSTS.settlement,
        payoff: settlementPayoff(econ, id) * odds,
        vertexId: id,
      });
    }
    for (const [id, path] of paths) {
      const c = econ.geo.indexOf.get(id)!;
      const piece = path.firstKind === 'ship' ? SHIP : COSTS.road;
      const cost = plus(COSTS.settlement, piece, path.distance);
      const turns = econ.turnsToAfford(view.hand, cost);
      const payoff = settlementPayoff(econ, id) * race(econ, c, path.distance, turns);
      plans.push({ kind: 'route', cost, payoff, vertexId: id, path });
    }
  }
  plans.push(...explorePlans(econ, fog));
  // Cartographers: a survey ship is a point for 3 lodestone and 1 ore, and charts tiles around a town.
  if (econ.survey && econ.knobs.surveyValue > 0)
    plans.push({ kind: 'survey', cost: econ.survey.cost, payoff: 1 + 0.3 * econ.knobs.surveyValue });
  if (view.developmentRemaining) plans.push({ kind: 'development', cost: COSTS.development, payoff: cardPayoff(econ) });
  const others = Math.max(4, ...view.players.filter(p => p.id !== view.selfId).map(p => p.longestRoad));
  const holding = view.longestRoadId === view.selfId;
  const gap = others + 1 - self.longestRoad;
  if (gap >= 1 && gap <= Math.min(3, self.roadsLeft + self.shipsLeft)) {
    // Two points (or keeping them) while nobody passes us again.
    plans.push({ kind: 'road', cost: plus(emptyCost(), COSTS.road, gap), payoff: holding ? 1.2 : 1.4 });
  }
  // A strategy (strategy.ts) leans the same goals one way; 1 everywhere for the shipped bot.
  for (const plan of plans) plan.payoff *= goalLean(econ.knobs, plan.kind);
  return plans;
}

const emptyCost = (): ResourceBag => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, lodestone: 0 });

/** A development card: a point, a knight (toward Largest Army, and a robber move), or a progress card. */
function cardPayoff(econ: Economy): number {
  const { view, self } = econ;
  const { card } = horizon(econ);
  const others = Math.max(2, ...view.players.filter(p => p.id !== view.selfId).map(p => p.knights));
  const held = view.development.filter(c => c.kind === 'knight').length;
  const needed = Math.max(1, others + 1 - self.knights - held);
  const army = view.largestArmyId === view.selfId ? 0 : 2 / (needed + 1);
  // A knight steals a card and frees a tile; a progress card is worth about two and a half cards.
  return DECK.point + DECK.knight * (army + 1.5 * card) + DECK.progress * 2.5 * card;
}

/**
 * Fog: reaching a corner reveals the fog tiles it touches. Each producing one pays a card at
 * once, and new land may give a spot to settle: worth a settlement's return less its cost (the
 * settlement still has to be paid for), at half for the chance the spot is poor or taken.
 * The odds come from the map's fog mix, which every player can see.
 */
function explorePlans(econ: Economy, fog: Map<string, Target>): Plan[] {
  const { view } = econ;
  const land = view.features.fogLand;
  if (!land || !fog.size) return [];
  const index = boardIndex(view.board);
  const { card } = horizon(econ);
  // A typical new corner: about ten pips, spread over the resources.
  const average = { production: { wood: 2, brick: 2, sheep: 2, wheat: 2, ore: 2, lodestone: 0 }, choice: 0 };
  const newSpot = Math.max(0, 1 + productionPoints(econ, average) - 4 * card);
  const plans: Plan[] = [];
  for (const [id, path] of fog) {
    const tiles = index.vertex.get(id)!.hexIds.filter(h => index.hex.get(h)!.terrain === 'fog').length;
    const piece = path.firstKind === 'ship' ? SHIP : COSTS.road;
    const cost = plus(emptyCost(), piece, path.distance);
    const payoff = econ.knobs.exploreValue * (tiles * land * card + (1 - (1 - land) ** tiles) * newSpot * 0.5);
    plans.push({ kind: 'explore', cost, payoff, vertexId: id, path });
  }
  return plans;
}

/** Payoff per turn of waiting: what the bot ranks plans by. */
export function planScore(econ: Economy, plan: Plan, hand = econ.view.hand): number {
  return plan.payoff / (1 + econ.turnsToAfford(hand, plan.cost));
}
