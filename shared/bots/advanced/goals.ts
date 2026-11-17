import { emptyBag } from '../../engine/core';
import { RESOURCES, type Resource, type ResourceBag } from '../../types';
import { COSTS } from '../analysis';
import type { Economy } from './economy';
import { horizon } from './plans';
import { harborRates } from './value';

/**
 * Trade-aware affordability and "pace" (points per round) for a seat's economy. Not used by the
 * shipped planner: a planner built on them (goalModel, 2026-11-17) played like r1 at twice the CPU
 * (training/ANALYSIS.md). Kept as candidate inputs for a value network (training/PLAN.md Phase 3)
 * and for reading positions (`goal-report`).
 *
 * - Affordability counts the trades we'd really make: surplus converts at our harbor rates and
 *   gold pays for anything, so a missing resource costs what trading for it costs.
 * - Pace is points per round for a typical mix of builds we still have pieces for (a city, a
 *   settlement with two roads, half a development card), so income is worth what it adds to it.
 */

/** A steady economy: cards per round by resource, gold (any card) per round, and trade rates. */
export interface Pace {
  income: ResourceBag;
  wild: number;
  rates: Record<Resource, number>;
}

/** Points a development card is worth in the build mix (victory points, knights, progress). */
const DEVELOPMENT_POINTS = 0.5;
/** Rounds we never look past. */
const CAP = 30;

/** A pace from pips (every seat rolls once a round; a pip is a 36th of a roll). */
export function paceFrom(
  econ: Economy,
  production: ResourceBag,
  choice: number,
  rates: Record<Resource, number>,
): Pace {
  const perRound = econ.view.players.length / 36;
  const income = emptyBag();
  for (const r of RESOURCES) income[r] = production[r] * perRound;
  return { income, wild: choice * perRound, rates };
}

const paceCache = new WeakMap<Economy, { pace: Pace; rate: number }>();

/** Our pace now and its points per round (once per decision). */
export function basePace(econ: Economy): { pace: Pace; rate: number } {
  let base = paceCache.get(econ);
  if (!base) {
    const pace = paceFrom(econ, econ.production, econ.choicePips, harborRates(econ, econ.view.selfId));
    base = { pace, rate: pointRate(econ, pace) };
    paceCache.set(econ, base);
  }
  return base;
}

/**
 * Rounds until `hand` plus income pays `cost`, trading surplus at our rates and spending gold
 * on any shortfall (a continuous estimate: dice luck and whole-card trades are averaged out).
 */
export function roundsToAfford(hand: ResourceBag, pace: Pace, cost: ResourceBag): number {
  const covered = (t: number) => {
    let credit = pace.wild * t;
    let need = 0;
    for (const r of RESOURCES) {
      const left = hand[r] + pace.income[r] * t - cost[r];
      if (left >= 0) credit += left / pace.rates[r];
      else need -= left;
    }
    return credit >= need;
  };
  if (covered(0)) return 0;
  if (!covered(CAP)) return CAP;
  let lo = 0;
  let hi = CAP;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (covered(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Points per round this pace earns on a typical mix of builds we still have pieces for. */
export function pointRate(econ: Economy, pace: Pace): number {
  const { self, view } = econ;
  const cost = emptyBag();
  let points = 0;
  const add = (bag: ResourceBag, times: number) => {
    for (const r of RESOURCES) cost[r] += bag[r] * times;
  };
  if (self.citiesLeft) {
    add(COSTS.city, 1);
    points += 1;
  }
  if (self.settlementsLeft) {
    add(COSTS.settlement, 1);
    add(COSTS.road, 2);
    points += 1;
  }
  if (view.developmentRemaining) {
    add(COSTS.development, 0.5);
    points += 0.5 * DEVELOPMENT_POINTS;
  }
  if (!points) return 0;
  return points / Math.max(0.5, roundsToAfford(emptyBag(), pace, cost));
}

/**
 * What new income (and a harbor) is worth in points: the gain in points per round, over the rounds
 * left once it starts (`after` rounds from now).
 */
export function incomeValue(
  econ: Economy,
  gain: { production: ResourceBag; choice: number },
  harbor: string | null | undefined,
  after: number,
): number {
  const { pace, rate } = basePace(econ);
  const perRound = econ.view.players.length / 36;
  const income = { ...pace.income };
  for (const r of RESOURCES) income[r] += gain.production[r] * perRound;
  const rates = { ...pace.rates };
  if (harbor === 'any') for (const r of RESOURCES) rates[r] = Math.min(rates[r], 3);
  else if (harbor && harbor in rates) rates[harbor as Resource] = 2;
  const next = { income, wild: pace.wild + gain.choice * perRound, rates };
  return (pointRate(econ, next) - rate) * Math.max(0, horizon(econ).rounds - after);
}
