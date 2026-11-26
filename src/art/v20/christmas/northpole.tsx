// The North Pole tile (Santa's home: striped pole, workshop, presents) and its number token, and
// Santa's sleigh for the flight to a building.
import type { CSSProperties } from 'react';
import { hexPoints } from '../../../lib/geometry';
import { Snowfall } from './effects';
import { Reindeer } from './tiles';
import { CHRISTMAS } from './tuning';

const POLE = CHRISTMAS.northPole;
const SNOW = CHRISTMAS.snow;

/** A wrapped present `w` wide, its bottom center at (x, y). */
function Present({ x, y, w, color, ribbon }: { x: number; y: number; w: number; color: string; ribbon: string }) {
  const h = w * 0.8;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-h} width={w} height={h} rx="1" fill={color} />
      <rect x={-w / 2} y={-h} width={w} height={h * 0.22} fill="#000" opacity=".12" />
      <path d={`M0 ${-h}V0M${-w / 2} ${-h * 0.55}H${w / 2}`} stroke={ribbon} strokeWidth={w * 0.16} />
      <path
        d={`M0 ${-h}q-4 -4 -4.5 -1.5T0 ${-h}q4 -4 4.5 -1.5T0 ${-h}`}
        fill="none"
        stroke={ribbon}
        strokeWidth="1.3"
      />
    </g>
  );
}

/** Santa's workshop: a red house with a snowy roof, warm windows, a wreath, and a smoking chimney. */
function Workshop({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cy="1" rx="19" ry="3.5" fill="#7d9cb0" opacity=".25" />
      <rect x="9" y="-26" width="5" height="10" fill="#8f2a22" />
      {[0, 1.5, 3].map(delay => (
        <circle
          key={delay}
          className="xmas-smoke"
          cx="11.5"
          cy="-29"
          r="2.6"
          fill="#f4f7fa"
          style={{ '--delay': `${-delay}s` } as CSSProperties}
        />
      ))}
      <rect x="-16" y="-15" width="32" height="15" fill={POLE.workshop} stroke="#6e1219" strokeWidth=".8" />
      <path d="M-19-14 0-29 19-14Z" fill="#7a1a20" />
      <path
        d="M-20.5-13.5 0-30.5 20.5-13.5Q15-11.5 12-14Q8-11 4-13.8Q0-11 -4-13.8Q-8-11-12-14Q-15-11.5-20.5-13.5Z"
        fill={POLE.roof}
      />
      <rect x="-12" y="-11" width="6" height="5" fill={POLE.light} stroke="#fff" strokeWidth=".7" />
      <rect x="6" y="-11" width="6" height="5" fill={POLE.light} stroke="#fff" strokeWidth=".7" />
      <path d="M-3.4 0V-7.5a3.4 3.4 0 0 1 6.8 0V0Z" fill="#1f5e35" />
      <circle cy="-20" r="3.2" fill="none" stroke="#1f7a3a" strokeWidth="1.8" />
      <circle cx="1.6" cy="-17.6" r=".8" fill="#e2333b" />
      <circle cy="-6" r="7" fill={POLE.light} opacity=".12" />
    </g>
  );
}

/** The North Pole tile, centered at the origin, drawn inside the tile clip of `uid`. */
export function NorthPoleTile({ uid }: { uid: string }) {
  return (
    <>
      <polygon points={hexPoints(59)} fill="#e8d9b3" stroke="#cfbe96" strokeWidth="1.5" />
      <g clipPath={`url(#${uid}-tile)`}>
        <polygon points={hexPoints(58)} fill={POLE.ice} />
        <path d="M-70-10Q-30-34 6-18T70-24V-70H-70Z" fill="#d7ecf5" />
        <path d="M-70 26Q-28-2 10 18T70 14V70H-70Z" fill={SNOW.light} />
        <path d="M-70 46Q-22 22 14 38T70 34V70H-70Z" fill={SNOW.shade} />
        <path d="M-44 0q14-6 26-2M18 26q14-5 28 0" fill="none" stroke="#fff" strokeWidth="1.6" />
        <Workshop x={20} y={-16} />
        {/* The pole: candy stripes, a gold ball, a snow mound at its foot. */}
        <ellipse cx="-30" cy="12" rx="9" ry="3" fill={SNOW.shade} />
        <rect x="-32.5" y="-30" width="5" height="42" rx="1.2" fill="#fff" />
        {[-28, -20, -12, -4, 4].map(top => (
          <path key={top} d={`M-32.5 ${top + 4}l5 -5v3.6l-5 5Z`} fill={POLE.pole} />
        ))}
        <circle cx="-30" cy="-32.5" r="4" fill="#ffd23f" stroke="#c4971b" strokeWidth=".8" />
        <circle cx="-31.3" cy="-33.8" r="1.2" fill="#fff" opacity=".7" />
        <Present x={-38} y={36} w={9} color="#2d8a4e" ribbon="#ffd23f" />
        <Present x={-27} y={38} w={7} color="#e2333b" ribbon="#fff" />
        <Present x={33} y={34} w={8} color="#4d7fd6" ribbon="#ff8adf" />
        <Reindeer x={36} y={10} scale={0.62} flip rudolph />
        <Snowfall snow={CHRISTMAS.lightSnow} seed={91} />
        <polygon points={hexPoints(56.5)} fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.2" />
      </g>
    </>
  );
}

/** A candy-striped ring and a Santa hat around the North Pole's number token (drawn at its origin). */
export function NorthPoleRing() {
  return (
    <g transform="translate(0 8)" aria-hidden="true">
      <circle r="21" fill="#fff" />
      <circle r="21" fill="none" stroke={POLE.pole} strokeWidth="3.4" strokeDasharray="4.4 4.4" />
      <g transform="translate(12 -17) rotate(28)">
        <path d="M-7 2Q-3-12 6-9Q4-4 7 2Z" fill="#e2333b" />
        <rect x="-8.5" y="0" width="17" height="4.4" rx="2.2" fill="#fff" />
        <circle cx="7.4" cy="-9.4" r="2.6" fill="#fff" />
      </g>
    </g>
  );
}

/** Santa in his sleigh behind two flying reindeer, facing right, about 100 units long. */
export function Sleigh() {
  const r = CHRISTMAS.reindeer;
  return (
    <g>
      <path d="M-14-6Q8-14 34-16M-14-6Q20-4 54-20" fill="none" stroke="#c9a227" strokeWidth="1.1" />
      <Reindeer x={34} y={-12} scale={0.78} />
      <Reindeer x={58} y={-22} scale={0.78} rudolph />
      {/* The sack of presents behind Santa. */}
      <path d="M-34-8Q-38-24-26-26Q-18-26-20-12Z" fill="#7a4a24" />
      <path d="M-28-26q2-5 6-2" stroke="#c9a227" strokeWidth="1.6" fill="none" />
      <rect x="-33" y="-24" width="6" height="5" fill="#2d8a4e" />
      <rect x="-27" y="-28" width="5" height="5" fill="#e2333b" />
      {/* Santa */}
      <circle cx="-12" cy="-18" r="7.5" fill="#d7263d" />
      <path d="M-18-16q6 4 12 0" stroke="#fff" strokeWidth="2.2" fill="none" />
      <circle cx="-10" cy="-27.5" r="4.2" fill="#f6c8a8" />
      <path d="M-14-26.5q4 8 8 0q0 6-4 7.4q-4-1.4-4-7.4Z" fill="#fff" />
      <path d="M-14.4-29q1-7 9-4.6l3 4Q-6-31.4-14.4-29Z" fill="#d7263d" />
      <circle cx="-2.2" cy="-29.4" r="1.6" fill="#fff" />
      <rect x="-15" y="-30.4" width="10" height="2.4" rx="1.2" fill="#fff" />
      <circle cx="-8.8" cy="-27.8" r=".6" fill="#2b1a12" />
      <path d="M-6-20q6-6 8-12" stroke="#d7263d" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="2.4" cy="-32.6" r="1.8" fill="#fff" />
      {/* The sleigh: a red body with gold trim on curled runners. */}
      <path d="M-30-14H4Q12-14 12-6Q12 2 2 2H-24Q-32 2-32-8Z" fill="#c1121f" />
      <path d="M-30-14H4Q12-14 12-6" fill="none" stroke="#ffd23f" strokeWidth="1.6" />
      <path d="M-22-6h20" stroke="#ffd23f" strokeWidth="1" opacity=".8" />
      <path
        d="M-28 6H10Q18 6 16-2M-20 2V6M2 2V6"
        fill="none"
        stroke="#c9a227"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M-28 6Q-34 6-33 1" fill="none" stroke="#c9a227" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="0" cy="14" rx="36" ry="3" fill={r.furDark} opacity=".12" />
    </g>
  );
}
