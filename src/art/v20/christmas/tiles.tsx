// Winter versions of the base tiles: snowy pines with baubles, reindeer on the pasture, wind and a
// snowman in the fields, lights strung around the hills, snow falling on the mountains (one hides
// the Grinch), and a frozen desert with a polar bear. Each keeps its tile's own color, so terrain still reads at a glance.
import type { ReactElement } from 'react';
import type { BaseTerrain } from '../../../../shared/types';
import { TileFrame } from '../index';
import { BrickHills, Wheat, WheatGround } from '../terrain-features';
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

function WinterForest() {
  return (
    <g>
      <path d="M-65 5Q-36-12-4 5T65-2V65H-65Z" fill="#5fa968" />
      <path d="M-65-60H65V0Q30-14 0 2T-65-8Z" fill={SNOW.shade} opacity=".55" />
      <path d="M-65 43Q-30 12 0 26T65 18V65H-65Z" fill={SNOW.light} />
      <path d="M-65 52Q-28 30 2 38T65 32V65H-65Z" fill={SNOW.shade} />
      {PINES.map(([x, y, s], i) => (
        <SnowyPine key={i} x={x} y={y} scale={s} dressed={i === 1 || i === 3} star={i === 1} />
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

/** Fields under a light frost: the gold stays, with warm snow in the furrows and a snowman. */
function WinterFields() {
  const frost = CHRISTMAS.fields;
  return (
    <g>
      <WheatGround />
      <path d="M-70-1Q-32-32 9-15T70-20V-60H-70Z" fill={frost.snow} opacity=".55" />
      <path d="M-70-1Q-32-32 9-15T70-20V-16Q30-26 9-11T-70 3Z" fill={frost.snow} opacity=".8" />
      <path
        d="M-70 40Q-17 10 12 32T70 31M-70 47Q-17 17 12 39T70 38M-70 54Q-17 24 12 46T70 45"
        fill="none"
        stroke={frost.furrow}
        strokeWidth="1.2"
      />
      <path d="M-70 24Q-18-8 13 14T70 15V18Q30 8 13 17T-70 27Z" fill={frost.snow} opacity=".85" />
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
 * The garland's posts: around each hill below its peak, like a skirt, dipping through the valley
 * between them. The wire sags a little between posts, and bulbs hang along it.
 */
const SKIRT: [number, number][] = [
  [-70, 14],
  [-58, 2],
  [-47, -10],
  [-37, -16],
  [-27, -11],
  [-16, -5],
  [-6, -3],
  [4, -14],
  [16, -23],
  [28, -15],
  [40, -4],
  [52, 6],
  [70, 18],
];
/** Points along the wire: a sag of `sag` units below the straight line between each pair of posts. */
function swoop(anchors: [number, number][], sag: number, steps = 6): [number, number][] {
  const points: [number, number][] = [anchors[0]!];
  for (let i = 1; i < anchors.length; i++) {
    const [a, b] = [anchors[i - 1]!, anchors[i]!];
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + sag * 4 * t * (1 - t)]);
    }
  }
  return points;
}

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
      <LightString points={swoop(SKIRT, 2.6)} />
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
      transform={`translate(${x} ${y}) rotate(${rotate})`}
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
      {grinch && <GrinchHead x={33} y={-21} />}
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
          <GrinchFingers x={25.5} y={ridge(25.5) + 0.5} rotate={54} />
          <GrinchFingers x={41} y={ridge(41) + 0.5} rotate={54} />
        </>
      )}
      <path d="M-67 53Q-40 40-22 46T6 44 34 46 67 53V70H-67Z" fill={SNOW.light} />
      <path d="M-67 60Q-30 50 0 55T67 58V70H-67Z" fill={SNOW.shade} />
    </g>
  );
}

/** A snowman with a scarf and a carrot nose, standing at (x, y). */
function Snowman({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cy="9" rx="10" ry="2.6" fill="#8f7a3e" opacity=".22" />
      <circle cy="2" r="8" fill={SNOW.light} stroke={SNOW.blue} strokeWidth=".8" />
      <circle cy="-9" r="5.6" fill={SNOW.light} stroke={SNOW.blue} strokeWidth=".8" />
      <path d="M-6-3-13-9m19 6 7-6" stroke="#6b4a2e" strokeWidth="1.2" strokeLinecap="round" />
      <path
        d="M-5-5.5Q0-3 5-5.5M3-5 4 0"
        stroke={CHRISTMAS.reindeer.scarf}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M0-9 5.5-8 0-7.6Z" fill="#f08a24" />
      <circle cx="-2" cy="-11" r=".8" fill="#222" />
      <circle cx="2" cy="-11" r=".8" fill="#222" />
      <circle cy="0" r=".9" fill="#222" />
      <circle cy="4" r=".9" fill="#222" />
      <path d="M-5-14H5l-1.4-6.4h-7.2Z" fill="#2b2b33" />
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
