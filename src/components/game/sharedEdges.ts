import { edgeOwners } from '../../../shared/crossings';
import type { GameView } from '../../../shared/types';

type Point = { x: number; y: number };

/** How far apart side-by-side pieces on one edge sit, as a share of the edge's length. */
const SPREAD = 0.16;

/**
 * Where to draw one player's piece on an edge. Crossing routes can put several players' pieces on
 * one edge; they are drawn side by side across it so each stays visible.
 */
export function pieceEnds(
  view: Pick<GameView, 'roads' | 'ships' | 'crossings'>,
  edgeId: string,
  owner: string,
  ends: readonly [Point, Point],
): readonly [Point, Point] {
  const owners = edgeOwners(view, edgeId);
  if (owners.length < 2) return ends;
  const [a, b] = ends;
  const shift = (owners.indexOf(owner) - (owners.length - 1) / 2) * SPREAD;
  // Perpendicular to the edge, scaled by its length.
  const dx = -(b.y - a.y) * shift;
  const dy = (b.x - a.x) * shift;
  return [
    { x: a.x + dx, y: a.y + dy },
    { x: b.x + dx, y: b.y + dy },
  ];
}
