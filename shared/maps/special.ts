import type { Board, Building } from '../types';
import { type BoardDesign, type BoardRules, type PieceReward, type RouteGoal, type SetupPiece, tileKey } from './types';

/**
 * A board's special rules: what each setup round places and in what order, pieces added at some
 * points, and routes. Pure helpers shared by the engine, bots, editor, and map picker.
 */

export const DEFAULT_SETUP: SetupPiece[] = ['settlement', 'settlement'];
export const DEFAULT_ROUTE_GOAL: RouteGoal = { required: false, points: 2 };
export const SPECIAL_LIMITS = {
  setupRounds: { min: 2, max: 4 },
  rewards: 8,
  rewardPieces: 5,
  routes: 6,
  routeTiles: 80,
  routePoints: 5,
} as const;

/** Each player's usual pieces (a map's `supply` changes some). */
export const PIECE_LIMITS = { roads: 15, ships: 15, settlements: 5, cities: 4, relays: 4, surveys: 4 } as const;

/** How few and how many of each piece a map may give each player (the usual counts are in PIECE_LIMITS). */
export const SUPPLY_LIMITS = {
  settlements: { min: 2, max: 10 },
  cities: { min: 0, max: 8 },
  roads: { min: 2, max: 30 },
  ships: { min: 0, max: 30 },
  relays: { min: 0, max: 8 },
  surveys: { min: 0, max: 8 },
} as const;
export type SupplyKind = keyof typeof SUPPLY_LIMITS;

/** What each setup round places on this board. */
export const setupPieces = (rules: BoardRules | undefined): SetupPiece[] => rules?.setup ?? DEFAULT_SETUP;

/**
 * Whether setup round `round` (0-based) goes first seat to last. Rounds follow the Thue–Morse
 * sequence (forward, back, back, forward): two rounds are the usual snake, a third round goes back
 * again so the first seat's best pick is paid for with the last pick, and four rounds give every
 * seat the same total of pick positions.
 */
export function roundForward(round: number): boolean {
  let ones = 0;
  for (let n = round; n; n >>= 1) ones += n & 1;
  return ones % 2 === 0;
}

/** Who places in each setup step, for seats `ids` (in turn order) and `rounds` rounds. */
export function setupSequence(ids: string[], rounds: number): string[] {
  return Array.from({ length: rounds }, (_, round) => (roundForward(round) ? ids : [...ids].reverse())).flat();
}

/** Setup placements `playerId` still has, counting the one being made now when `placing`. */
export function setupLeft(order: string[], index: number, playerId: string, placing: boolean): number {
  return order.filter((id, i) => id === playerId && (i > index || (placing && i === index))).length;
}

/** The special rules a layout plays with (a design already narrowed to one version by designFor). */
export function rulesOf(design: BoardDesign): BoardRules | undefined {
  const rules: BoardRules = {};
  if (design.setupPieces && design.setupPieces.join() !== DEFAULT_SETUP.join()) rules.setup = design.setupPieces;
  if (design.pieceRewards?.length) rules.rewards = design.pieceRewards;
  if (design.supply && Object.keys(design.supply).length) rules.supply = design.supply;
  const routes = (design.routes ?? []).filter(r => r.start.length && r.next.length && r.finish.length);
  if (routes.length) {
    rules.routes = routes;
    rules.routeGoal = design.routeGoal ?? DEFAULT_ROUTE_GOAL;
  }
  return Object.keys(rules).length ? rules : undefined;
}

/** Pieces a player's rewards add, for the most points they have had. */
export function rewardTotals(rewards: PieceReward[] | undefined, peak: number) {
  const total = { settlements: 0, cities: 0, roads: 0, ships: 0 };
  for (const r of rewards ?? []) {
    if (r.points > peak) continue;
    total.settlements += r.settlements;
    total.cities += r.cities;
    total.roads += r.roads;
    total.ships += rewardShips(r);
  }
  return total;
}

/** Ships one reward adds: its own count, or (older rewards) as many as its roads. */
export const rewardShips = (reward: PieceReward): number => reward.ships ?? reward.roads;

/** "+1 city, +2 roads": what one reward adds. `sea` also names its ships. */
export function rewardText(reward: PieceReward, sea = false): string {
  const part = (n: number, one: string, many: string) => (n ? [`+${n} ${n === 1 ? one : many}`] : []);
  return [
    ...part(reward.settlements, 'settlement', 'settlements'),
    ...part(reward.cities, 'city', 'cities'),
    ...part(reward.roads, 'road', 'roads'),
    ...(sea ? part(rewardShips(reward), 'ship', 'ships') : []),
  ].join(', ');
}

/** Corners touching each zone of each route, per board (boards never change their rules). */
export interface RouteCorners {
  start: Set<string>;
  next: Set<string>;
  finish: Set<string>;
}
const cornerCache = new WeakMap<Board, RouteCorners[]>();

/** Each route's zones as the corners that touch them. */
export function routeCorners(board: Board): RouteCorners[] {
  const cached = cornerCache.get(board);
  if (cached) return cached;
  const hexKey = new Map(board.hexes.map(h => [h.id, tileKey(h.q, h.r)]));
  const corners = (zone: string[]) => {
    const keys = new Set(zone);
    const found = new Set<string>();
    for (const v of board.vertices) if (v.hexIds.some(id => keys.has(hexKey.get(id)!))) found.add(v.id);
    return found;
  };
  const result = (board.rules?.routes ?? []).map(r => ({
    start: corners(r.start),
    next: corners(r.next),
    finish: corners(r.finish),
  }));
  cornerCache.set(board, result);
  return result;
}

/** Starting settlements still needed for `sites` to cover a route: one in its start, another in its second area. */
export function routeNeed(route: RouteCorners, sites: string[]): number {
  const a = sites.filter(s => route.start.has(s));
  const b = sites.filter(s => route.next.has(s));
  if (a.some(x => b.some(y => y !== x))) return 0;
  return a.length || b.length ? 1 : 2;
}

/** Routes a player can still complete with `left` more starting settlements. */
export function openRoutes(board: Board, sites: string[], left: number): number[] {
  return routeCorners(board).flatMap((route, i) => (routeNeed(route, sites) <= left ? [i] : []));
}

/** The route starting settlements chose: the first they complete, else the first they began. */
export function chosenRoute(board: Board, sites: string[]): number | null {
  const routes = routeCorners(board);
  if (!routes.length) return null;
  const needs = routes.map(r => routeNeed(r, sites));
  const best = Math.min(...needs);
  return needs.indexOf(best);
}

/** A player has a settlement or city in their route's finish area. */
export function routeFinished(
  board: Board,
  buildings: Record<string, Building>,
  playerId: string,
  route: number | null | undefined,
): boolean {
  if (route === null || route === undefined) return false;
  const finish = routeCorners(board)[route]?.finish;
  if (!finish) return false;
  for (const id of finish) if (buildings[id]?.playerId === playerId) return true;
  return false;
}

/** One special rule in words, for the map picker and the in-game help. */
export interface SpecialRule {
  kind: 'setup' | 'supply' | 'rewards' | 'routes';
  title: string;
  lines: string[];
}

const ordinal = (n: number) => ['first', 'second', 'third', 'fourth'][n] ?? `${n + 1}th`;

/** Words for one setup round's order. */
const roundOrder = (round: number) => (roundForward(round) ? 'first to last' : 'last to first');

/** A board's special rules, explained in a few short lines each. `sea` mentions ships. */
export function specialRules(rules: BoardRules | undefined, sea = false): SpecialRule[] {
  const out: SpecialRule[] = [];
  if (rules?.setup) {
    const pieces = rules.setup;
    const lines = [
      pieces.map((p, i) => `${i === 0 ? 'Round' : 'round'} ${i + 1}: ${p}`).join(', ') + '.',
      'Each comes with a road' + (sea ? ' or ship.' : '.'),
      `Only the ${ordinal(pieces.length - 1)} one collects a card from each tile beside it.`,
    ];
    if (pieces.length > 2) {
      lines.push(`Order: ${pieces.map((_, i) => roundOrder(i)).join(', then ')}.`);
      lines.push('Going first in round 1 means going last in round 3.');
    }
    out.push({ kind: 'setup', title: `Start with ${pieces.length} pieces`, lines });
  }
  if (rules?.supply) {
    const names: Record<SupplyKind, string> = {
      settlements: 'settlements',
      cities: 'cities',
      roads: 'roads',
      ships: 'ships',
      relays: 'relays',
      surveys: 'survey ships',
    };
    const kinds = (Object.keys(names) as SupplyKind[]).filter(k => rules.supply![k] !== undefined);
    const lines = [`Each player has ${kinds.map(k => `${rules.supply![k]} ${names[k]}`).join(', ')}.`];
    out.push({ kind: 'supply', title: 'Different pieces', lines });
  }
  if (rules?.rewards?.length) {
    const lines = [...rules.rewards]
      .sort((a, b) => a.points - b.points)
      .map(r => `At ${r.points} points: ${rewardText(r, sea)}.`);
    lines.push('Counts points everyone can see. Kept once earned.');
    out.push({ kind: 'rewards', title: 'Extra pieces', lines });
  }
  if (rules?.routes?.length) {
    const goal = rules.routeGoal ?? DEFAULT_ROUTE_GOAL;
    const several = rules.routes.length > 1;
    const lines = [
      several
        ? `${rules.routes.length} routes. Your starting settlements pick yours.`
        : 'Every player takes the same route.',
      'Starting settlements: one in a Start area, another in its Second area.',
    ];
    const reward = goal.points ? `It scores ${goal.points} point${goal.points === 1 ? '' : 's'}.` : '';
    lines.push(
      goal.required
        ? `To win, you also need a settlement or city in your Finish area. ${reward}`.trim()
        : `Build in your Finish area to score ${goal.points} point${goal.points === 1 ? '' : 's'}.`,
    );
    lines.push('Your Finish area is outlined in green.');
    out.push({ kind: 'routes', title: goal.required ? 'Route to finish' : 'Route bonus', lines });
  }
  return out;
}
