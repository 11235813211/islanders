import { DEFAULT_ROUTE_GOAL, DEFAULT_SETUP, SPECIAL_LIMITS } from './special';
import { type BoardDesign, type PieceReward, type RouteGoal, type RouteZone, type RouteZones, tileKey } from './types';

/** Board editor changes to special rules (pure; the editor applies them through its history). */

/** Which route area the Route tool paints. */
export interface RouteTarget {
  route: number;
  zone: RouteZone;
}

const emptyRoute = (): RouteZones => ({ start: [], next: [], finish: [] });

/** Tiles a route area may hold: land, or fog that may turn out to be land. */
const zoneTile = (design: BoardDesign, q: number, r: number) =>
  design.tiles.some(t => t.q === q && t.r === r && t.kind !== 'sea' && t.kind !== 'iceberg');

/** Is this tile in the target area? */
export function inRouteZone(design: BoardDesign, target: RouteTarget, q: number, r: number): boolean {
  return !!design.routes?.[target.route]?.[target.zone].includes(tileKey(q, r));
}

/** Add (or remove) tiles from one route area, creating the route when it is new. */
export function paintRoute(
  design: BoardDesign,
  target: RouteTarget,
  cells: { q: number; r: number }[],
  add: boolean,
): BoardDesign {
  const routes = [...(design.routes ?? [])];
  if (target.route >= SPECIAL_LIMITS.routes) return design;
  while (routes.length <= target.route) routes.push(emptyRoute());
  const route = routes[target.route]!;
  const keys = new Set(route[target.zone]);
  let changed = false;
  for (const { q, r } of cells) {
    const key = tileKey(q, r);
    if (add && zoneTile(design, q, r) && !keys.has(key) && keys.size < SPECIAL_LIMITS.routeTiles) {
      keys.add(key);
      changed = true;
    } else if (!add && keys.delete(key)) changed = true;
  }
  if (!changed) return design;
  routes[target.route] = { ...route, [target.zone]: [...keys] };
  return { ...design, routes };
}

/** A new empty route at the end. */
export function addRoute(design: BoardDesign): BoardDesign {
  const routes = design.routes ?? [];
  if (routes.length >= SPECIAL_LIMITS.routes) return design;
  return { ...design, routes: [...routes, emptyRoute()] };
}

/**
 * Drop route `index`. An empty list stays (rather than no field), so a version for other player
 * counts with its routes removed doesn't fall back to the main layout's.
 */
export function removeRoute(design: BoardDesign, index: number): BoardDesign {
  return { ...design, routes: (design.routes ?? []).filter((_, i) => i !== index) };
}

/** The route goal the editor shows (the default until changed). */
export const routeGoalOf = (design: BoardDesign): RouteGoal => design.routeGoal ?? DEFAULT_ROUTE_GOAL;

/** Set what finishing a route does. An optional route always gives at least a point. */
export function setRouteGoal(design: BoardDesign, goal: RouteGoal): BoardDesign {
  const points = goal.required ? goal.points : Math.max(1, goal.points);
  return { ...design, routeGoal: { required: goal.required, points } };
}

/** What each setup round places (the usual two settlements are stored as nothing). */
export const setupOf = (design: BoardDesign) => design.setupPieces ?? DEFAULT_SETUP;

/** Set the setup rounds, dropping the field when it is the usual two settlements. */
export function setSetupPieces(design: BoardDesign, pieces: BoardDesign['setupPieces']): BoardDesign {
  const { setupPieces: _s, ...rest } = design;
  return pieces && pieces.join() !== DEFAULT_SETUP.join() ? { ...rest, setupPieces: pieces } : rest;
}

/** Set the piece rewards, dropping the field when there are none. */
export function setRewards(design: BoardDesign, rewards: PieceReward[]): BoardDesign {
  const { pieceRewards: _p, ...rest } = design;
  return rewards.length ? { ...rest, pieceRewards: rewards } : rest;
}

/** A new reward a few points past the last one (or the points to win less two). */
export function nextReward(design: BoardDesign): PieceReward {
  const last = Math.max(0, ...(design.pieceRewards ?? []).map(r => r.points));
  const points = last ? last + 3 : Math.max(3, design.victoryPoints - 2);
  return { points, settlements: 1, cities: 1, roads: 2 };
}

/** Problems that make a route unplayable, in words for the editor. */
export function routeWarnings(design: BoardDesign): string[] {
  const several = (design.routes?.length ?? 0) > 1;
  return (design.routes ?? []).flatMap((route, i) => {
    const name = several ? `Route ${i + 1}` : 'The route';
    const missing = (['start', 'next', 'finish'] as const).filter(
      z => !route[z].some(k => design.tiles.some(t => tileKey(t.q, t.r) === k)),
    );
    if (!missing.length) return [];
    const names = { start: 'Start', next: 'Second', finish: 'Finish' };
    return [`${name} needs ${missing.map(z => names[z]).join(', ')} tiles. Until then it is left out.`];
  });
}
