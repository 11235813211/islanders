import { hexCenter } from '../board';
import type { DesignHarbor, DesignTile } from './types';
import { SIDE_DIRECTIONS, tileKey } from './types';

/** Harbors closer than this (board units, edge midpoint to midpoint) would crowd one corner. */
const MIN_SPACING = 75;

const isLand = (tile: DesignTile | undefined) => !!tile && tile.kind !== 'sea' && tile.kind !== 'iceberg';

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
 * coastal edge farthest from every harbor already placed. Deterministic for a given board.
 */
export function autoHarbors(tiles: DesignTile[], count: number, existing: DesignHarbor[] = []): DesignHarbor[] {
  const coast = coastEdges(tiles);
  const midpoint = (h: DesignHarbor) => {
    const a = hexCenter(h.q, h.r);
    const [dq, dr] = SIDE_DIRECTIONS[h.side]!;
    const b = hexCenter(h.q + dq, h.r + dr);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const placed = existing.map(midpoint);
  const added: DesignHarbor[] = [];
  const cx = coast.reduce((n, e) => n + e.x, 0) / Math.max(1, coast.length);
  const cy = coast.reduce((n, e) => n + e.y, 0) / Math.max(1, coast.length);
  for (let i = 0; i < count; i++) {
    let best: { edge: (typeof coast)[number]; score: number } | null = null;
    for (const edge of coast) {
      const nearest = placed.length
        ? Math.min(...placed.map(p => Math.hypot(p.x - edge.x, p.y - edge.y)))
        : Math.hypot(edge.x - cx, edge.y - cy);
      if (placed.length && nearest < MIN_SPACING) continue;
      if (!best || nearest > best.score + 1e-6) best = { edge, score: nearest };
    }
    if (!best) break;
    const { x, y, ...harbor } = best.edge;
    added.push(harbor);
    placed.push({ x, y });
  }
  return added;
}
