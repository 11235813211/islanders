import { boardIndex } from '../../seafaring';
import { RESOURCES, type ResourceBag } from '../../types';
import { COSTS, pips } from '../analysis';
import type { Economy } from './economy';
import { type Net, predict } from './net';

/**
 * The value network: how likely this seat is to win from a position, learned from self-play.
 * A position is a small summary (production, hand, points, awards, pieces, room to expand), so a
 * candidate move can be tried by editing the summary instead of the game: the build phase scores
 * the position each move leads to and takes the best (one step of lookahead).
 *
 * Inputs are board-agnostic: totals and ratios, never which tile or corner.
 */

export interface Position {
  production: ResourceBag;
  choice: number;
  hand: ResourceBag;
  points: number;
  developments: number;
  knights: number;
  road: number;
  /** 1: we hold the award, -1: someone else does, 0: nobody. */
  roadAward: number;
  armyAward: number;
  settlementsLeft: number;
  citiesLeft: number;
  routesLeft: number;
  targetValue: number;
  targetDistance: number;
  /** Corners we could settle right now. */
  spots: number;
}

export const VALUE_FEATURES = [
  'points',
  'pointsToGo',
  'oppMaxPoints',
  'oppSecondPoints',
  'lead',
  'wood',
  'brick',
  'sheep',
  'wheat',
  'ore',
  'choice',
  'production',
  'kinds',
  'oppMaxProduction',
  'oppMeanProduction',
  'handWood',
  'handBrick',
  'handSheep',
  'handWheat',
  'handOre',
  'handSize',
  'overLimit',
  'turnsCity',
  'turnsSettlement',
  'turnsDevelopment',
  'developments',
  'knights',
  'armyMine',
  'armyTheirs',
  'oppMaxKnights',
  'road',
  'roadMine',
  'roadTheirs',
  'oppMaxRoad',
  'settlementsLeft',
  'citiesLeft',
  'routesLeft',
  'targetValue',
  'targetDistance',
  'spots',
  'harborWood',
  'harborBrick',
  'harborSheep',
  'harborWheat',
  'harborOre',
  'players',
  'turn',
  'seafaring',
] as const;

const award = (holder: string | null, self: string) => (holder === self ? 1 : holder ? -1 : 0);

/** The position as it stands. */
export function currentPosition(econ: Economy): Position {
  const { view, self } = econ;
  return {
    production: { ...econ.production },
    choice: econ.choicePips,
    hand: { ...view.hand },
    points: self.points,
    developments: view.development.filter(c => c.kind !== 'victory-point').length,
    knights: self.knights,
    road: self.longestRoad,
    roadAward: award(view.longestRoadId, view.selfId),
    armyAward: award(view.largestArmyId, view.selfId),
    settlementsLeft: self.settlementsLeft,
    citiesLeft: self.citiesLeft,
    routesLeft: self.roadsLeft + (view.seafaring ? self.shipsLeft : 0),
    targetValue: econ.target?.value ?? 0,
    targetDistance: econ.target?.distance ?? 9,
    spots: econ.spots,
  };
}

interface Opponents {
  maxPoints: number;
  secondPoints: number;
  maxProduction: number;
  meanProduction: number;
  maxKnights: number;
  maxRoad: number;
}

const opponentCache = new WeakMap<Economy, Opponents>();

function opponents(econ: Economy): Opponents {
  const cached = opponentCache.get(econ);
  if (cached) return cached;
  const others = econ.view.players.filter(p => p.id !== econ.view.selfId);
  const points = others.map(p => p.publicPoints + p.developmentCount * 0.25).sort((a, b) => b - a);
  const production = others.map(p => {
    const { production, choice } = econ.productionOf(p.id);
    return RESOURCES.reduce((n, r) => n + production[r], choice);
  });
  const result = {
    maxPoints: points[0] ?? 0,
    secondPoints: points[1] ?? 0,
    maxProduction: Math.max(0, ...production),
    meanProduction: production.reduce((a, b) => a + b, 0) / (production.length || 1),
    maxKnights: Math.max(0, ...others.map(p => p.knights)),
    maxRoad: Math.max(0, ...others.map(p => p.longestRoad)),
  };
  opponentCache.set(econ, result);
  return result;
}

/** Network inputs for a position (see VALUE_FEATURES). */
export function valueFeatures(econ: Economy, pos: Position): number[] {
  const { view } = econ;
  const target = view.settings.victoryPoints;
  const opp = opponents(econ);
  const total = RESOURCES.reduce((n, r) => n + pos.production[r], pos.choice);
  const cards = RESOURCES.reduce((n, r) => n + pos.hand[r], 0);
  const turns = (cost: ResourceBag) => Math.min(10, econ.turnsWith(pos.hand, pos.production, pos.choice, cost)) / 10;
  return [
    pos.points / target,
    (target - pos.points) / 10,
    opp.maxPoints / target,
    opp.secondPoints / target,
    (pos.points - opp.maxPoints) / 5,
    ...RESOURCES.map(r => pos.production[r] / 10),
    pos.choice / 10,
    total / 30,
    RESOURCES.filter(r => pos.production[r] > 0).length / 5,
    opp.maxProduction / 30,
    opp.meanProduction / 30,
    ...RESOURCES.map(r => pos.hand[r] / 4),
    cards / 10,
    Math.max(0, cards - view.settings.discardLimit) / 4,
    pos.citiesLeft ? turns(COSTS.city) : 1,
    pos.settlementsLeft && (pos.spots || pos.targetValue) ? turns(COSTS.settlement) : 1,
    view.developmentRemaining ? turns(COSTS.development) : 1,
    pos.developments / 3,
    pos.knights / 3,
    pos.armyAward === 1 ? 1 : 0,
    pos.armyAward === -1 ? 1 : 0,
    opp.maxKnights / 3,
    pos.road / 10,
    pos.roadAward === 1 ? 1 : 0,
    pos.roadAward === -1 ? 1 : 0,
    opp.maxRoad / 10,
    pos.settlementsLeft / 5,
    pos.citiesLeft / 4,
    pos.routesLeft / 15,
    pos.targetValue / 15,
    Math.min(9, pos.targetDistance) / 5,
    Math.min(3, pos.spots) / 3,
    ...RESOURCES.map(r => (4 - view.tradeRates[r]) / 2),
    view.players.length / 6,
    Math.min(150, view.turn) / 100,
    view.seafaring ? 1 : 0,
  ];
}

/** Predicted chance of winning from a position. */
export function positionValue(net: Net, econ: Economy, pos: Position): number {
  return predict(net, valueFeatures(econ, pos));
}

/** Pips (robber counted) a building at this corner adds, by resource and choice. */
export function cornerYield(econ: Economy, vertexId: string): { production: ResourceBag; choice: number } {
  const index = boardIndex(econ.view.board);
  const production: ResourceBag = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  let choice = 0;
  for (const hexId of index.vertex.get(vertexId)!.hexIds) {
    const hex = index.hex.get(hexId)!;
    const p = hex.id === econ.view.robber ? 0 : pips(hex.number);
    if (!p) continue;
    if ((RESOURCES as readonly string[]).includes(hex.terrain)) production[hex.terrain as keyof ResourceBag] += p;
    else if (hex.terrain === 'gold' || (hex.terrain === 'volcano' && econ.view.settings.volcanoGold)) choice += p;
  }
  return { production, choice };
}

/** A copy of a position with a corner's yield added and a cost paid. */
export function withBuild(pos: Position, gain: ReturnType<typeof cornerYield>, cost: ResourceBag): Position {
  const next = { ...pos, production: { ...pos.production }, hand: { ...pos.hand } };
  for (const r of RESOURCES) {
    next.production[r] += gain.production[r];
    next.hand[r] -= cost[r];
  }
  next.choice += gain.choice;
  return next;
}
