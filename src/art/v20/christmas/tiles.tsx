// Winter versions of the base tiles: snowy pines with baubles, reindeer on the pasture, wind and a
// snowman in the fields, lights strung around the hills, snow falling on the mountains (one hides
// the Grinch), and a frozen desert with a polar bear. Each keeps its tile's own color, so terrain still reads at a glance.
import type { ReactElement } from 'react';
import type { BaseTerrain } from '../../../../shared/types';
import { TileFrame } from '../index';
import { BrickHills, ForestGround, Wheat, WheatGround } from '../terrain-features';
import { LightString, Snowfall, spread, Wind } from './effects';
import { CHRISTMAS } from './tuning';

const SNOW = CHRISTMAS.snow;

/** A pine with snow on each tier; `dressed` adds baubles, and `star` a star on top. */
function SnowyPine({
  x,
  y,
  scale = 1,
  dressed = false,
  star = false,
}: {
  x: number;
  y: number;
  scale?: number;
  dressed?: boolean;
  star?: boolean;
}) {
  const { baubles } = CHRISTMAS.forest;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="1" cy="9" rx="11" ry="3" fill="#36506a" opacity=".2" />
      <path d="M0 1V11" stroke="#5e5040" strokeWidth="3" />
      {/* The board's own two-tier pine, with snow only where it would settle: the tip and the ledges. */}
      <path d="M0-24 12 0H7L14 8H-14L-7 0H-12Z" fill="#135a32" />
      <path d="M0-24V8H-14L-7 0H-12Z" fill="#237e3b" />
      <path d="M-2-17-8-4H-4" fill="none" stroke="#83a374" strokeWidth="1.2" opacity=".55" />
      <path d="M0-24l3.4 6.8q-1.7-.9-3.4.5q-1.7-1.4-3.4-.5Z" fill={SNOW.light} />
      <path d="M-12 0H-7l-1.6 1.8q-1.5-1.1-3.4-1.8Zm19 0H12q-1.9.7-3.4 1.8Z" fill={SNOW.light} />
      <path d="M-14 8h7q-2 1.6-3.6.6q-1.6 1-3.4-.6Zm21 0h7q-1.8 1.6-3.4.6q-1.6 1-3.6-.6Z" fill={SNOW.shade} />
      {dressed &&
        [
          [-4, -9],
          [5, -4],
          [-8, 4],
          [3, 4.5],
          [9, 6],
          [-2, -16],
        ].map(([bx, by], i) => (
          <circle
            key={i}
            cx={bx}
            cy={by}
            r="1.6"
            fill={baubles[i % baubles.length]}
            stroke="#fff"
            strokeOpacity=".5"
            strokeWidth=".5"
          />
        ))}
      {star && (
        <path
          d="M0-31.5l1.5 3.3 3.6.4-2.7 2.4.8 3.6L0-23.6l-3.2 1.8.8-3.6-2.7-2.4 3.6-.4Z"
          fill={CHRISTMAS.forest.star}
          stroke="#b98a12"
          strokeWidth=".6"
        />
      )}
    </g>
  );
}

/** Pines spaced so none overlaps another or the number token (each is ±14 wide and 35 tall at scale 1). */
const PINES = [
  [-24, -24, 0.84],
  [8, -31, 0.92],
  [35, -10, 0.78],
  [-38, 10, 0.78],
  [37, 25, 0.74],
  [-27, 40, 0.78],
  [10, 46, 0.68],
] as const;

/** A pile of snow `w` wide, its base centered at (x, y): a white mound with a blue-gray shadow. */
function Drift({ x, y, w }: { x: number; y: number; w: number }) {
  const h = w * 0.32;
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M${-w / 2} 0Q${-w / 4} ${-h * 1.1} 0 ${-h * 0.8}T${w / 2} 0Z`} fill={SNOW.light} />
      <path d={`M${-w / 2} 0Q0 ${-h * 0.35} ${w / 2} 0Q0 ${h * 0.25} ${-w / 2} 0Z`} fill={SNOW.shade} />
    </g>
  );
}

/** Forest snow in a few piles; the rest of the ground keeps its greens. */
const FOREST_DRIFTS = [
  [-14, -4, 18],
  [22, 12, 16],
  [-44, 30, 20],
  [28, 50, 22],
  [-8, 58, 18],
] as const;

function WinterForest() {
  return (
    <g>
      <ForestGround />
      {FOREST_DRIFTS.map(([x, y, w]) => (
        <Drift key={`${x},${y}`} x={x} y={y} w={w} />
      ))}
      {PINES.map(([x, y, s], i) => (
        <SnowyPine key={i} x={x} y={y} scale={s} dressed star={i === 1} />
      ))}
    </g>
  );
}

/** A cute reindeer facing right, about the size of the old sheep; `rudolph` lights the nose red. */
export function Reindeer({
  x,
  y,
  scale = 1,
  flip = false,
  rudolph = false,
  scarf = false,
}: {
  x: number;
  y: number;
  scale?: number;
  flip?: boolean;
  rudolph?: boolean;
  scarf?: boolean;
}) {
  const r = CHRISTMAS.reindeer;
  // Drawn chubby, with a big head and antlers, so it reads as a reindeer at tile size.
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
      <ellipse cy="9.4" rx="11" ry="2.4" fill="#4b6a7a" opacity=".22" />
      <path d="M-5 3V8.8M-1.5 4V9.2M3 4V9.2M6.5 3V8.8" stroke={r.furDark} strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="0" cy="0" rx="9" ry="5.9" fill={r.fur} />
      <ellipse cx="0.6" cy="2.7" rx="6" ry="2.6" fill={r.belly} />
      <ellipse cx="-9" cy="-2.6" rx="2.2" ry="1.6" fill={r.belly} />
      <path d="M3.5-2.5Q6-7.5 8.5-8.8L12.2-6Q9.6-4 9 .5Z" fill={r.fur} />
      {scarf && (
        <path
          d="M5.4-4.8Q8.6-2.4 11.6-6.4M8.4-4.1l-.9 4.6"
          stroke={r.scarf}
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
      )}
      <path
        d="M9.6-13.4Q8.4-18.6 5-20.8M8.9-16.8 5.8-16.4M7.3-19.4 7.5-22.4M12.8-13.8Q14.4-19.2 18-20.6M13.8-17.2 16.8-16.6M15.6-19.6 15.8-22.6"
        stroke={r.antler}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <ellipse cx="7.4" cy="-11.8" rx="2.5" ry="1.25" transform="rotate(-30 7.4 -11.8)" fill={r.furDark} />
      <ellipse cx="11.6" cy="-9.8" rx="5.2" ry="4.5" transform="rotate(10 11.6 -9.8)" fill={r.fur} />
      <ellipse cx="15.4" cy="-8.2" rx="2.7" ry="2.2" fill={r.belly} />
      {rudolph && <circle cx="17.7" cy="-8.6" r="3.3" fill={r.rudolph} opacity=".3" />}
      <circle cx="17.6" cy="-8.6" r="1.55" fill={rudolph ? r.rudolph : r.nose} />
      <circle cx="17.1" cy="-9.1" r=".45" fill="#fff" opacity=".8" />
      <circle cx="11.8" cy="-11.2" r="1.05" fill="#24160f" />
      <circle cx="12.2" cy="-11.6" r=".38" fill="#fff" />
      <circle cx="13.4" cy="-8.4" r="1.15" fill="#f08a8a" opacity=".55" />
    </g>
  );
}

function WinterPasture() {
  return (
    <g>
      <path d="M-70-5Q-28-41 2-14T70-10V65H-70Z" fill={SNOW.light} />
      <path d="M-70 24Q-24-12 14 11T70 7V65H-70Z" fill="#86bd4a" />
      <path d="M-70 24Q-24-12 14 11T70 7V12Q30 4 14 16T-70 30Z" fill={SNOW.shade} />
      <path d="M-70 51Q-17 10 21 35T70 32V65H-70Z" fill="#9fd055" />
      <path d="M-70 51Q-17 10 21 35T70 32V37Q30 28 20 40T-70 56Z" fill={SNOW.light} opacity=".85" />
      {/* Contours and tufts so the green reads as rolling meadow. */}
      <path
        d="M-62 38Q-34 20-6 28M14 22q20-6 44-4M-58 46q20-10 40-8M-2 60q20-14 52-14"
        fill="none"
        stroke="#c3e27c"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M-44 33q8-4 16-3M30 50q10-3 20-2"
        fill="none"
        stroke="#6ba23a"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity=".7"
      />
      <path
        d="m-50 41-1.5-3.5m1.5 3.5 2-3m40 22-1.6-3.6m1.6 3.6 2.2-3m30-30-1.3-3m1.3 3 1.8-2.6"
        stroke="#5f9a35"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M-46-14q12-6 22-3M14-30q10-3 20 0"
        fill="none"
        stroke={SNOW.shade}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <Reindeer x={-22} y={-22} scale={0.95} scarf />
      <Reindeer x={24} y={-6} scale={0.85} flip rudolph />
      <Reindeer x={-18} y={30} scale={0.9} />
    </g>
  );
}

/** Stalks placed clear of the snowman and the number token. */
const STALKS = [
  [-29, -13, -16],
  [-6, -33, 6],
  [-32, 29, -18],
  [10, 41, 12],
  [38, 22, 10],
] as const;

/** Field snow in a few piles; the rest keeps its gold. */
const FIELD_DRIFTS = [
  [-46, -8, 18],
  [-12, 22, 16],
  [44, 38, 20],
  [-38, 48, 18],
] as const;

/** Fields with snow piled here and there, the gold still showing, and a snowman. */
function WinterFields() {
  const frost = CHRISTMAS.fields;
  return (
    <g>
      <WheatGround />
      {FIELD_DRIFTS.map(([x, y, w]) => (
        <Drift key={`${x},${y}`} x={x} y={y} w={w} />
      ))}
      {STALKS.map(([x, y, rotate], i) => (
        <g key={i}>
          <Wheat x={x} y={y} rotate={rotate} />
          <ellipse cx={x + rotate * 0.25} cy={y - 16} rx="2.2" ry="1.2" fill={frost.snow} />
        </g>
      ))}
      <Snowman x={30} y={-15} />
    </g>
  );
}

/**
 * Each hill's string of lights runs across its face, from one slope to the other, below the peak.
 * The posts are where the bulbs hang (the high points of the wire).
 */
function acrossHill(left: [number, number], right: [number, number], posts: number): [number, number][] {
  return Array.from({ length: posts }, (_, i) => {
    const t = i / (posts - 1);
    // A slight downward bow, like a garland across a skirt.
    return [left[0] + (right[0] - left[0]) * t, left[1] + (right[1] - left[1]) * t + 3 * Math.sin(Math.PI * t)];
  });
}
const HILL_LIGHTS = [acrossHill([-49, -18], [-11, -18], 6), acrossHill([2, -25], [31, -25], 5)];

/** The points of a ridge, shifted down by `depth`: a band of snow lying on it, as thick as `depth`. */
function snowOn(ridge: [number, number][], depth: number): string {
  const under = [...ridge].reverse().map(([x, y], i) => [x, y + depth * (0.7 + 0.3 * Math.sin(i * 1.9))]);
  return `M${[...ridge, ...under].map(p => p.join(' ')).join('L')}Z`;
}

function WinterHills() {
  return (
    <g>
      <BrickHills />
      {/* Snow follows each surface: caps down both slopes of the peaks, a band along the lower ridge, and the tops of the bricks. */}
      <path d="M-37-31-43.5-23Q-40-25.5-37-22Q-33-26.5-29-23.5Q-25.5-25.5-21.5-23.6Z" fill={SNOW.light} />
      <path d="M16-39 8.7-31Q12-33 15-29.6Q19-33.6 23.8-31Z" fill={SNOW.light} />
      <path
        d={snowOn(
          [
            [-67, 36],
            [-30, 12],
            [1, 27],
            [33, 9],
            [64, 33],
          ],
          3.2,
        )}
        fill={SNOW.light}
      />
      <path d="M-29 34-19 29-10 34-19 38Z" fill={SNOW.light} />
      <path d="M-29 34-19 38-10 34V35.3L-19 39.4-29 35.3Z" fill={SNOW.shade} />
      <path d="M22-7 32-11 39-7 31-3Z" fill={SNOW.light} />
      <path d="M22-7 31-3 39-7V-5.8L31-1.8 22-5.8Z" fill={SNOW.shade} />
      {HILL_LIGHTS.map((posts, i) => (
        <LightString key={i} posts={posts} sag={CHRISTMAS.hillLights.sag} seed={i * 7} />
      ))}
    </g>
  );
}

/** The Grinch's head peeking over a ridge, at (x, y); his fingers are drawn on the ridge separately. */
function GrinchHead({ x, y }: { x: number; y: number }) {
  const g = CHRISTMAS.grinch;
  return (
    <g transform={`translate(${x} ${y}) rotate(14) scale(${g.size})`}>
      <path d="M-6.4-1Q-7-6-4-7.6L-3.6-10-1.6-7.8 0-10.6 1.6-7.8 3.8-9.6 4-7.2Q7-5.6 6.4-1Z" fill={g.furDark} />
      <ellipse rx="6.3" ry="6" fill={g.fur} />
      <path d="M-4.6-2.6-1.2-1.6M4.6-3 1.2-1.6" stroke={g.brow} strokeWidth="1.3" strokeLinecap="round" />
      <ellipse cx="-2.4" cy="-.4" rx="1.5" ry="1.05" fill={g.eye} />
      <ellipse cx="2.4" cy="-.4" rx="1.5" ry="1.05" fill={g.eye} />
      <circle cx="-2" cy="-.3" r=".55" fill={g.pupil} />
      <circle cx="2.8" cy="-.3" r=".55" fill={g.pupil} />
      <path d="M-4.2 2.4Q0 5.2 4.8 1.6" fill="none" stroke={g.brow} strokeWidth=".9" strokeLinecap="round" />
      {/* A Santa hat, slipping. */}
      <path d="M-5.6-5.2Q-2-12.6 5.4-11.6Q3.2-8.8 5-5.2Z" fill="#d7263d" />
      <rect x="-6.4" y="-6.4" width="12" height="2.6" rx="1.3" fill="#fff" />
      <circle cx="5.8" cy="-11.6" r="1.6" fill="#fff" />
    </g>
  );
}
/** Green fingers gripping the ridge at (x, y). */
function GrinchFingers({ x, y, rotate }: { x: number; y: number; rotate: number }) {
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${rotate}) scale(${CHRISTMAS.grinch.size})`}
      fill={CHRISTMAS.grinch.fur}
      stroke={CHRISTMAS.grinch.furDark}
      strokeWidth=".5"
    >
      <rect x="-2.6" y="-1.6" width="1.6" height="3.2" rx=".8" />
      <rect x="-.8" y="-1.9" width="1.6" height="3.6" rx=".8" />
      <rect x="1" y="-1.6" width="1.6" height="3.2" rx=".8" />
    </g>
  );
}

/** Mountains under heavy snow. `grinch` puts the Grinch behind the big peak's right shoulder. */
function WinterMountains({ grinch = false }: { grinch?: boolean }) {
  // The big back peak's right slope runs from (18, -39) down to (71, 33).
  const ridge = (x: number) => -39 + ((x - 18) * 72) / 53;
  return (
    <g>
      {grinch && <GrinchHead x={31} y={-21.5} />}
      <path d="M-70 30-32-27-5 14 18-39 71 33V70H-70Z" fill="#5f7a86" />
      <path d="m-32-27 4 49L-5 14Zm50-12 4 62 49 10Z" fill="#7c929c" />
      <path d="M-32-27-46-6Q-40-9-37-4.5Q-33-10-28.6-4Q-24-9-19-6Z" fill={SNOW.light} />
      <path d="M18-39 6-11Q12-15 16-9Q21-15 26-10Q31-15 38.6-11Z" fill={SNOW.light} />
      <path d="M-32-27-28 1-19-6Zm50-12 2 25 18.6 3Z" fill={SNOW.blue} opacity=".8" />
      <path d="M-67 53-22 2 6 34 30 6 67 53V70H-67Z" fill="#a3b4b8" />
      <path d="m-22 2 4 51H6Zm52 4 2 47h35Z" fill="#82989a" />
      <path d="M-22 2-30.8 12Q-26 10-23 13.5Q-19 9.5-13.2 12Z" fill={SNOW.light} />
      <path d="M30 6 22.3 15Q26 13 29 16.4Q33 12 37 15Z" fill={SNOW.light} />
      {grinch && (
        <>
          <GrinchFingers x={27.4} y={ridge(27.4) + 0.3} rotate={54} />
          <GrinchFingers x={35.4} y={ridge(35.4) + 0.3} rotate={54} />
        </>
      )}
      <path d="M-67 53Q-40 40-22 46T6 44 34 46 67 53V70H-67Z" fill={SNOW.light} />
      <path d="M-67 60Q-30 50 0 55T67 58V70H-67Z" fill={SNOW.shade} />
    </g>
  );
}

/** A snowball of radius `r` at (0, cy), shaded so it reads as round: lit from the upper left. */
function Snowball({ cy, r }: { cy: number; r: number }) {
  return (
    <g transform={`translate(0 ${cy})`}>
      <circle r={r} fill={SNOW.blue} />
      <circle cx={-r * 0.12} cy={-r * 0.12} r={r * 0.9} fill={SNOW.shade} />
      <circle cx={-r * 0.22} cy={-r * 0.22} r={r * 0.72} fill={SNOW.light} />
      <ellipse
        cx={-r * 0.42}
        cy={-r * 0.45}
        rx={r * 0.22}
        ry={r * 0.14}
        fill="#fff"
        transform={`rotate(-35 ${-r * 0.42} ${-r * 0.45})`}
      />
    </g>
  );
}

/** A round, shaded snowman with a top hat, coal buttons, a scarf, and a carrot nose, standing at (x, y). */
function Snowman({ x, y }: { x: number; y: number }) {
  const scarf = CHRISTMAS.reindeer.scarf;
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="1.5" cy="9.2" rx="11" ry="2.6" fill="#7a6a35" opacity=".25" />
      <path
        d="M-6-3-13-9m.8-.1-1.8-1.6m1.8 1.6.2-2.3M6-3l7-6m-.8-.1 1.9-1.4m-1.9 1.4-.3-2.3"
        stroke="#6b4a2e"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <Snowball cy={2} r={8} />
      <Snowball cy={-9.4} r={5.6} />
      <path d="M-5.4-5.4Q0-2.6 5.4-5.4L5.6-3.6Q0-1-5.6-3.6Z" fill={scarf} />
      <path d="M2.4-4 3.6 2.4 6 1.8 4.6-4Z" fill={scarf} />
      <path d="M.2-9.6 6-8.4.2-7.6Z" fill="#f08a24" />
      <circle cx="-2.1" cy="-11.4" r=".75" fill="#222" />
      <circle cx="2" cy="-11.4" r=".75" fill="#222" />
      {[0, 3.4, 6.6].map(by => (
        <circle key={by} cx="-.4" cy={-2 + by} r=".9" fill="#222" />
      ))}
      {/* A top hat set on the head: its brim rests on the crown of the head, with a red band and holly. */}
      <g transform="rotate(-6 0 -14.6)">
        <ellipse cy="-14.4" rx="6.6" ry="1.5" fill="#24242c" />
        <path d="M-4.2-14.6V-22.4Q0-23.4 4.2-22.4V-14.6Q0-13.6-4.2-14.6Z" fill="#2f2f39" />
        <path d="M-4.2-16.6Q0-15.6 4.2-16.6V-15.2Q0-14.2-4.2-15.2Z" fill={scarf} />
        <ellipse cy="-22.4" rx="4.2" ry=".9" fill="#3c3c48" />
        <circle cx="2.6" cy="-16.2" r=".7" fill="#e8323c" />
        <path d="M3-16.4l1.6-.9m-1.6.9 1.2.7" stroke="#1f7a3a" strokeWidth=".9" strokeLinecap="round" />
      </g>
    </g>
  );
}

/** A round little polar bear facing right, standing at (x, y). */
function PolarBear({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const b = CHRISTMAS.polarBear;
  const line = { stroke: b.line, strokeWidth: 0.7 };
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cy="9.4" rx="13" ry="2.6" fill="#5d86a3" opacity=".2" />
      {[-8, -3.4, 3.6, 8].map(lx => (
        <ellipse key={lx} cx={lx} cy="6.4" rx="2.4" ry="3" fill={b.shade} {...line} />
      ))}
      <circle cx="-11.6" cy="-2.6" r="1.7" fill={b.fur} {...line} />
      <ellipse cx="-1" cy="0" rx="11" ry="7" fill={b.fur} {...line} />
      <path d="M-9 3Q-1 7 7 3" fill="none" stroke={b.shade} strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="6.8" cy="-9.8" r="1.8" fill={b.fur} {...line} />
      <circle cx="12.6" cy="-10.2" r="1.8" fill={b.fur} {...line} />
      <circle cx="6.8" cy="-9.8" r=".8" fill={b.ear} />
      <circle cx="12.6" cy="-10.2" r=".8" fill={b.ear} />
      <circle cx="10" cy="-5" r="5.6" fill={b.fur} {...line} />
      <ellipse cx="14.2" cy="-3.6" rx="2.8" ry="2.1" fill="#fff" {...line} />
      <ellipse cx="16.4" cy="-4.2" rx="1.1" ry=".8" fill="#222" />
      <circle cx="10.8" cy="-6.4" r=".8" fill="#222" />
      <circle cx="11.1" cy="-6.7" r=".28" fill="#fff" />
      <circle cx="12" cy="-3.4" r="1.05" fill="#f3a3a3" opacity=".55" />
      <path
        d="M5.2-1.6Q8.6.8 12.6-1.4M8.6-.4 7.8 4"
        stroke={b.scarf}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

/** The desert frozen through: ice, snowfields, a frozen pond with cracks, and a polar bear. */
function WinterDesert() {
  const ice = CHRISTMAS.frozen;
  return (
    <g>
      <polygon points="-70,-70 70,-70 70,70 -70,70" fill={ice.ground} />
      <path d="M-70 0Q-25-38 5-9T70-13V65H-70Z" fill={ice.drift} />
      <path d="M-70 28Q-22-18 14 14T70 11V65H-70Z" fill={SNOW.light} />
      <path d="M-70 50Q-25 11 8 38T70 29V65H-70Z" fill={SNOW.shade} />
      <ellipse cx="24" cy="30" rx="22" ry="8" fill={ice.pond} />
      <ellipse cx="24" cy="29" rx="18" ry="5.6" fill={ice.pondLight} />
      <path d="M12 29l6 2 3-3 6 3m2-4 5 2" fill="none" stroke="#fff" strokeWidth=".9" strokeLinecap="round" />
      <path d="M30 26q4-1.6 7 0" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity=".8" />
      <path d="M-46-30l3-8 3 8Zm6 1 2-5 2 5ZM42-36l2.6-7 2.6 7Z" fill={ice.shard} stroke="#fff" strokeWidth=".6" />
      <path d="M-44-8q21-13 41-7M10 46q18-6 36-1" fill="none" stroke="#fff" strokeWidth="1.5" />
      <PolarBear x={-20} y={-14} scale={1.1} />
    </g>
  );
}

const SCENES: Record<BaseTerrain, (props: { grinch?: boolean }) => ReactElement> = {
  wood: WinterForest,
  sheep: WinterPasture,
  wheat: WinterFields,
  brick: WinterHills,
  ore: WinterMountains,
  desert: WinterDesert,
};

/** A base tile in winter, centered at the origin, with its animation. `seed` varies the motion. */
export function WinterTile({
  uid,
  terrain,
  seed = 0,
  grinch = false,
}: {
  uid: string;
  terrain: BaseTerrain;
  seed?: number;
  /** The one mountain on the board the Grinch hides behind. */
  grinch?: boolean;
}) {
  const Scene = SCENES[terrain];
  return (
    <TileFrame uid={uid} terrain={terrain}>
      <Scene grinch={grinch} />
      {terrain === 'ore' && <Snowfall snow={CHRISTMAS.mountainSnow} seed={seed} />}
      {terrain === 'wheat' && <Wind seed={seed} />}
      {terrain !== 'ore' && terrain !== 'wheat' && (
        <Snowfall snow={CHRISTMAS.lightSnow} seed={seed + 50 * spread(seed, 1)} />
      )}
    </TileFrame>
  );
}
