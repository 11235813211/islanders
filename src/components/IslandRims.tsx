import { hexCenter, hexCorner } from '../../shared/board';
import { SIDE_DIRECTIONS, tileKey } from '../../shared/maps/types';

interface RimTile {
  q: number;
  r: number;
  /** Land (not sea or iceberg). */
  land: boolean;
  /** Starting settlements may go on this tile's island. */
  open: boolean;
}

/**
 * A bright line around every island that allows starting settlements. Islands closed to them get
 * no line, so the difference shows at a glance during setup and in map previews.
 */
export default function IslandRims({ tiles }: { tiles: RimTile[] }) {
  const land = new Set(tiles.filter(t => t.land).map(t => tileKey(t.q, t.r)));
  const segments: string[] = [];
  for (const tile of tiles) {
    if (!tile.land || !tile.open) continue;
    const c = hexCenter(tile.q, tile.r);
    SIDE_DIRECTIONS.forEach(([dq, dr], side) => {
      if (land.has(tileKey(tile.q + dq, tile.r + dr))) return;
      const a = hexCorner(c.x, c.y, side);
      const b = hexCorner(c.x, c.y, (side + 1) % 6);
      segments.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
    });
  }
  if (!segments.length) return null;
  const d = segments.join('');
  return (
    <g className="island-rims" aria-hidden="true">
      <path d={d} stroke="#fff6c2" strokeWidth="9" strokeOpacity=".35" strokeLinecap="round" fill="none" />
      <path d={d} stroke="#ffe36e" strokeWidth="3.6" strokeLinecap="round" fill="none" />
    </g>
  );
}

/** Rim tiles for a list of hexes with terrain and island flags. */
export const rimTiles = (hexes: { q: number; r: number; land: boolean; noSetup?: boolean }[]) =>
  hexes.map(h => ({ q: h.q, r: h.r, land: h.land, open: h.land && !h.noSetup }));
