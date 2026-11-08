// Warm olive foliage and radial palm fronds keep the rainforest distinct from the pine forest.

/** The canopy stays dark between leaves, with yellow-green light on the upper surfaces. */
export const JUNGLE = {
  floor: '#34422a',
  shadow: '#192f28',
  deep: '#284b30',
  canopy: '#536d31',
  mid: '#71883b',
  light: '#97a54a',
  glint: '#c1bd64',
  frond: '#3d6537',
  trunk: '#9b8050',
  trunkLight: '#c6a36a',
  earth: '#79663a',
};

// Narrow, feathered fronds read as tropical palms even when the board is zoomed out.
const FROND = 'M0 0C-1-5 0-11 3-16L2-12 5-16 4-11 7-14 6-9 9-12 8-7 11-9 10-4 13-5 12-1 15 1C9-3 4-3 0 0Z';
const FROND_SPINE = 'M0 0Q3-9 3-15M2-5 8-7M2-8 6-10M2-11 4-13';
const FRONDS: [number, number, number][] = [
  [-13, 0.94, 1.08],
  [39, 0.9, 1],
  [88, 1.04, 0.96],
  [142, 0.88, 0.92],
  [191, 1, 0.85],
  [240, 0.95, 1.02],
  [291, 1.04, 0.94],
];

/** Shared foliage drawings keep dense jungle tiles inexpensive to repeat across a board. */
export function JungleDefs({ uid }: { uid: string }) {
  return (
    <>
      <linearGradient id={`${uid}-jungle-leaf`} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor={JUNGLE.glint} />
        <stop offset=".35" stopColor={JUNGLE.mid} />
        <stop offset="1" stopColor={JUNGLE.frond} />
      </linearGradient>
      <radialGradient id={`${uid}-jungle-crown`} cx="36%" cy="28%" r="72%">
        <stop stopColor={JUNGLE.light} />
        <stop offset=".4" stopColor={JUNGLE.canopy} />
        <stop offset="1" stopColor={JUNGLE.deep} />
      </radialGradient>
      <g id={`${uid}-jungle-frond`}>
        <path d={FROND} fill={`url(#${uid}-jungle-leaf)`} stroke={JUNGLE.shadow} strokeWidth=".7" />
        <path d={FROND_SPINE} fill="none" stroke={JUNGLE.glint} strokeWidth=".55" strokeLinecap="round" />
      </g>
      <g id={`${uid}-jungle-palm`}>
        {FRONDS.map(([angle, x, y]) => (
          <use key={angle} href={`#${uid}-jungle-frond`} transform={`rotate(${angle}) scale(${x} ${y})`} />
        ))}
        <path d="m-1-1 1-3 2 2 2 1-3 2-2-1Z" fill={JUNGLE.glint} />
      </g>
      <g id={`${uid}-jungle-broadleaf`}>
        <path
          d="M-17 5-18 0-14-4-15-8-10-9-8-13-3-12 1-15 6-12 10-12 12-8 17-5 15 0 18 4 14 7 13 11 8 10 4 14 0 11-5 13-8 10-14 11-14 7Z"
          fill={JUNGLE.shadow}
          transform="translate(1 3)"
        />
        <path
          d="M-17 5-18 0-14-4-15-8-10-9-8-13-3-12 1-15 6-12 10-12 12-8 17-5 15 0 18 4 14 7 13 11 8 10 4 14 0 11-5 13-8 10-14 11-14 7Z"
          fill={`url(#${uid}-jungle-crown)`}
        />
        <path
          d="M-15 0-10-2-7 0-3-4 1-2 4-5 9-4 12-7M-12 7-8 4-3 7 2 3 8 6 13 2M-7-9-3-7 2-10 5-8"
          fill="none"
          stroke={JUNGLE.shadow}
          strokeWidth="1.1"
          opacity=".6"
        />
        <path
          d="m-13-5 3-2 2 1m2-4 3 1 2-2m5 2 3 2m-18 8 2-1 2 1m3-4 2 1 2-1m4 1 2 1 2-2m-19 8 3-1m3 3 2-2 3 1m4-2 3-1m0-8 2 1m-10 14 2-2"
          fill="none"
          stroke={JUNGLE.light}
          strokeWidth=".85"
          strokeLinecap="round"
        />
        <path
          d="m-10-6 2-1m3-4 2 1m5 0 1 1m-12 7 2-1m6-1 1-1m5 5 2-1m-15 7 2-1m4 2 1-1"
          fill="none"
          stroke={JUNGLE.glint}
          strokeWidth=".65"
          opacity=".7"
        />
      </g>
    </>
  );
}

// Uneven spacing leaves small glimpses of the forest floor between overlapping crowns.
const CANOPIES: [number, number, number, number][] = [
  [-8, -44, 1, -12],
  [-28, -28, 0.91, 26],
  [20, -33, 1.07, -27],
  [-4, -24, 0.94, 34],
  [-41, -6, 1.05, -16],
  [39, -9, 1.16, 22],
  [-19, -6, 0.85, 14],
  [10, -5, 1.07, -38],
  [-31, 16, 1.04, 31],
  [-7, 18, 1.08, -11],
  [24, 17, 1.04, 28],
  [38, 33, 0.92, -22],
  [-25, 36, 0.98, -31],
  [4, 40, 1.1, 13],
  [25, 47, 0.91, -15],
];

const PALMS: [number, number, number, number][] = [
  [-4, -46, 0.74, -14],
  [-24, -35, 0.82, 22],
  [20, -35, 0.87, -27],
  [-39, -22, 0.8, 10],
  [38, -18, 0.82, 25],
  [-43, 2, 0.82, -19],
  [43, 7, 0.83, -12],
  [-38, 25, 0.93, 34],
  [31, 31, 0.97, -17],
  [-18, 39, 0.86, 19],
  [3, 47, 0.85, -8],
  [-12, -24, 0.63, 13],
  [23, -9, 0.61, -29],
  [-18, 13, 0.62, -2],
  [11, 25, 0.72, 23],
];

function Palm({ uid, x, y, size, angle }: { uid: string; x: number; y: number; size: number; angle: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      <path d="M2 14Q-2 7 0 0" fill="none" stroke={JUNGLE.shadow} strokeWidth="3" />
      <path d="M1 13Q-2 7 0 0" fill="none" stroke={JUNGLE.trunk} strokeWidth="1.8" />
      <path d="M.6 12Q-2 7-.4 1" fill="none" stroke={JUNGLE.trunkLight} strokeWidth=".55" />
      <use href={`#${uid}-jungle-palm`} transform={`translate(2 3) rotate(${angle})`} opacity=".25" />
      <use href={`#${uid}-jungle-palm`} transform={`rotate(${angle})`} />
    </g>
  );
}

/** Dense palms and tangled broadleaf crowns distinguish this high-view rainforest from conifers. */
export function JungleTile({ uid }: { uid: string }) {
  return (
    <g>
      <polygon points="0,-60 52,-30 52,30 0,60 -52,30 -52,-30" fill={JUNGLE.floor} />
      <path
        d="M-53 33Q-24 31-17 8T12-30L24-48 16-11-5 15-6 41-26 52ZM42-20 39 16 18 42 21 22 31 7Z"
        fill={JUNGLE.earth}
        opacity=".75"
      />
      {CANOPIES.map(([x, y, size, angle], i) => (
        <use
          key={i}
          href={`#${uid}-jungle-broadleaf`}
          transform={`translate(${x} ${y}) rotate(${angle}) scale(${size})`}
        />
      ))}
      {/* Exposed forked trunks give depth to the canopy without creating a horizon. */}
      <g fill="none" strokeLinecap="round">
        <path
          d="M-26-12-27-25-32-30m5 5 7-7M25 16 23 3 17-2m6 5 7-6M-10 37-10 24-15 19m5 5 6-6"
          stroke={JUNGLE.shadow}
          strokeWidth="2.8"
        />
        <path
          d="M-27-12-28-25-33-30m5 5 7-7M24 16 22 3 16-2m6 5 7-6M-11 37-11 24-16 19m5 5 6-6"
          stroke={JUNGLE.trunk}
          strokeWidth="1.6"
        />
        <path d="M-27-12-28-25M24 16 22 3M-11 37V25" stroke={JUNGLE.trunkLight} strokeWidth=".6" />
        <path d="M-31-27q-6 9 0 15M28-5q6 8 1 14M-5 17q6 7 1 15" stroke={JUNGLE.mid} strokeWidth=".75" />
      </g>
      {PALMS.map(([x, y, size, angle], i) => (
        <Palm key={i} uid={uid} x={x} y={y} size={size} angle={angle} />
      ))}
      <g fill={JUNGLE.trunkLight} opacity=".8">
        <path d="m-34 14 1-3 1 3-1 2Zm47-43 1-3 1 3-1 2ZM31 41l1-3 1 3-1 1Z" />
      </g>
    </g>
  );
}
