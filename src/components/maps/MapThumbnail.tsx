import { hexCenter } from '../../../shared/board';
import type { DesignKind, DesignTile } from '../../../shared/maps';
import type { Board } from '../../../shared/types';
import { TERRAIN } from '../../art';
import { hexPoints } from '../../lib/geometry';

interface ThumbHex {
  x: number;
  y: number;
  terrain: DesignKind;
}

/** Tiles of a design (not yet drawn) at their board positions. */
export const designHexes = (tiles: DesignTile[]): ThumbHex[] =>
  tiles.map(t => ({ ...hexCenter(t.q, t.r), terrain: t.kind }));

/** A small flat preview of a map: each tile in its terrain color. Cheap enough for a grid of dozens. */
export default function MapThumbnail({ tiles, board, label }: { tiles?: DesignTile[]; board?: Board; label?: string }) {
  const hexes: ThumbHex[] = board ? board.hexes : designHexes(tiles ?? []);
  const xs = hexes.map(h => h.x);
  const ys = hexes.map(h => h.y);
  const pad = 62;
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  const width = Math.max(...xs) + pad - x;
  const height = Math.max(...ys) + pad - y;
  const seaMap = hexes.some(h => h.terrain === 'sea');
  return (
    <svg
      className="map-thumbnail"
      viewBox={`${x} ${y} ${width} ${height}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <rect x={x} y={y} width={width} height={height} fill={seaMap ? '#1c9fc5' : '#139fc2'} />
      {hexes.map((hex, i) => (
        <polygon
          key={i}
          points={hexPoints(hex.terrain === 'sea' ? 60 : 56)}
          transform={`translate(${hex.x} ${hex.y})`}
          fill={TERRAIN[hex.terrain].color}
          stroke={hex.terrain === 'sea' ? '#7fd0e3' : '#f3e6c3'}
          strokeOpacity={hex.terrain === 'sea' ? 0.35 : 1}
          strokeWidth={hex.terrain === 'sea' ? 2 : 6}
        />
      ))}
    </svg>
  );
}
