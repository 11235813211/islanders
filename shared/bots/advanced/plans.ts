import { BUILD_COSTS } from '../../engine/core';
import { boardIndex } from '../../seafaring';
import { RESOURCES, type ResourceBag } from '../../types';
import { COSTS, resourceWeights } from '../analysis';
import type { Economy, Target } from './economy';
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

export type PlanKind = 'city' | 'settlement' | 'route' | 'explore' | 'development' | 'road';

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
export function productionPoints(econ: Economy, gain: { production: ResourceBag; choice: number }): number {
  const { card, rounds } = horizon(econ);
  const weights = resourceWeights(econ.board, econ.view.selfId);
  let cards = gain.choice * 1.3;
  for (const r of RESOURCES) cards += gain.production[r] * weights[r];
  // Pips are 36ths of a roll; every seat rolls once a round.
  return (cards / 36) * econ.view.players.length * rounds * card;
}

/** Chance an open corner is still ours when we get there, `turns` from now. */
function race(econ: Economy, c: number, distance: number, turns: number): number {
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

function settlementPayoff(econ: Economy, vertexId: string): number {
  const c = econ.geo.indexOf.get(vertexId)!;
  let points = 1 + econ.islandBonus(c) + productionPoints(econ, cornerYield(econ, vertexId));
  const harbor = econ.geo.harbor[c];
  if (harbor === 'any') points += 0.3;
  else if (harbor && econ.production[harbor] >= 5) points += 0.5;
  return points;
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
  if (view.developmentRemaining) plans.push({ kind: 'development', cost: COSTS.development, payoff: cardPayoff(econ) });
  const others = Math.max(4, ...view.players.filter(p => p.id !== view.selfId).map(p => p.longestRoad));
  const holding = view.longestRoadId === view.selfId;
  const gap = others + 1 - self.longestRoad;
  if (gap >= 1 && gap <= Math.min(3, self.roadsLeft + self.shipsLeft)) {
    // Two points (or keeping them) while nobody passes us again.
    plans.push({ kind: 'road', cost: plus(emptyCost(), COSTS.road, gap), payoff: holding ? 1.2 : 1.4 });
  }
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
 * once, and new land is where the next settlements go (counted at half: it still needs one).
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
  const newSpot = 1 + productionPoints(econ, average);
  const plans: Plan[] = [];
  for (const [id, path] of fog) {
    const tiles = index.vertex.get(id)!.hexIds.filter(h => index.hex.get(h)!.terrain === 'fog').length;
    const piece = path.firstKind === 'ship' ? SHIP : COSTS.road;
    const cost = plus(emptyCost(), piece, path.distance);
    const payoff = tiles * land * card + (1 - (1 - land) ** tiles) * newSpot * 0.5;
    plans.push({ kind: 'explore', cost, payoff, vertexId: id, path });
  }
  return plans;
}

/** Payoff per turn of waiting: what the bot ranks plans by. */
export function planScore(econ: Economy, plan: Plan, hand = econ.view.hand): number {
  return plan.payoff / (1 + econ.turnsToAfford(hand, plan.cost));
}
