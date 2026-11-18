import { BUILD_COSTS } from '../../engine/core';
import { type GameAction, RESOURCES, type ResourceBag } from '../../types';
import { COSTS, linkAction } from '../analysis';
import type { TurnOptions } from '../types';
import type { Economy } from './economy';
import { forecastRank } from './plan-forecast';
import { type Plan, planScore } from './plans';
import { nextOffer } from './trade';
import { bankTrade, developmentPlay, longestRoadMove } from './turn';

/**
 * The build phase with weighed plans (plans.ts): take the next step of the best plan when we can
 * pay for it, else trade toward it (bank, then players), then spend on another plan only if that
 * doesn't delay the best one, and buy a development card with what's left. Routes are built piece
 * by piece toward the plan's corner, so a road is only ever part of a plan.
 */
export function planStep(econ: Economy, { builds = 0, allowOffers = true }: TurnOptions): GameAction {
  if (builds >= 2 && !allowOffers) return { type: 'end-turn' };
  const play = developmentPlay(econ);
  if (play) return play;
  // With a spot already in reach, settle it before starting a route anywhere else (roads
  // toward a second spot leave the first one open, and then both may go to someone else).
  const byScore = rankedPlans(econ);
  const ranked = econ.knobs.forecastPlan >= 0.5 ? forecastRank(econ, byScore, p => canStart(econ, p)) : byScore;
  const best = ranked[0];
  if (!best) return { type: 'end-turn' };
  // A settlement we can build now beats the first piece of a route to a better one (the rollout
  // comparisons: settling now wins); the cards would be gone and the far spot may be taken.
  if (best.kind === 'route' || best.kind === 'explore') {
    const settle = ranked.find(p => p.kind === 'settlement' && nextStep(econ, p));
    if (settle) return nextStep(econ, settle)!.action;
  }
  const now = nextStep(econ, best);
  if (now) return now.action;
  const trade = bankTrade(econ);
  if (trade) return trade;
  if (allowOffers) {
    const offer = nextOffer(econ);
    if (offer) return offer;
  }
  for (const plan of ranked.slice(1)) {
    const step = nextStep(econ, plan);
    if (step && !delays(econ, best, step.cost)) return step.action;
  }
  // Cards left over: the next piece toward our route when no spot is in reach yet, else a
  // development card (the rollout comparisons: both beat stopping).
  const route = econ.target && !econ.spots ? linkAction(econ.view, econ.target.firstEdge, econ.target.firstKind) : null;
  if (route) return route;
  if (econ.view.legal.development) return { type: 'buy-development' };
  return (econ.knobs.overLimitTrade >= 0.5 ? overLimitTrade(econ) : null) ?? { type: 'end-turn' };
}

/**
 * With more cards than the discard limit, a 7 before our next turn costs half the hand. A bank
 * trade shrinks it: measured, stopping over the limit was worse than trading (not so below it).
 */
export function overLimitTrade(econ: Economy): GameAction | null {
  const { view } = econ;
  const cards = RESOURCES.reduce((n, r) => n + view.hand[r], 0);
  if (cards <= view.settings.discardLimit) return null;
  let best: GameAction | null = null;
  let top = -Infinity;
  for (const give of RESOURCES) {
    if (view.hand[give] < view.tradeRates[give]) continue;
    for (const receive of RESOURCES) {
      if (receive === give || !econ.bankHas(receive)) continue;
      const hand = { ...view.hand };
      hand[give] -= view.tradeRates[give];
      hand[receive]++;
      const value = econ.handValue(hand);
      if (value > top) [best, top] = [{ type: 'trade', give, receive }, value];
    }
  }
  return best;
}

/** The plans in play, best payoff for the wait first; roads for spare cards come last. */
export function rankedPlans(econ: Economy): Plan[] {
  const sorted = econ.plans
    .filter(plan => !econ.spots || (plan.kind !== 'route' && plan.kind !== 'explore'))
    .map(plan => ({ plan, score: planScore(econ, plan) }))
    .sort((a, b) => b.score - a.score)
    .map(r => r.plan);
  return [...sorted.filter(p => !p.spare), ...sorted.filter(p => p.spare)];
}

/** Whether the plan's next move can be made right now. */
export function canStart(econ: Economy, plan: Plan): boolean {
  return nextStep(econ, plan) !== null;
}

/** The plan's next move and its cost, if we can make it now. */
function nextStep(econ: Economy, plan: Plan): { action: GameAction; cost: ResourceBag } | null {
  const { view } = econ;
  switch (plan.kind) {
    case 'city':
      return view.legal.cities.includes(plan.vertexId!)
        ? { action: { type: 'build-city', vertexId: plan.vertexId! }, cost: COSTS.city }
        : null;
    case 'settlement':
      return view.legal.settlements.includes(plan.vertexId!)
        ? { action: { type: 'build-settlement', vertexId: plan.vertexId! }, cost: COSTS.settlement }
        : null;
    case 'route':
    case 'explore': {
      const path = plan.path!;
      const action = linkAction(view, path.firstEdge, path.firstKind);
      return action ? { action, cost: action.type === 'build-ship' ? BUILD_COSTS.ship : COSTS.road } : null;
    }
    case 'survey': {
      // The survey ship itself is built by the Cartographers step (cartographers.ts); this sails out to sea.
      const action = linkAction(view, econ.survey?.firstEdge, 'ship');
      return action ? { action, cost: BUILD_COSTS.ship } : null;
    }
    case 'development':
      return view.legal.development ? { action: { type: 'buy-development' }, cost: COSTS.development } : null;
    case 'road': {
      if (plan.edge) {
        const action = linkAction(view, plan.edge);
        return action ? { action, cost: action.type === 'build-ship' ? BUILD_COSTS.ship : COSTS.road } : null;
      }
      const move = longestRoadMove(econ);
      return move
        ? { action: move.action, cost: move.action.type === 'build-ship' ? BUILD_COSTS.ship : COSTS.road }
        : null;
    }
  }
}

/** Whether spending `cost` now pushes the best plan back. */
function delays(econ: Economy, best: Plan, cost: ResourceBag): boolean {
  const hand = { ...econ.view.hand };
  for (const r of RESOURCES) hand[r] -= cost[r];
  if (RESOURCES.some(r => hand[r] < 0)) return true;
  return econ.turnsToAfford(hand, best.cost) > econ.turnsToAfford(econ.view.hand, best.cost) + 0.75;
}
