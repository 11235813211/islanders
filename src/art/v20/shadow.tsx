// The island's soft drop shadow, drawn as a few widening layers instead of an SVG blur filter: a
// blur is recomputed on every repaint, which makes panning and zooming stutter on iPads and phones.
import { hexPoints } from '../../lib/geometry';

const COLOR = '#193e47';
/** Extra stroke width of each layer, widest (faintest edge) first; together they read as a blur. */
const SPREAD = [26, 16, 7];
/** Each layer's opacity; three stacked give about the old shadow's 0.3 at the center. */
const LAYER_OPACITY = 0.11;
const DROP = 7;

/** A soft shadow under hexes drawn with `strokeWidth`-wide rims, offset downward. */
export function IslandShadow({ hexes, strokeWidth }: { hexes: { x: number; y: number }[]; strokeWidth: number }) {
  const points = hexPoints(60);
  return (
    <g transform={`translate(0 ${DROP})`} aria-hidden="true">
      {SPREAD.map(extra => (
        // Group opacity, so overlapping hexes in one layer don't darken where they meet.
        <g key={extra} opacity={LAYER_OPACITY}>
          {hexes.map((hex, i) => (
            <polygon
              key={i}
              points={points}
              transform={`translate(${hex.x} ${hex.y})`}
              fill={COLOR}
              stroke={COLOR}
              strokeWidth={strokeWidth + extra}
              strokeLinejoin="round"
            />
          ))}
        </g>
      ))}
    </g>
  );
}
