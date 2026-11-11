import { BUILD_COSTS } from '../../engine/core';
import { type GameAction, RESOURCES, type ResourceBag } from '../../types';
import { COSTS, linkAction } from '../analysis';
import type { TurnOptions } from '../types';
import type { Economy } from './economy';
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
  const ranked = econ.plans
    .filter(plan => !econ.spots || (plan.kind !== 'route' && plan.kind !== 'explore'))
    .map(plan => ({ plan, score: planScore(econ, plan) }))
    .sort((a, b) => b.score - a.score)
    .map(r => r.plan);
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
  return { type: 'end-turn' };
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
    case 'development':
      return view.legal.development ? { action: { type: 'buy-development' }, cost: COSTS.development } : null;
    case 'road': {
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
