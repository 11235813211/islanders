import type { GameView } from '../../types';
import { Economy } from './economy';
import { type Net, predict } from './net';
import type { Knobs } from './params';
import type { PlanKind } from './plans';
import { STRATEGIES, type Strategy, strategyFits } from './strategy';
import { SEAT_FEATURES, seatFeatures, seatPositions } from './value';

/**
 * The strategy selector (training/PLAN.md Phase 2): which strategy (strategy.ts) to lean toward
 * in this position, learned from the strategy probe's rollouts (training/strategy-search.ts). One
 * small network per strategy predicts its advantage over playing on as the shipped bot; the bot
 * takes the best if it clears `selectorMargin`, else plays as shipped. Cheap: a few dot products.
 */

/** Per strategy (except 'current'), a network whose output 0.5 means "no better than current". */
export type Selector = Partial<Record<Strategy, Net>>;

/** Goal kinds the planner weighs, in the order goal features list them. */
const GOAL_KINDS: PlanKind[] = ['city', 'settlement', 'route', 'development', 'road'];

/**
 * What the planner sees in this position (plans.ts), per goal kind: the best goal's payoff and
 * its rounds to afford (0 and 10 when there is none). These say directly when leaning toward a
 * kind of goal should pay, which seat summaries only hint at.
 */
export function goalFeatures(econ: Economy): number[] {
  const out: number[] = [];
  for (const kind of GOAL_KINDS) {
    let payoff = 0;
    let wait = 10;
    for (const plan of econ.plans) {
      if (plan.kind !== kind || plan.payoff <= payoff) continue;
      payoff = plan.payoff;
      wait = Math.min(10, econ.turnsToAfford(econ.view.hand, plan.cost));
    }
    out.push(payoff / 5, wait / 10);
  }
  out.push(econ.view.developmentRemaining / 25, econ.spots / 3);
  return out;
}

/** Selector inputs: our seat's summary, the leading opponent's (value.ts), and the goal features. */
export function selectorInput(seats: readonly (readonly number[])[], goals: readonly number[]): number[] {
  const points = SEAT_FEATURES.indexOf('points');
  const rivals = seats.slice(1);
  const leader = rivals.reduce((best, s) => (s[points]! > best[points]! ? s : best), rivals[0] ?? seats[0]!);
  return [...seats[0]!, ...leader, ...goals];
}

/** Input names (checked against a saved network so features can't silently drift). */
export const SELECTOR_INPUTS = [
  ...SEAT_FEATURES.map(f => `own:${f}`),
  ...SEAT_FEATURES.map(f => `leader:${f}`),
  ...GOAL_KINDS.flatMap(k => [`${k}:payoff`, `${k}:wait`]),
  'deckLeft',
  'spotsReached',
];

/** The strategy the selector picks for this view (null: play as shipped). */
export function selectStrategy(view: GameView, knobs: Knobs, selector: Selector): Strategy | null {
  const econ = new Economy(view, knobs);
  const x = selectorInput(seatFeatures(econ, seatPositions(econ)), goalFeatures(econ));
  let best: Strategy | null = null;
  let score = 0.5 + knobs.selectorMargin;
  for (const s of STRATEGIES) {
    const net = selector[s];
    if (!net || !strategyFits(view, s)) continue;
    const p = predict(net, x);
    if (p > score) [best, score] = [s, p];
  }
  return best;
}
