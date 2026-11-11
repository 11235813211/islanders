import { BUILD_COSTS } from '../../engine/core';
import { type GameAction, RESOURCES, type ResourceBag } from '../../types';
import { COSTS } from '../analysis';
import type { TurnOptions } from '../types';
import type { Economy } from './economy';
import type { Net } from './net';
import { buildStep, longestRoadMove, towardTarget } from './turn';
import { cornerYield, currentPosition, type Position, positionValue, withBuild } from './value';

/**
 * One build-phase move chosen by the value network: every sensible move (a city, a settlement,
 * a road toward the target or for Longest Road, a development card, a bank trade, or stopping)
 * is tried on the position summary, and the move whose result the network rates highest wins.
 * Returns null when stopping is best (the caller may still try offers to players).
 */

interface Candidate {
  action: GameAction | null;
  position: Position;
}

const SHIP = BUILD_COSTS.ship;

function candidates(econ: Economy): Candidate[] {
  const { view } = econ;
  const base = currentPosition(econ);
  const out: Candidate[] = [{ action: null, position: base }];
  for (const v of view.legal.cities) {
    const p = withBuild(base, cornerYield(econ, v), COSTS.city);
    out.push({
      action: { type: 'build-city', vertexId: v },
      position: { ...p, points: p.points + 1, citiesLeft: p.citiesLeft - 1, settlementsLeft: p.settlementsLeft + 1 },
    });
  }
  for (const v of view.legal.settlements) {
    const p = withBuild(base, cornerYield(econ, v), COSTS.settlement);
    const bonus = econ.islandBonus(econ.geo.indexOf.get(v)!);
    const next = econ.target?.vertexId === v ? econ.runnerUp : econ.target;
    out.push({
      action: { type: 'build-settlement', vertexId: v },
      position: {
        ...p,
        points: p.points + 1 + bonus,
        settlementsLeft: p.settlementsLeft - 1,
        spots: Math.max(0, p.spots - 1),
        targetValue: next?.value ?? 0,
        targetDistance: next?.distance ?? 9,
      },
    });
  }
  const road = towardTarget(econ);
  if (road && 'edgeId' in road) {
    const cost = road.type === 'build-ship' ? SHIP : COSTS.road;
    const p = withBuild(base, { production: zero(), choice: 0 }, cost);
    const distance = base.targetDistance - 1;
    out.push({
      action: road,
      position: {
        ...p,
        routesLeft: p.routesLeft - 1,
        targetDistance: distance,
        spots: distance <= 0 ? p.spots + 1 : p.spots,
      },
    });
  }
  const award = longestRoadMove(econ);
  if (award && 'edgeId' in award.action) {
    const cost = award.action.type === 'build-ship' ? SHIP : COSTS.road;
    const p = withBuild(base, { production: zero(), choice: 0 }, cost);
    const others = Math.max(4, ...view.players.filter(q => q.id !== view.selfId).map(q => q.longestRoad));
    const takes = award.length > others && base.roadAward !== 1;
    out.push({
      action: award.action,
      position: {
        ...p,
        road: award.length,
        roadAward: takes ? 1 : p.roadAward,
        points: p.points + (takes ? 2 : 0),
        routesLeft: p.routesLeft - 1,
      },
    });
  }
  if (view.legal.development) {
    const p = withBuild(base, { production: zero(), choice: 0 }, COSTS.development);
    out.push({ action: { type: 'buy-development' }, position: { ...p, developments: p.developments + 1 } });
  }
  for (const give of RESOURCES) {
    const rate = view.tradeRates[give];
    if (view.hand[give] < rate) continue;
    for (const receive of RESOURCES) {
      if (receive === give || !econ.bankHas(receive)) continue;
      const hand = { ...base.hand };
      hand[give] -= rate;
      hand[receive]++;
      out.push({ action: { type: 'trade', give, receive }, position: { ...base, hand } });
    }
  }
  return out;
}

const zero = (): ResourceBag => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });

/** Deterministic 0–1 noise from the view (training exploration only). */
function noise(econ: Economy): number {
  let h = 2166136261;
  for (const ch of `${econ.view.version}:${econ.view.selfId}:${econ.view.turn}`)
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 2 ** 32;
}

const BUILDS = new Set<GameAction['type']>([
  'build-city',
  'build-settlement',
  'build-road',
  'build-ship',
  'buy-development',
]);

/**
 * The build phase with the value network. The planner decides whether to spend (left to itself
 * the network hoards: it learned that winners hold cards, and one step of lookahead can't see
 * what a road or a card leads to). When the planner would build, the network picks what: any
 * affordable city, settlement, road, or card, judged by the position it leads to.
 */
export function valueBuild(econ: Economy, net: Net, options: TurnOptions): GameAction {
  const plan = buildStep(econ, options);
  if (!BUILDS.has(plan.type)) return plan;
  const builds = candidates(econ).filter(c => c.action && BUILDS.has(c.action.type));
  return valueMove(econ, net, builds, econ.knobs.valueExplore) ?? plan;
}

/** Training check that exploration happens: decisions made, and explored moves that differed. */
export const exploration = { decisions: 0, explored: 0, differed: 0 };

/** The best move by the value network, or null to stop building. */
export function valueMove(econ: Economy, net: Net, options: Candidate[], explore = 0): GameAction | null {
  if (!options.length) return null;
  const best = bestOf(econ, net, options);
  exploration.decisions++;
  if (explore) {
    const roll = noise(econ);
    if (roll < explore) {
      const pick = options[Math.floor((roll / explore) * options.length)]!.action;
      exploration.explored++;
      if (JSON.stringify(pick) !== JSON.stringify(best)) exploration.differed++;
      return pick;
    }
  }
  return best;
}

function bestOf(econ: Economy, net: Net, options: Candidate[]): GameAction | null {
  let best = options[0]!;
  let score = positionValue(net, econ, best.position);
  for (const option of options.slice(1)) {
    const s = positionValue(net, econ, option.position);
    if (s > score) [best, score] = [option, s];
  }
  return best.action;
}
