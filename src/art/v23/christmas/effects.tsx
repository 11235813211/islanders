// Snowflakes, wind, and lights for the Christmas tiles. Tiles are still; when one pays out on a
// roll it plays its motion for CHRISTMAS.motion.play seconds (inside a `.xmas-active` group: see
// WinterTile and christmas.css). Each element's timing comes from a fixed pseudo-random spread, so every tile
// looks the same on every screen. Reduced motion skips the motion.
import type { CSSProperties } from 'react';
import { CHRISTMAS } from './tuning';

/** A repeatable number in [0, 1) for element `i` and stream `salt`. */
export function spread(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
const between = ([lo, hi]: readonly [number, number], t: number) => lo + (hi - lo) * t;
const seconds = (values: Record<string, number>) =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [`--${k}`, `${v}s`])) as CSSProperties;

/**
 * Timing for one moving element: its period and delay, and how many times to repeat so it plays
 * for about CHRISTMAS.motion.play seconds. An `alternate` motion repeats an even number of times,
 * so it ends where it began.
 */
export function playFor(name: string, period: number, delay = 0, alternate = false): CSSProperties {
  const fit = Math.max(0, CHRISTMAS.motion.play - delay) / period;
  const runs = alternate ? 2 * Math.max(1, Math.round(fit / 2)) : Math.max(1, Math.round(fit));
  return { ...seconds({ [name]: period, delay }), '--runs': runs } as CSSProperties;
}

/** A six-armed snowflake with little branches and a glint, `size` across, centered at the origin. */
export function Snowflake({ size, rotate = 0 }: { size: number; rotate?: number }) {
  const r = size / 2;
  const arm = `M0 0V${-r}M0 ${-r * 0.55}l${-r * 0.28} ${-r * 0.26}M0 ${-r * 0.55}l${r * 0.28} ${-r * 0.26}`;
  return (
    <g transform={`rotate(${rotate})`}>
      <g stroke={CHRISTMAS.flakes.edge} strokeWidth={r * 0.36} strokeLinecap="round" fill="none" opacity=".55">
        {[0, 60, 120, 180, 240, 300].map(a => (
          <path key={a} d={arm} transform={`rotate(${a})`} />
        ))}
      </g>
      <g stroke={CHRISTMAS.flakes.color} strokeWidth={r * 0.2} strokeLinecap="round" fill="none">
        {[0, 60, 120, 180, 240, 300].map(a => (
          <path key={a} d={arm} transform={`rotate(${a})`} />
        ))}
      </g>
      <circle r={r * 0.2} fill="#fff" />
      {/* The glint: a small four-point star that makes the flake look shiny. */}
      <path
        d={`M${r * 0.45} ${-r * 0.75}l${r * 0.08} ${r * 0.22} ${r * 0.22} ${r * 0.08}-${r * 0.22} ${r * 0.08}-${r * 0.08} ${r * 0.22}-${r * 0.08}-${r * 0.22}-${r * 0.22}-${r * 0.08} ${r * 0.22}-${r * 0.08}Z`}
        fill={CHRISTMAS.flakes.glint}
      />
    </g>
  );
}

/** A few still snowflakes scattered over the tile, kept clear of the number token. */
export function StillFlakes({ count, seed }: { count: number; seed: number }) {
  const { size } = CHRISTMAS.flakes;
  const spots: [number, number][] = [];
  for (let i = 0; spots.length < count && i < count * 8; i++) {
    const x = -46 + 92 * spread(i, seed + 21);
    const y = -44 + 80 * spread(i, seed + 22);
    if (Math.hypot(x, y - 8) > 24) spots.push([x, y]);
  }
  return (
    <g aria-hidden="true">
      {spots.map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <Snowflake size={between(size, spread(i, seed + 23))} rotate={30 * spread(i, seed + 24)} />
        </g>
      ))}
    </g>
  );
}

/** Snowflakes that keep falling through the tile while it pays out. */
export function FallingFlakes({ seed }: { seed: number }) {
  const { fall, falling, size, drift } = CHRISTMAS.flakes;
  return (
    <g className="xmas-snow" aria-hidden="true">
      {Array.from({ length: falling }, (_, i) => {
        const style = {
          ...playFor('fall', fall * (0.8 + 0.4 * spread(i, seed + 2)), 0.9 * spread(i, seed + 3)),
          '--drift': `${(spread(i, seed + 4) - 0.5) * 2 * drift}px`,
        } as CSSProperties;
        return (
          <g key={i} transform={`translate(${-50 + 100 * spread(i, seed + 1)} -62)`}>
            <g className="xmas-flake" style={style}>
              <Snowflake size={between(size, spread(i, seed + 5))} rotate={60 * spread(i, seed + 6)} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

/** White streaks of wind across a field; they sweep across while the field pays out. */
export function Wind({ seed = 0 }: { seed?: number }) {
  const wind = CHRISTMAS.fieldWind;
  return (
    <g className="xmas-wind" aria-hidden="true">
      {Array.from({ length: wind.gusts }, (_, i) => {
        const y = -34 + 62 * ((i + 0.5) / wind.gusts) + 8 * (spread(i, seed + 6) - 0.5);
        return (
          <path
            key={i}
            className="xmas-gust"
            d={`M-80 ${y}q20 -7 40 0t40 0 40 0q10 -4 16 -12`}
            style={{
              ...playFor('gust', wind.gust * (0.85 + 0.3 * spread(i, seed + 7)), 0.35 * i),
              strokeDashoffset: -40 - 60 * spread(i, seed + 8),
            }}
          />
        );
      })}
    </g>
  );
}

/**
 * A string of lights tied to `posts`: the wire dips a little (`sag`) between them, and a bulb hangs
 * at each post, the high point of each dip. They twinkle while the hill pays out.
 */
export function LightString({ posts, sag, seed = 0 }: { posts: [number, number][]; sag: number; seed?: number }) {
  const lights = CHRISTMAS.hillLights;
  const d = posts
    .map(([x, y], i) => {
      if (!i) return `M${x} ${y}`;
      const [px, py] = posts[i - 1]!;
      return `Q${(px + x) / 2} ${(py + y) / 2 + sag * 2} ${x} ${y}`;
    })
    .join('');
  return (
    <g className="xmas-lights" aria-hidden="true">
      <path d={d} fill="none" stroke={lights.wire} strokeWidth="1" strokeLinejoin="round" opacity=".85" />
      {posts.map(([x, y], i) => {
        const color = lights.colors[i % lights.colors.length]!;
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <rect x="-1.2" y="-0.6" width="2.4" height="2" rx=".4" fill={lights.wire} />
            <g
              className="xmas-bulb"
              style={
                {
                  ...playFor('twinkle', lights.twinkle, 0.25 * spread(i, seed + 14), true),
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
