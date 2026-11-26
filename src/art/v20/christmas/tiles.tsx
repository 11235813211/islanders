// Winter versions of the base tiles: snowy pines with baubles, reindeer on the pasture, wind over
// the fields, lights strung over the hills, snow falling on the mountains, and a snowman in the
// desert. Each keeps its tile's own color, so terrain still reads at a glance.
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
      <path d="M0-24 12 0H7L14 8H-14L-7 0H-12Z" fill="#14563a" />
      <path d="M0-24V8H-14L-7 0H-12Z" fill="#1f7442" />
      <path d="M0-24l4.6 9.2q-2.4-1.3-4.6.7q-2.3-1.9-4.6-.7Z" fill={SNOW.light} />
      <path d="M-12 0H12q-3 2.6-6 .9q-3 2.3-6 .5q-3 2.1-6 .2q-3 1.9-6-1.6Z" fill={SNOW.light} />
      <path d="M-14 8H14q-3.5 2.6-7 .9q-3.5 2.4-7 .5q-3.5 2.2-7 .3q-3.5 1.8-7-1.7Z" fill={SNOW.shade} />
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

const PINES = [
  [-28, -12, 0.9],
  [-6, -27, 1.05],
  [22, -18, 0.94],
  [34, 9, 0.74],
  [-32, 23, 0.84],
  [17, 38, 0.78],
  [-6, 47, 0.63],
] as const;

function WinterForest() {
  return (
    <g>
      <path d="M-65 5Q-36-12-4 5T65-2V65H-65Z" fill="#5fa968" />
      <path d="M-65-60H65V0Q30-14 0 2T-65-8Z" fill={SNOW.shade} opacity=".55" />
      <path d="M-65 43Q-30 12 0 26T65 18V65H-65Z" fill={SNOW.light} />
      <path d="M-65 52Q-28 30 2 38T65 32V65H-65Z" fill={SNOW.shade} />
      {PINES.map(([x, y, s], i) => (
        <SnowyPine key={i} x={x} y={y} scale={s} dressed={i === 1 || i === 4} star={i === 1} />
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
      <Reindeer x={-22} y={-22} scale={0.95} scarf />
      <Reindeer x={24} y={-6} scale={0.85} flip rudolph />
      <Reindeer x={-18} y={30} scale={0.9} />
      <g fill={SNOW.light}>
        <circle cx="30" cy="30" r="1.4" />
        <circle cx="-40" cy="10" r="1.2" />
      </g>
    </g>
  );
}

const STALKS = [
  [-29, -13, -16],
  [22, -15, 14],
  [-30, 29, -18],
  [10, 40, 12],
] as const;

function WinterFields() {
  return (
    <g>
      <WheatGround />
      <path d="M-70-1Q-32-32 9-15T70-20V-60H-70Z" fill={SNOW.light} opacity=".35" />
      <path
        d="M-70 40Q-17 10 12 32T70 31M-70 47Q-17 17 12 39T70 38M-70 54Q-17 24 12 46T70 45"
        fill="none"
        stroke={SNOW.light}
        strokeWidth="1.4"
        strokeDasharray="6 5"
        opacity=".9"
      />
      <path d="M-70 24Q-18-8 13 14T70 15V20Q30 6 13 19T-70 29Z" fill={SNOW.light} opacity=".55" />
      {STALKS.map(([x, y, rotate], i) => (
        <g key={i}>
          <Wheat x={x} y={y} rotate={rotate} />
          <ellipse cx={x + rotate * 0.25} cy={y - 16} rx="2.4" ry="1.3" fill={SNOW.light} />
        </g>
      ))}
    </g>
  );
}

/** Wire posts at the two hilltops and the edges, with the wire sagging between them. */
const LIGHT_ANCHORS: [number, number][] = [
  [-72, -4],
  [-37, -27],
  [-5, -12],
  [16, -35],
  [72, 2],
];
/** Points along the wire: a sag of `sag` units below the straight line between each pair of posts. */
function swoop(anchors: [number, number][], sag: number, steps = 8): [number, number][] {
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

function WinterHills() {
  return (
    <g>
      <BrickHills />
      <path d="M-37-31-43.5-23Q-40-25.5-37-22Q-33-26.5-29-23.5Q-25.5-25.5-21.5-23.6Z" fill={SNOW.light} />
      <path d="M16-39 8.7-31Q12-33 15-29.6Q19-33.6 23.8-31Z" fill={SNOW.light} />
      <path d="M-67 36-30 12 1 27 33 9 64 33V38Q33 15 1 32-30 18-67 41Z" fill={SNOW.light} opacity=".75" />
      <path d="M-29 34l10-5 9 5-10 3Zm51-41 10-4 7 4-9 3Z" fill={SNOW.light} />
      <LightString points={swoop(LIGHT_ANCHORS, 9)} />
    </g>
  );
}

function WinterMountains() {
  return (
    <g>
      <path d="M-70 30-32-27-5 14 18-39 71 33V70H-70Z" fill="#5f7a86" />
      <path d="m-32-27 4 49L-5 14Zm50-12 4 62 49 10Z" fill="#7c929c" />
      <path d="M-32-27-46-6Q-40-9-37-4.5Q-33-10-28.6-4Q-24-9-19-6Z" fill={SNOW.light} />
      <path d="M18-39 6-11Q12-15 16-9Q21-15 26-10Q31-15 38.6-11Z" fill={SNOW.light} />
      <path d="M-32-27-28 1-19-6Zm50-12 2 25 18.6 3Z" fill={SNOW.blue} opacity=".8" />
      <path d="M-67 53-22 2 6 34 30 6 67 53V70H-67Z" fill="#a3b4b8" />
      <path d="m-22 2 4 51H6Zm52 4 2 47h35Z" fill="#82989a" />
      <path d="M-22 2-30.8 12Q-26 10-23 13.5Q-19 9.5-13.2 12Z" fill={SNOW.light} />
      <path d="M30 6 22.3 15Q26 13 29 16.4Q33 12 37 15Z" fill={SNOW.light} />
      <path d="M-67 53Q-40 40-22 46T6 44 34 46 67 53V70H-67Z" fill={SNOW.light} />
      <path d="M-67 60Q-30 50 0 55T67 58V70H-67Z" fill={SNOW.shade} />
    </g>
  );
}

/** A snowman with a scarf and a carrot nose, standing at (x, y). */
function Snowman({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cy="9" rx="10" ry="2.6" fill="#7c8f9e" opacity=".22" />
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

function WinterDesert() {
  return (
    <g>
      <path d="M-70 0Q-25-38 5-9T70-13V65H-70Z" fill="#ead6ac" />
      <path d="M-70 28Q-22-18 14 14T70 11V65H-70Z" fill={SNOW.light} />
      <path d="M-70 50Q-25 11 8 38T70 29V65H-70Z" fill={SNOW.shade} />
      <path d="M-44-8q21-13 41-7M12 32q18-6 36-1" fill="none" stroke="#fff" strokeWidth="1.5" />
      <Snowman x={-22} y={-14} />
      <path d="m27 26 5-8 6 9Zm-51 13 4-6 8 6Z" fill="#c9b18a" />
    </g>
  );
}

const SCENES: Record<BaseTerrain, () => ReactElement> = {
  wood: WinterForest,
  sheep: WinterPasture,
  wheat: WinterFields,
  brick: WinterHills,
  ore: WinterMountains,
  desert: WinterDesert,
};

/** A base tile in winter, centered at the origin, with its animation. `seed` varies the motion. */
export function WinterTile({ uid, terrain, seed = 0 }: { uid: string; terrain: BaseTerrain; seed?: number }) {
  const Scene = SCENES[terrain];
  return (
    <TileFrame uid={uid} terrain={terrain}>
      <Scene />
      {terrain === 'ore' && <Snowfall snow={CHRISTMAS.mountainSnow} seed={seed} />}
      {terrain === 'wheat' && <Wind seed={seed} />}
      {terrain !== 'ore' && terrain !== 'wheat' && (
        <Snowfall snow={CHRISTMAS.lightSnow} seed={seed + 50 * spread(seed, 1)} />
      )}
    </TileFrame>
  );
}
