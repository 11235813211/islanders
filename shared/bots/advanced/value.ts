import { boardIndex } from '../../seafaring';
import { RESOURCES, type Resource, type ResourceBag } from '../../types';
import { COSTS, pips } from '../analysis';
import type { Economy } from './economy';
import { cornerPips, distanceFrom, openCorners } from './geometry';

/**
 * The value network sees every seat: a small summary per seat (production, likely hand, points,
 * awards, pieces, room to grow), and one shared network turns each summary into a score; a
 * softmax over the seats gives each one's chance to win. Seat 0 is always the seat that is
 * deciding, so a candidate move is tried by editing its summary and reading its chance (and,
 * when a move takes an award, the holder's summary too).
 *
 * Inputs are board-agnostic: totals and ratios, never which tile or corner. Opponents' hands are
 * the public card count (`view.likelyHands`), the same thing a person at the table could track.
 */

export interface Position {
  /** Index in view.players. */
  seat: number;
  production: ResourceBag;
  choice: number;
  hand: ResourceBag;
  points: number;
  developments: number;
  knights: number;
  road: number;
  roadAward: boolean;
  armyAward: boolean;
  settlementsLeft: number;
  citiesLeft: number;
  routesLeft: number;
  /** Open corners its routes already reach, and ones one or two pieces away. */
  spots: number;
  near: number;
  /** Best open corner further out: its worth (pips, discounted by distance) and distance. */
  reach: number;
  reachDistance: number;
  /** The corner behind `reach`, and the next best (for when it is taken). */
  reachCorner: number;
  nextReach: number;
  nextDistance: number;
  rates: Record<Resource, number>;
}

export const SEAT_FEATURES = [
  'self',
  'order',
  'points',
  'pointsToGo',
  'lead',
  'wood',
  'brick',
  'sheep',
  'wheat',
  'ore',
  'choice',
  'production',
  'productionShare',
  'kinds',
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
  'army',
  'road',
  'roadAward',
  'settlementsLeft',
  'citiesLeft',
  'routesLeft',
  'spots',
  'near',
  'reach',
  'reachDistance',
  'harborAny',
  'harborMatch',
  'players',
  'turn',
  'seafaring',
  'target',
  'deck',
] as const;

/** Most seats at a table; training pads to this. */
export const MAX_SEATS = 6;

/** Every seat's position as it stands, the deciding seat first, then the others in turn order. */
export function seatPositions(econ: Economy): Position[] {
  const { view } = econ;
  const n = view.players.length;
  const occupied = new Uint8Array(econ.geo.n);
  for (const id of Object.keys(view.buildings)) occupied[econ.geo.indexOf.get(id)!] = 1;
  const open = openCorners(econ.geo, occupied);
  return Array.from({ length: n }, (_, k) => seatPosition(econ, (econ.seat + k) % n, open));
}

function seatPosition(econ: Economy, seat: number, open: number[]): Position {
  const { view, geo } = econ;
  const player = view.players[seat]!;
  const self = player.id === view.selfId;
  const { production, choice } = self
    ? { production: econ.production, choice: econ.choicePips }
    : econ.productionOf(player.id);
  const frontier = econ.frontiers[seat]!;
  const reachLimit = view.seafaring ? 7 : 5;
  let spots = 0;
  let near = 0;
  const best = { value: 0, distance: 9, corner: -1 };
  const next = { value: 0, distance: 9 };
  for (const c of open) {
    const d = frontier.length ? distanceFrom(geo, frontier, c) : 255;
    if (d === 0) spots++;
    else if (d <= 2) near++;
    if (d === 0 || d > reachLimit) continue;
    const value = cornerPips(geo, c) / (1 + 0.5 * d ** 1.5);
    if (value > best.value) {
      Object.assign(next, { value: best.value, distance: best.distance });
      Object.assign(best, { value, distance: d, corner: c });
    } else if (value > next.value) Object.assign(next, { value, distance: d });
  }
  return {
    seat,
    production: { ...production },
    choice,
    hand: { ...econ.handOf(player.id) },
    points: self ? player.points : player.publicPoints,
    developments: self ? view.development.filter(c => c.kind !== 'victory-point').length : player.developmentCount,
    knights: player.knights,
    road: player.longestRoad,
    roadAward: view.longestRoadId === player.id,
    armyAward: view.largestArmyId === player.id,
    settlementsLeft: player.settlementsLeft,
    citiesLeft: player.citiesLeft,
    routesLeft: player.roadsLeft + (view.seafaring ? player.shipsLeft : 0),
    spots,
    near,
    reach: best.value,
    reachDistance: best.distance,
    reachCorner: best.corner,
    nextReach: next.value,
    nextDistance: next.distance,
    rates: self ? view.tradeRates : harborRates(econ, player.id),
  };
}

/** Bank rates from the harbors a player has built on. */
function harborRates(econ: Economy, playerId: string): Record<Resource, number> {
  const rates = { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4 };
  for (const [vertexId, b] of Object.entries(econ.view.buildings)) {
    if (b.playerId !== playerId) continue;
    const harbor = econ.geo.harbor[econ.geo.indexOf.get(vertexId)!];
    if (harbor === 'any') for (const r of RESOURCES) rates[r] = Math.min(rates[r], 3);
    else if (harbor) rates[harbor] = 2;
  }
  return rates;
}

const total = (p: Position) => RESOURCES.reduce((n, r) => n + p.production[r], p.choice);

/**
 * Network inputs for every seat (see SEAT_FEATURES); `positions[0]` is the deciding seat.
 * `mover` is the seat about to roll (training samples are taken just before a roll, so a move is
 * judged as the position the next player rolls from).
 */
export function seatFeatures(econ: Economy, positions: readonly Position[], mover = moverOf(econ)): number[][] {
  const meanProduction = positions.reduce((s, p) => s + total(p), 0) / positions.length || 1;
  return positions.map((p, k) => {
    const others = Math.max(0, ...positions.filter((_, j) => j !== k).map(q => q.points));
    return featuresOf(econ, p, k, mover, [(p.points - others) / 5, total(p) / meanProduction]);
  });
}

/** The seat whose turn it is (view.players index), or -1. */
export function moverOf(econ: Economy): number {
  return econ.view.players.findIndex(p => p.id === econ.view.turnPlayerId);
}

function featuresOf(econ: Economy, pos: Position, k: number, mover: number, [lead, share]: number[]): number[] {
  const { view } = econ;
  const n = view.players.length;
  const target = view.settings.victoryPoints;
  const cards = RESOURCES.reduce((s, r) => s + pos.hand[r], 0);
  const turns = (cost: ResourceBag) =>
    Math.min(10, econ.turnsWith(pos.hand, pos.production, pos.choice, cost, pos.rates)) / 10;
  return [
    k === 0 ? 1 : 0,
    mover < 0 ? 0 : ((pos.seat - mover + n) % n) / n,
    pos.points / target,
    (target - pos.points) / 10,
    lead,
    ...RESOURCES.map(r => pos.production[r] / 10),
    pos.choice / 10,
    total(pos) / 30,
    share,
    RESOURCES.filter(r => pos.production[r] > 0).length / 5,
    ...RESOURCES.map(r => pos.hand[r] / 4),
    cards / 10,
    Math.max(0, cards - view.settings.discardLimit) / 4,
    pos.citiesLeft ? turns(COSTS.city) : 1,
    pos.settlementsLeft && (pos.spots || pos.reach) ? turns(COSTS.settlement) : 1,
    view.developmentRemaining ? turns(COSTS.development) : 1,
    pos.developments / 3,
    pos.knights / 3,
    pos.armyAward ? 1 : 0,
    pos.road / 10,
    pos.roadAward ? 1 : 0,
    pos.settlementsLeft / 5,
    pos.citiesLeft / 4,
    pos.routesLeft / 15,
    Math.min(3, pos.spots) / 3,
    Math.min(5, pos.near) / 5,
    pos.reach / 10,
    Math.min(9, pos.reachDistance) / 5,
    RESOURCES.some(r => pos.rates[r] === 3) ? 1 : 0,
    RESOURCES.reduce((s, r) => s + (pos.rates[r] === 2 ? pos.production[r] : 0), 0) / 10,
    n / 6,
    Math.min(150, view.turn) / 100,
    view.seafaring ? 1 : 0,
    target / 15,
    view.developmentRemaining / 25,
  ];
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
