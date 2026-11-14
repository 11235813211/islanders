import { openRoutes, routeCorners, routeNeed, setupLeft } from '../../../shared/maps/special';
import type { GameView } from '../../../shared/types';
import type { ZoneOutline } from '../RouteZones';

const isSetup = (view: GameView) => view.phase === 'setup-settlement' || view.phase === 'setup-road';

/** The viewer's own starting settlements (all their buildings, during setup). */
const ownSites = (view: GameView) =>
  Object.entries(view.buildings)
    .filter(([, b]) => b.playerId === view.selfId)
    .map(([id]) => id);

/**
 * Route areas this viewer should see. During setup: the start and second areas of every route
 * they can still take, with each finish line faint. Once their starting settlements cover a route
 * (and after setup): only their own finish area, in green.
 */
export function viewerZones(view: GameView): ZoneOutline[] {
  const routes = view.board.rules?.routes;
  const me = view.players.find(p => p.id === view.selfId);
  if (!routes?.length || !me || view.role !== 'player') return [];
  const tag = (i: number) => (routes.length > 1 ? { route: i } : {});
  const finish = (i: number, faint = false): ZoneOutline => ({
    tiles: routes[i]!.finish,
    zone: 'finish',
    faint,
    ...tag(i),
  });
  if (isSetup(view)) {
    const mine = ownSites(view);
    const corners = routeCorners(view.board);
    const done = corners.findIndex(r => routeNeed(r, mine) === 0);
    if (done >= 0) return [finish(done)];
    const left = setupLeft(view.setupOrder, view.setupIndex, me.id, view.phase === 'setup-settlement');
    return openRoutes(view.board, mine, left).flatMap(i => [
      { tiles: routes[i]!.next, zone: 'next' as const, ...tag(i) },
      { tiles: routes[i]!.start, zone: 'start' as const, ...tag(i) },
      finish(i, true),
    ]);
  }
  return me.route === null || !routes[me.route] ? [] : [finish(me.route)];
}

/** A short line for the turn bar about the viewer's route, or null when there is nothing to say. */
export function routeReminder(view: GameView): string | null {
  const goal = view.board.rules?.routeGoal;
  const me = view.players.find(p => p.id === view.selfId);
  if (!goal?.required || !me || me.route === null || me.routeDone || isSetup(view)) return null;
  return me.points >= view.settings.victoryPoints ? 'Build in your green Finish area to win' : null;
}
