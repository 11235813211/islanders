import { BUILD_COSTS } from '../../engine/core';
import { surveySpots } from '../../engine/legal';
import { boardIndex, isWater } from '../../seafaring';
import { RESOURCES, type ResourceBag } from '../../types';
import { roadPaths } from '../analysis';
import type { Economy } from './economy';

/**
 * Cartographers for the Advanced bot's planner. A survey ship is the cheapest point in the game
 * (3 lodestone and 1 ore, on a ship out at sea) and charts the tiles around the bot's nearest town,
 * so the bot plans for one like a city: it values lodestone, saves it, and sails a ship out to
 * open sea for it.
 */

/** How the bot would fit out its next survey ship: the cards still needed, and the first ship on the way. */
export interface SurveyRoute {
  cost: ResourceBag;
  /** New ships needed before one is out at sea (0: one already is). */
  distance: number;
  firstEdge: string | null;
}

/** Most new ships the bot will plan to sail out for a survey ship. */
const MAX_SAIL = 4;

/**
 * The cheapest way to the next survey ship, or null when it has none left or no sea to reach.
 * A corner with only water around it (none surveyed, no pirate) is open sea: the ship that
 * arrives there has water on both sides.
 */
export function surveyRoute(econ: Economy): SurveyRoute | null {
  const { view, self } = econ;
  if (!view.cartographers || !self.surveysLeft) return null;
  if (surveySpots(view, view.selfId).length) return { cost: { ...BUILD_COSTS.survey }, distance: 0, firstEdge: null };
  if (!self.shipsLeft) return null;
  const index = boardIndex(view.board);
  const surveyed = new Set(view.surveys.flatMap(id => index.edgeHexes.get(id)!.map(h => h.id)));
  let best: { distance: number; firstEdge: string } | null = null;
  for (const [vertexId, path] of roadPaths(econ.board)) {
    if (!path.distance || path.distance > MAX_SAIL || path.firstKind !== 'ship' || !path.firstEdge) continue;
    if (path.distance > self.shipsLeft || (best && path.distance >= best.distance)) continue;
    const hexes = index.vertex.get(vertexId)!.hexIds.map(id => index.hex.get(id)!);
    const open = hexes.every(h => isWater(h.terrain) && !surveyed.has(h.id) && h.id !== view.pirate);
    if (open) best = { distance: path.distance, firstEdge: path.firstEdge };
  }
  if (!best) return null;
  const cost = { ...BUILD_COSTS.survey };
  for (const r of RESOURCES) cost[r] += BUILD_COSTS.ship[r] * best.distance;
  return { cost, ...best };
}
