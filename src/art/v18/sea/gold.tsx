// An alluvial gold gorge, viewed from above: water cuts between ochre shelves and mossy cliffs.

/** Warm stone and pale water keep the gorge distinct from the blue-grey ore mountains. */
export const GOLD = {
  grass: '#62963b',
  grassLight: '#8fbb4e',
  grassDark: '#457332',
  rockDark: '#514e3a',
  rockShade: '#766b48',
  rock: '#a18e5d',
  rockLight: '#c9b47b',
  ledge: '#e0ce96',
  edge: '#f0dfae',
  moss: '#608b3b',
  mossLight: '#a3bf59',
  mossDark: '#476d31',
  water: '#9ed5df',
  waterDeep: '#6baab8',
  foam: '#f0f8e8',
  gold: '#efc24c',
  glint: '#fff3ba',
};

/** Soft color shifts give the hand-drawn shelves depth without raster assets or filters. */
export function GoldDefs({ uid }: { uid: string }) {
  return (
    <>
      <linearGradient id={`${uid}-gold-ground`} x1="0" y1="0" x2=".7" y2="1">
        <stop stopColor={GOLD.grassLight} />
        <stop offset=".55" stopColor={GOLD.grass} />
        <stop offset="1" stopColor={GOLD.grassDark} />
      </linearGradient>
      <linearGradient id={`${uid}-gold-water`} x1="0" y1="0" x2=".6" y2="1">
        <stop stopColor="#d2e9e4" />
        <stop offset=".45" stopColor={GOLD.water} />
        <stop offset="1" stopColor="#b9e0e1" />
      </linearGradient>
      <linearGradient id={`${uid}-gold-cliff`} x1="0" y1="0" x2=".2" y2="1">
        <stop stopColor={GOLD.rockLight} />
        <stop offset=".4" stopColor={GOLD.rock} />
        <stop offset="1" stopColor={GOLD.rockShade} />
      </linearGradient>
    </>
  );
}

const BOULDERS: [number, number, number, number][] = [
  [-31, -29, 1.1, -12],
  [-21, -32, 0.75, 16],
  [-11, -40, 0.8, -8],
  [15, -34, 0.9, 12],
  [21, -35, 0.95, -16],
  [33, -26, 0.7, -22],
  [-39, -13, 0.85, 8],
  [-35, 6, 1, 18],
  [-38, 18, 1.1, -8],
  [-29, 28, 0.7, 8],
  [-12, 40, 0.9, -15],
  [0, 38, 0.65, 12],
  [32, 19, 1, -15],
  [35, 8, 0.8, 12],
  [24, -3, 0.65, -8],
  [14, -12, 0.65, 5],
  [3, 21, 0.8, -12],
  [16, 26, 0.75, 16],
  [25, 32, 0.7, -18],
  [-13, -17, 0.6, 4],
];

function Boulder({ x, y, scale, angle }: { x: number; y: number; scale: number; angle: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
      <path d="M-5 0-2-4 3-5 7-1 5 4-2 5-6 2Z" fill={GOLD.rockDark} />
      <path d="M-5 0-2-4 3-5 7-1 1 1Z" fill={GOLD.rockLight} />
      <path d="M-5 0 1 1-2 5-6 2Z" fill={GOLD.rock} />
      <path d="M1 1 7-1 5 4-2 5Z" fill={GOLD.rockShade} />
      <path d="M-4-.5 1 1 5-.4M1 1l-2 2.4" fill="none" stroke={GOLD.edge} strokeWidth=".65" />
      <path d="M-3 3-.2 2.7M2 3.5l2-1" stroke={GOLD.rockDark} strokeWidth=".55" />
    </g>
  );
}

function GoldSeams() {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 15 5-2 3 1 7-3m-11 6 5-1 3 1 6-3M-37-5l3 3 4-1 2 3" stroke={GOLD.rockDark} strokeWidth="1.7" />
      <path d="m12 15 5-2 3 1 7-3m-11 6 5-1 3 1 6-3M-37-5l3 3 4-1 2 3" stroke={GOLD.gold} strokeWidth=".8" />
      <path d="m-14 34 2-1m5-4 1.5-.4m22-10 1.7-.7m-2 7 2-1" stroke={GOLD.gold} strokeWidth="1.5" />
      {[
        [25, 12],
        [-34, -3],
        [-10, 33],
      ].map(([x, y], i) => (
        <path
          key={i}
          className="gold-sparkle"
          style={{ animationDelay: `${i * 0.7}s` }}
          transform={`translate(${x} ${y})`}
          d="M-1.9 0H1.9M0-2V2"
          stroke={GOLD.glint}
          strokeWidth=".65"
        />
      ))}
    </g>
  );
}

function Grass() {
  const tufts = [
    [-5, -51],
    [-20, -43],
    [-31, -32],
    [15, -44],
    [28, -34],
    [43, -24],
    [-45, -23],
    [-48, -8],
    [-47, 9],
    [-43, 26],
    [-30, 34],
    [-15, 43],
    [-4, 53],
    [8, 46],
    [22, 39],
    [35, 28],
    [46, 19],
    [47, 1],
    [45, -13],
  ];
  return (
    <g>
      <g fill={GOLD.grassDark} opacity=".45">
        <path d="M-57-26-43-35-29-36-34-29-44-23-42-10-48-3-56-7Z" />
        <path d="M9-51 22-44 33-35 48-32 51-21 42-27 34-28 25-36 16-38Z" />
        <path d="M-46 22-32 27-24 39-10 44 3 55-10 56-24 44-42 34Z" />
      </g>
      <g fill={GOLD.grassLight} opacity=".45">
        <path d="M-29-42-16-49-5-57 2-50-2-42-12-40-19-35Z" />
        <path d="M40-24 52-28 55-11 49 1 54 19 44 27 40 17 43 5 39-5Z" />
        <path d="M-9 45 6 41 18 43 26 34 34 33 23 46 3 58Z" />
      </g>
      {tufts.map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${(i % 3) * 12 - 12})`} fill="none" strokeLinecap="round">
          <path d="M-3 1 0 2 3 1" stroke={GOLD.grassDark} strokeWidth="1.2" />
          <path d="M0 2-2-2M0 2 1-3M1 2 4-1" stroke={GOLD.mossLight} strokeWidth=".65" />
        </g>
      ))}
    </g>
  );
}

/** A river and waterfall expose gold-bearing rock; the scene stays legible around a number token. */
export function GoldTile({ uid }: { uid: string }) {
  return (
    <g>
      <polygon points="0,-60 52,-30 52,30 0,60 -52,30 -52,-30" fill={`url(#${uid}-gold-ground)`} />
      <Grass />
      {/* Grass reaches the hex edges, with broken moss patches meeting the rock. */}
      <g fill={GOLD.mossLight}>
        <path d="M-44-16-40-25-29-30-23-40-15-38-7-47 3-45 9-39 20-42 26-35 36-31 37-23 27-19-4-16-24-7Z" />
        <path d="M-44 0-39 4-41 12-34 16-31 25-24 28-20 36-26 38-34 30-41 25-45 13Z" />
        <path d="M-10 34 2 32 15 29 30 23 35 30 24 38 14 40 5 48-4 43-12 44Z" />
      </g>
      <g fill={GOLD.moss}>
        <path d="M-35-27-27-30-22-36-14-34-7-41 1-39 9-34 21-36 28-29 20-24-14-17-31-12Z" />
        <path d="M-42 5-37 8-37 17-32 19-29 27-35 24-39 18Z" />
        <path d="m-5 37 10-4 8 1 10-5 5 5-14 4-8 6-6-4-7 2Z" />
      </g>
      {/* The rear wall is seen from above, with steep dark faces toward the river. */}
      <path
        d="M-42-16-34-28-24-26-20-34-9-31-1-38 9-31 18-35 25-29 35-29 41-20 33-9 19-5 1-13-12-12-20-1-31 1-40-5Z"
        fill={GOLD.rockDark}
      />
      <path
        d="M-42-16-34-28-24-26-20-34-9-31-1-38 9-31 18-35 25-29 35-29 41-20 31-19 23-23 15-21 6-24-5-24-13-20-24-20-30-13Z"
        fill={`url(#${uid}-gold-cliff)`}
      />
      <path
        d="M-34-27-30-18-24-20-26-13-18-16-20-29-15-24-13-20-9-31-6-23 0-22-1-35 4-28 8-27 9-31 13-23 19-24 18-33 23-27 25-20 30-22 35-27 32-17 27-14 19-11 12-14 4-15-4-18-10-15-17-13-21-5-28-4-31-11-38-9Z"
        fill={GOLD.rockShade}
      />
      <g fill="none" stroke={GOLD.ledge} strokeWidth=".8" strokeLinejoin="round">
        <path d="m-39-18 7-5 6 1m8-8 6 3 3-1m10-5 5 7 4-1m10-3 5 5 3-1m4 5 5-2" />
        <path d="m-36-12 4-2 3 2m5-5 6-1m10-4 6 1m12-1 6 1m9 0 5-2" opacity=".65" />
      </g>
      {/* Water winds across the scene, rather than sitting behind a mountain silhouette. */}
      <path
        d="M1-49 7-48 6-42 9-36 8-30 12-24 10-18 5-13-2-12-11-16-17-16-18-12-11-5-12 1-21 9-23 13-18 19-16 27-21 35-21 42-29 42-30 34-25 25-28 20-32 15-29 7-20 2-18-3-23-10-24-17-20-22-12-22-2-18 3-19 4-23 2-29 3-36 0-42Z"
        fill={GOLD.waterDeep}
      />
      <path
        d="M2-48 6-47 5-42 8-35 7-29 10-24 9-19 4-15-2-14-12-18-19-18-20-13-13-5-14 0-23 8-25 13-20 20-19 27-24 35-23 41-28 40-28 34-23 25-26 19-30 15-27 8-18 3-16-3-21-11-22-17-19-20-12-20-2-16 4-17 6-22 4-29 5-36 2-42Z"
        fill={`url(#${uid}-gold-water)`}
      />
      <g fill="none" stroke={GOLD.foam} strokeLinecap="round">
        <path d="m-18-17 2 3 6 4m-8 13-7 5-2 5m5 7 1 5-4 8m13-49 5 2 4-1" strokeWidth=".75" opacity=".7" />
        <path d="m-22 11-1 3 2 3m-1 12-3 6m-3-24 1 3" strokeWidth=".5" opacity=".65" />
      </g>
      {/* Slanted, overlapping shelves make the foreground a rock plateau, not a horizon. */}
      <path
        d="M-8-14 2-15 8-10 16-8 23-10 28-6 39-8 44-1 40 5 43 11 35 21 29 29 18 34 6 38-4 43-16 36-14 29-17 23-10 18-10 10-4 5-7-2-1-6Z"
        fill={GOLD.rockShade}
      />
      <path
        d="M-8-14 2-15 8-10 16-8 23-10 28-6 39-8 42-2 34 3 23 3 17 8 8 6 0 10-8 8-4 3-7-2-1-6Z"
        fill={GOLD.rockLight}
      />
      <path d="M-10 11 0 8 9 9 17 6 25 7 35 2 39 4 34 9 25 13 15 13 8 17-3 19-11 23-15 21Z" fill={GOLD.ledge} />
      <path d="M-13 25-3 21 8 19 18 15 28 15 35 11 35 17 26 24 16 25 8 29-1 29-11 34-16 31Z" fill={GOLD.rockLight} />
      <path d="M-11 36-1 31 9 32 17 28 25 28 23 32 13 35 5 39-3 42Z" fill={GOLD.ledge} />
      <g fill={GOLD.ledge}>
        <path d="m-5-12 7-1 5 4 9 3-9 2-7-4-4 1Z" />
        <path d="m17-5 6-2 6 3 8-2-4 4-10 2-8-1Z" />
        <path d="m-6 4 7-3 5 2 8-1-6 4-8 1Z" />
      </g>
      <g fill="none" stroke={GOLD.rockDark} strokeWidth=".8" strokeLinejoin="round" opacity=".85">
        <path d="m-7-10 5 3 8-1 6 4 9-1m-22 4 8 1 6-2 6 3 9-3 8-1" />
        <path d="m-5 13 6-2 6 1 7-3 7 1 12-5m-43 12 9-1 5 1 9-3m-25 12 9-3 8-1 9-4 8 1 7-3" />
        <path d="m-9 30 8-3 8 1 9-4 7-1m-28 12 9-3 7 1 10-4m-26-35 3 4-2 4m19-8-3 4 2 3m-5 5-3 5 2 2m-18 3 4 3-2 3" />
      </g>
      <g fill="none" stroke={GOLD.edge} strokeWidth=".7" strokeLinejoin="round">
        <path d="m-6 10 7-2 8 1 8-3 8 1 10-5m-47 24 9-5 11-2 10-4 10 0m-39 22 10-5 10 1 8-4" />
        <path d="m-3-11 5 2 5 1m14 4 6 1 5-2m-23 7 6-2m-13 14 5 1 6-3m-11 12 5-1 4-2" />
      </g>
      {/* The left bank has its own rock faces so the river is visibly incised. */}
      <path d="M-45-5-37-10-31-6-26-7-22-2-25 4-32 9-30 16-27 21-31 29-40 23-45 14-42 6Z" fill={GOLD.rockShade} />
      <path d="M-45-5-37-10-31-6-26-7-24-2-30 0-34 5-42 6-39-1Z" fill={GOLD.rockLight} />
      <path d="M-42 11-35 7-32 9-32 16-27 21-31 23-35 19-41 18Z" fill={GOLD.rockLight} />
      <path d="M-39 22-34 20-30 24-31 29-36 27Z" fill={GOLD.ledge} />
      <g fill="none" stroke={GOLD.edge} strokeWidth=".65">
        <path d="m-43-4 6-3 7 3m-12 18 6-3 3 2m-5 10 5-1 4 3" />
      </g>
      {BOULDERS.map(([x, y, scale, angle], i) => (
        <Boulder key={i} x={x} y={y} scale={scale} angle={angle} />
      ))}
      {/* The headwater falls over the top cliff, leaving the full cascade above the token. */}
      <path d="M3-39 7-38 7-32 9-28 10-24 8-19 4-16-2-17 2-20 4-25 3-30 4-34Z" fill={GOLD.foam} />
      <path
        d="M5-39 5-34 6-29 7-24 5-19 1-17M7-35 7-31 9-25 7-20"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <path d="m5-36 1 6 1 4-1 4m3-5-1 4-2 2" fill="none" stroke={GOLD.waterDeep} strokeWidth=".65" />
      <path
        d="M-3-17 1-16 5-17M-6-18l2 1m8-2 3-1"
        fill="none"
        stroke={GOLD.foam}
        strokeWidth=".9"
        strokeLinecap="round"
      />
      <g fill={GOLD.mossDark}>
        <path d="m-25-31 3-4 6 2 2 3-6 1ZM14-41l5-2 3 4-4 1ZM-41 4l4-2 4 4-4 1Z" />
        <path d="m-4 36 6-3 5 1-2 3-6 2Zm21-9 6-3 4 2-5 3Zm18-23 3-4 3 2-1 4Z" />
      </g>
      <g fill="none" stroke={GOLD.mossLight} strokeWidth=".8" strokeLinecap="round">
        <path d="m-27-33 3-1m7-3 3 1m-11 7 3-1m22-12 4 1m8 2 3 1m-50 40 3 2m1 6 2 1" />
        <path d="m-7 43 3-2m7-3 3-1m4 5 2-2m10-8 3-2m-7 1 3-1" />
      </g>
      <GoldSeams />
    </g>
  );
}
