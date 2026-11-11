import { BUILD_COSTS } from '../../engine/core';
import { type GameAction, RESOURCES, type ResourceBag } from '../../types';
import { COSTS } from '../analysis';
import type { TurnOptions } from '../types';
import type { Economy } from './economy';
import { type Net, seatChances } from './net';
import { buildStep, longestRoadMove, towardTarget } from './turn';
import { cornerYield, type Position, seatFeatures, seatPositions, withBuild } from './value';

/**
 * Build-phase moves chosen by the value network: every sensible move (a city, a settlement, a
 * road toward the best open corner or for Longest Road, a development card, a bank trade, or
 * stopping) is tried on the seat summaries, and the move after which our chance to win is
 * highest wins. Each result is judged as the position the next player rolls from, which is what
 * the network was trained on.
 */

export interface Candidate {
  action: GameAction | null;
  /** Every seat after the move, ours first. */
  seats: Position[];
}

const SHIP = BUILD_COSTS.ship;
const NOTHING = { production: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }, choice: 0 };

/** The seats with ours replaced, and an award moved from its holder when we take it. */
function after(base: Position[], self: Position, award?: 'roadAward' | 'armyAward'): Position[] {
  return base.map((p, k) => {
    if (k === 0) return self;
    if (award && p[award]) return { ...p, [award]: false, points: p.points - 2 };
    return p;
  });
}

function settlementSelf(econ: Economy, me: Position, vertexId: string): Position {
  const p = withBuild(me, cornerYield(econ, vertexId), COSTS.settlement);
  const c = econ.geo.indexOf.get(vertexId)!;
  const tookReach = c === me.reachCorner;
  return {
    ...p,
    points: p.points + 1 + econ.islandBonus(c),
    settlementsLeft: p.settlementsLeft - 1,
    spots: tookReach ? p.spots : Math.max(0, p.spots - 1),
    reach: tookReach ? me.nextReach : me.reach,
    reachDistance: tookReach ? me.nextDistance : me.reachDistance,
  };
}

function roadSelf(me: Position, cost: ResourceBag): Position {
  const p = withBuild(me, NOTHING, cost);
  const distance = me.reachDistance - 1;
  const arrived = distance <= 0;
  return {
    ...p,
    routesLeft: p.routesLeft - 1,
    reachDistance: arrived ? me.nextDistance : distance,
    reach: arrived ? me.nextReach : me.reach,
    spots: arrived ? p.spots + 1 : p.spots,
  };
}

function candidates(econ: Economy): Candidate[] {
  const { view } = econ;
  const base = seatPositions(econ);
  const me = base[0]!;
  const out: Candidate[] = [{ action: null, seats: base }];
  for (const v of view.legal.cities) {
    const p = withBuild(me, cornerYield(econ, v), COSTS.city);
    const self = { ...p, points: p.points + 1, citiesLeft: p.citiesLeft - 1, settlementsLeft: p.settlementsLeft + 1 };
    out.push({ action: { type: 'build-city', vertexId: v }, seats: after(base, self) });
  }
  for (const v of view.legal.settlements)
    out.push({ action: { type: 'build-settlement', vertexId: v }, seats: after(base, settlementSelf(econ, me, v)) });
  const road = towardTarget(econ);
  if (road && 'edgeId' in road)
    out.push({ action: road, seats: after(base, roadSelf(me, road.type === 'build-ship' ? SHIP : COSTS.road)) });
  const award = longestRoadMove(econ);
  if (award && 'edgeId' in award.action) {
    const p = withBuild(me, NOTHING, award.action.type === 'build-ship' ? SHIP : COSTS.road);
    const others = Math.max(4, ...view.players.filter(q => q.id !== view.selfId).map(q => q.longestRoad));
    const takes = award.length > others && !me.roadAward;
    const self = {
      ...p,
      road: award.length,
      roadAward: takes || me.roadAward,
      points: p.points + (takes ? 2 : 0),
      routesLeft: p.routesLeft - 1,
    };
    out.push({ action: award.action, seats: after(base, self, takes ? 'roadAward' : undefined) });
  }
  if (view.legal.development) {
    const p = withBuild(me, NOTHING, COSTS.development);
    out.push({ action: { type: 'buy-development' }, seats: after(base, { ...p, developments: p.developments + 1 }) });
  }
  for (const give of RESOURCES) {
    const rate = view.tradeRates[give];
    if (view.hand[give] < rate) continue;
    for (const receive of RESOURCES) {
      if (receive === give || !econ.bankHas(receive)) continue;
      const hand = { ...me.hand };
      hand[give] -= rate;
      hand[receive]++;
      out.push({ action: { type: 'trade', give, receive }, seats: after(base, { ...me, hand }) });
    }
  }
  return out;
}

/** Deterministic 0–1 noise from the view (training exploration only). */
function noise(econ: Economy): number {
  let h = 2166136261;
  for (const ch of `${econ.view.version}:${econ.view.selfId}:${econ.view.turn}`)
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 2 ** 32;
}

/** Candidates without bank trades: every build and stopping (training's move comparisons). */
export function moveCandidates(econ: Economy): Candidate[] {
  return candidates(econ).filter(c => c.action?.type !== 'trade');
}

const BUILDS = new Set<GameAction['type']>([
  'build-city',
  'build-settlement',
  'build-road',
  'build-ship',
  'buy-development',
]);

/**
 * The build phase with the value network. With `valueRole` 0 the planner decides whether to
 * spend and the network picks what to build; with 1 the network also decides whether to build,
 * trade with the bank, or stop (the planner still makes offers to players when it stops).
 */
export function valueBuild(econ: Economy, net: Net, options: TurnOptions): GameAction {
  const plan = buildStep(econ, options);
  if (econ.knobs.valueRole < 0.5) {
    if (!BUILDS.has(plan.type)) return plan;
    const builds = candidates(econ).filter(c => c.action && BUILDS.has(c.action.type));
    return valueMove(econ, net, builds, econ.knobs.valueExplore) ?? plan;
  }
  const move = valueMove(econ, net, candidates(econ), econ.knobs.valueExplore);
  if (move) return move;
  // Stopping: an offer to players is still worth a try.
  return plan.type === 'offer-trade' ? plan : { type: 'end-turn' };
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
  // Judged as the position the next player rolls from.
  const next = (econ.seat + 1) % econ.view.players.length;
  let best: GameAction | null = null;
  let score = -1;
  for (const option of options) {
    const s = seatChances(net, seatFeatures(econ, option.seats, next))[0]!;
    if (s > score) [best, score] = [option.action, s];
  }
  return best;
}
