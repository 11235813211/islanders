import { chosenRoute, openRoutes, rewardText, routeFinished, setupLeft } from '../maps/special';
import { victoryPoints } from '../rules';
import type { GameState } from '../types';
import { addLog } from './core';

/**
 * Map goals beyond points: routes (where starting settlements must go, and the finish area each
 * player must reach) and pieces added to a player's supply at some points.
 */

/** A player's own buildings, which during setup are their starting settlements. */
const ownSites = (state: Pick<GameState, 'buildings'>, playerId: string) =>
  Object.entries(state.buildings)
    .filter(([, b]) => b.playerId === playerId)
    .map(([id]) => id);

/**
 * Starting corners that still let this player cover a route (one in its start area, another in its
 * second area) with the placements they have left. When none of `sites` does (the areas filled up),
 * every site stays open rather than leaving the player stuck.
 */
export function routeSetupSites(state: GameState, playerId: string, sites: string[]): string[] {
  if (!state.board.rules?.routes?.length) return sites;
  const mine = ownSites(state, playerId);
  const left = setupLeft(state.setupOrder, state.setupIndex, playerId, true) - 1;
  const fits = sites.filter(v => openRoutes(state.board, [...mine, v], left).length);
  return fits.length ? fits : sites;
}

/** After a starting settlement: note the route this player's settlements have chosen so far. */
export function noteRoute(next: GameState, playerId: string): void {
  const route = chosenRoute(next.board, ownSites(next, playerId));
  if (route !== null) next.routeOf[playerId] = route;
}

/** Whether a player meets the map's route rule for winning (always, on maps without a required route). */
export function routeMet(state: GameState, playerId: string): boolean {
  if (!state.board.rules?.routeGoal?.required) return true;
  return routeFinished(state.board, state.buildings, playerId, state.routeOf[playerId]);
}

/** Record each player's highest public points, logging any piece rewards newly earned. */
export function updatePeaks(next: GameState): void {
  const rewards = next.board.rules?.rewards ?? [];
  for (const player of next.players) {
    const before = next.peakPoints[player.id] ?? 0;
    const now = victoryPoints(next, player.id, false);
    if (now <= before) continue;
    next.peakPoints[player.id] = now;
    for (const r of rewards)
      if (r.points > before && r.points <= now)
        addLog(next, `${player.name} reached ${r.points} points: ${rewardText(r)}.`);
  }
}
