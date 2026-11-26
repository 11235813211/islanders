// Animated snow, wind, and twinkling lights for the Christmas tiles. Motion is CSS (christmas.css),
// so the board does not re-render; each element gets its own timing from a fixed pseudo-random
// spread, so every tile looks the same on every screen. Reduced motion stops it all.
import type { CSSProperties } from 'react';
import { CHRISTMAS } from './tuning';

/** A repeatable number in [0, 1) for element `i` and stream `salt`. */
export function spread(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
const between = ([lo, hi]: readonly [number, number], t: number) => lo + (hi - lo) * t;
const vars = (values: Record<string, string | number>) =>
  Object.fromEntries(
    Object.entries(values).map(([k, v]) => [`--${k}`, typeof v === 'number' ? `${v}s` : v]),
  ) as CSSProperties;

type Snow = { flakes: number; fall: number; drift: number; size: readonly [number, number]; color: string };

/** Flakes falling through the tile from top to bottom, each on its own loop. `seed` varies tiles. */
export function Snowfall({ snow, seed = 0 }: { snow: Snow; seed?: number }) {
  return (
    <g className="xmas-snow" aria-hidden="true">
      {Array.from({ length: snow.flakes }, (_, i) => {
        const x = -58 + 116 * spread(i, seed + 1);
        const duration = snow.fall * (0.75 + 0.5 * spread(i, seed + 2));
        const style = {
          ...vars({ fall: duration, delay: -duration * spread(i, seed + 3) }),
          '--drift': `${(spread(i, seed + 4) - 0.5) * 2 * snow.drift}px`,
          // Where the flake rests when motion is reduced.
          '--rest': `${10 + 110 * spread(i, seed + 15)}px`,
        } as CSSProperties;
        return (
          <circle
            key={i}
            className="xmas-flake"
            cx={x}
            cy={-62}
            r={between(snow.size, spread(i, seed + 5))}
            fill={snow.color}
            style={style}
          />
        );
      })}
    </g>
  );
}

/** Wind over a field: soft streaks sweeping across, and flakes blown sideways. */
export function Wind({ seed = 0 }: { seed?: number }) {
  const wind = CHRISTMAS.fieldWind;
  return (
    <g className="xmas-wind" aria-hidden="true">
      {Array.from({ length: wind.gusts }, (_, i) => {
        const y = -34 + 62 * ((i + 0.5) / wind.gusts) + 8 * (spread(i, seed + 6) - 0.5);
        const duration = wind.gust * (0.8 + 0.4 * spread(i, seed + 7));
        return (
          <path
            key={`g${i}`}
            className="xmas-gust"
            d={`M-80 ${y}q20 -7 40 0t40 0 40 0q10 -4 16 -12`}
            style={vars({ gust: duration, delay: -duration * spread(i, seed + 8) })}
          />
        );
      })}
      {Array.from({ length: wind.flakes }, (_, i) => {
        const y = -50 + 100 * spread(i, seed + 9);
        const duration = wind.blow * (0.7 + 0.6 * spread(i, seed + 10));
        return (
          <circle
            key={`f${i}`}
            className="xmas-blown"
            cx={-70}
            cy={y}
            r={between(wind.size, spread(i, seed + 11))}
            style={vars({ blow: duration, delay: -duration * spread(i, seed + 12) })}
          />
        );
      })}
    </g>
  );
}

/** A string of bulbs hanging along `path` points (a swooping wire), twinkling slowly out of step. */
export function LightString({ points, seed = 0 }: { points: [number, number][]; seed?: number }) {
  const lights = CHRISTMAS.hillLights;
  const d = `M${points.map(p => p.join(' ')).join('L')}`;
  // Bulbs evenly along the polyline.
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  const at = (t: number): [number, number] => {
    let left = t * total;
    for (let i = 0; i < lengths.length; i++) {
      if (left <= lengths[i]! || i === lengths.length - 1) {
        const k = Math.min(1, left / lengths[i]!);
        const [a, b] = [points[i]!, points[i + 1]!];
        return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      }
      left -= lengths[i]!;
    }
    return points.at(-1)!;
  };
  return (
    <g className="xmas-lights" aria-hidden="true">
      <path d={d} fill="none" stroke={lights.wire} strokeWidth="1" strokeLinejoin="round" opacity=".85" />
      {Array.from({ length: lights.bulbs }, (_, i) => {
        const [x, y] = at((i + 0.5) / lights.bulbs);
        const color = lights.colors[i % lights.colors.length]!;
        const duration = lights.twinkle * (0.8 + 0.5 * spread(i, seed + 13));
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <rect x="-1.2" y="-0.6" width="2.4" height="2" rx=".4" fill={lights.wire} />
            <g
              className="xmas-bulb"
              style={
                {
                  ...vars({ twinkle: duration, delay: -duration * spread(i, seed + 14) }),
                  '--dim': lights.dimmest,
                } as CSSProperties
              }
            >
              <circle cy="3.6" r="7.5" fill={color} opacity=".22" />
              <circle cy="3.6" r="4.6" fill={color} opacity=".45" />
              <ellipse cy="3.4" rx="2.7" ry="3.5" fill={color} />
              <ellipse cy="3.6" rx="1.3" ry="1.9" fill="#fffbe6" opacity=".85" />
            </g>
          </g>
        );
      })}
    </g>
  );
}
