import type { GameView } from '../../types';
import type { Knobs } from './params';
import type { PlanKind } from './plans';

/**
 * Whole-game strategies for the Advanced bot (training/PLAN.md Phase 1). Each is the shipped
 * plan-based planner leaned one way: multipliers on what each kind of goal is worth, a few knobs,
 * and what setup looks for. Owner's framing: a strategy is a direction for the same ROI goals,
 * not a rule to always build one thing. The `strategy` knob picks one;
 * 0 is the shipped bot. A strategy holds for as long as the knob does, so a seat that keeps a
 * strategy keeps its priorities from turn to turn.
 */

export const STRATEGIES = ['current', 'expand', 'cities', 'cards', 'explore', 'chart'] as const;
export type Strategy = (typeof STRATEGIES)[number];

/**
 * Per strategy, multipliers on the payoff of each kind of goal in the plan-based planner
 * (plans.ts): the same goals scored the same way, leaned toward one direction. Missing kinds are 1.
 */
const GOAL_LEAN: Record<Strategy, Partial<Record<PlanKind, number>>> = {
  current: {},
  /** Settlements and the routes to them; Longest Road on the way. */
  expand: { settlement: 1.4, route: 1.4, road: 1.3, city: 0.8, development: 0.7 },
  /** Cities first; settle where it's cheap. */
  cities: { city: 1.4, settlement: 0.85, route: 0.8, development: 1.1 },
  /** Development cards for Largest Army and hidden points. */
  cards: { development: 1.6, city: 1.1, settlement: 0.85, route: 0.8, road: 0.7 },
  /** Sea maps: routes to new islands and fog. */
  explore: { route: 1.3, explore: 1.5 },
  /** Cartographers: no goal of its own; its lodestone knobs are below. */
  chart: {},
};

/** Knob changes per strategy beyond the goal leans (fog exploring, lodestone in setup). */
export const STRATEGY_KNOBS: Record<Strategy, Partial<Knobs>> = {
  current: {},
  expand: {},
  cities: {},
  cards: {},
  explore: { exploreValue: 1 },
  chart: { lodestoneSpot: 2, setupLodestone: 2.5 },
};

/** The payoff multiplier for a goal kind under the seat's strategy. */
export function goalLean(knobs: Knobs, kind: PlanKind): number {
  return GOAL_LEAN[strategyOf(knobs)][kind] ?? 1;
}

/** Setup lean per strategy: extra weight on starting production of these resources (pips/10). */
const SETUP_LEAN: Record<Strategy, { woodBrick: number; wheatOre: number; sheep: number; reach: number }> = {
  current: { woodBrick: 0, wheatOre: 0, sheep: 0, reach: 0 },
  expand: { woodBrick: 1, wheatOre: 0, sheep: 0.3, reach: 1 },
  cities: { woodBrick: 0, wheatOre: 1, sheep: 0, reach: 0 },
  cards: { woodBrick: 0, wheatOre: 0.8, sheep: 0.6, reach: 0 },
  explore: { woodBrick: 0.6, wheatOre: 0, sheep: 0.6, reach: 1 },
  chart: { woodBrick: 0, wheatOre: 0.3, sheep: 0.3, reach: 0 },
};

/** The strategy a seat's knobs select. */
export function strategyOf(knobs: Knobs): Strategy {
  return STRATEGIES[Math.round(knobs.strategy)] ?? 'current';
}

/** Knobs for playing `strategy` (its presets and its index). */
export function withStrategy(knobs: Knobs, strategy: Strategy): Knobs {
  return { ...knobs, ...STRATEGY_KNOBS[strategy], strategy: STRATEGIES.indexOf(strategy) };
}

/** Whether a strategy means anything on this map (no exploring without sea, no charts without Cartographers). */
export function strategyFits(view: GameView, strategy: Strategy): boolean {
  if (strategy === 'explore') return view.seafaring;
  if (strategy === 'chart') return !!view.cartographers;
  return true;
}

/**
 * Extra setup score for a starting position under this strategy, from the setup features
 * (production in pips/10 and reach), scaled by `setupLean`.
 */
export function setupLean(
  knobs: Knobs,
  f: { woodBrick: number; wheatOre: number; sheep: number; reach: number },
): number {
  const lean = SETUP_LEAN[strategyOf(knobs)];
  return (
    knobs.setupLean *
    (lean.woodBrick * f.woodBrick + lean.wheatOre * f.wheatOre + lean.sheep * f.sheep + lean.reach * f.reach)
  );
}
