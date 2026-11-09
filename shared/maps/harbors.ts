import { hexCenter } from '../board';
import type { DesignHarbor, DesignTile } from './types';
import { SIDE_DIRECTIONS, tileKey } from './types';

/** Harbors closer than this (board units, edge midpoint to midpoint) would crowd one corner. */
const MIN_SPACING = 75;

const isLand = (tile: DesignTile | undefined) => !!tile && tile.kind !== 'sea' && tile.kind !== 'iceberg';

/** About one harbor per two land tiles, like the base game's 9 for 19. */
export const harborTarget = (design: { tiles: DesignTile[] }) =>
  Math.max(3, Math.round(design.tiles.filter(isLand).length / 2.1));

/** Every land edge that faces a sea tile, with its midpoint. */
export function coastEdges(tiles: DesignTile[]): (DesignHarbor & { x: number; y: number })[] {
  const byKey = new Map(tiles.map(t => [tileKey(t.q, t.r), t]));
  const coast: (DesignHarbor & { x: number; y: number })[] = [];
  for (const tile of tiles) {
    if (!isLand(tile)) continue;
    const center = hexCenter(tile.q, tile.r);
    SIDE_DIRECTIONS.forEach(([dq, dr], side) => {
      if (byKey.get(tileKey(tile.q + dq, tile.r + dr))?.kind !== 'sea') return;
      const across = hexCenter(tile.q + dq, tile.r + dr);
      coast.push({
        q: tile.q,
        r: tile.r,
        side,
        kind: 'random',
        x: (center.x + across.x) / 2,
        y: (center.y + across.y) / 2,
      });
    });
  }
  return coast;
}

/**
 * Add up to `count` random-kind harbors spread around the coasts: each new one goes on the
 * coastal edge farthest from every harbor already placed. Without `random` the result is fixed for
 * a board (the built-in maps); with it, the first harbor's spot varies so each call spreads differently.
 */
export function autoHarbors(
  tiles: DesignTile[],
  count: number,
  existing: DesignHarbor[] = [],
  random?: () => number,
): DesignHarbor[] {
  const coast = coastEdges(tiles);
  const midpoint = (h: DesignHarbor) => {
    const a = hexCenter(h.q, h.r);
    const [dq, dr] = SIDE_DIRECTIONS[h.side]!;
    const b = hexCenter(h.q + dq, h.r + dr);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const placed = existing.map(midpoint);
  const added: DesignHarbor[] = [];
  if (random && !placed.length && coast.length && count > 0) {
    const { x, y, ...first } = coast[Math.floor(random() * coast.length)]!;
    added.push(first);
    placed.push({ x, y });
  }
  const cx = coast.reduce((n, e) => n + e.x, 0) / Math.max(1, coast.length);
  const cy = coast.reduce((n, e) => n + e.y, 0) / Math.max(1, coast.length);
  for (let i = added.length; i < count; i++) {
    let best: { edge: (typeof coast)[number]; score: number } | null = null;
    for (const edge of coast) {
      const nearest = placed.length
        ? Math.min(...placed.map(p => Math.hypot(p.x - edge.x, p.y - edge.y)))
        : Math.hypot(edge.x - cx, edge.y - cy);
      if (placed.length && nearest < MIN_SPACING) continue;
      const score = nearest + (random ? random() * 30 : 0);
      if (!best || score > best.score + 1e-6) best = { edge, score };
    }
    if (!best) break;
    const { x, y, ...harbor } = best.edge;
    added.push(harbor);
    placed.push({ x, y });
  }
  return added;
}
