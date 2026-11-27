// The page garland (src/components/christmas/garland.svg): its first swag's pieces, copied as-is, laid along a
// curve on a candy tile. The swag is 120 wide and hangs from (0, 10) to (120, 10) with its low point at SAG;
// pieces are [kind, x, y, rotate, scale].

type Piece = [string, number, number, number, number];

const SAG = 32.6;
const PIECES: Piece[] = [
  ['pine', 0.7, 10.3, 136.1, 1],
  ['pine', 0.7, 10.3, 259.5, 1],
  ['pine', 9.3, 13.2, 139.8, 1],
  ['pine', 9.3, 13.2, 252.2, 1],
  ['pine', 18.1, 15.8, -39.4, 1],
  ['pine', 18.1, 15.8, 235.3, 1],
  ['pine', 28.7, 18.2, -66.5, 1],
  ['pine', 28.7, 18.2, 64, 1],
  ['pine', 37.3, 19.7, 114.5, 1],
  ['pine', 37.3, 19.7, 229.6, 1],
  ['pine', 46.8, 20.7, 113, 1],
  ['pine', 46.8, 20.7, 65.9, 1],
  ['pine', 56.5, 21.3, 121.6, 1],
  ['pine', 56.5, 21.3, 218.9, 1],
  ['pine', 67.4, 21.1, 123.1, 1],
  ['pine', 67.4, 21.1, 238.7, 1],
  ['pine', 76.9, 20.4, -76.8, 1],
  ['pine', 76.9, 20.4, 39.9, 1],
  ['pine', 87.2, 19, -84.1, 1],
  ['pine', 87.2, 19, 38.3, 1],
  ['pine', 96.0, 17.2, -66.5, 1],
  ['pine', 96.0, 17.2, 209.1, 1],
  ['pine', 104.5, 15.1, -80.7, 1],
  ['pine', 104.5, 15.1, 45.2, 1],
  ['pine', 114.1, 12.1, -85, 1],
  ['pine', 114.1, 12.1, 222.4, 1],
  ['holly', 3.8, 12.2, -66.9, 1.1],
  ['holly2', 2.9, 12.1, 119.4, 1.1],
  ['holly', 7.3, 12.5, -22, 0.9],
  ['holly', 8.2, 12.5, 81.2, 0.8],
  ['holly', 13.5, 14.1, -87, 1],
  ['holly', 13.5, 13.4, 66.1, 0.9],
  ['holly2', 18.8, 16.2, -38, 0.9],
  ['holly2', 24.3, 18.4, 295.2, 1],
  ['holly', 25.4, 17.4, 95.9, 1.1],
  ['holly', 30.0, 18.3, 45.6, 1.1],
  ['holly2', 29.8, 18.4, -24.2, 1],
  ['holly', 35.6, 19.3, 91, 1],
  ['holly', 38.5, 19.2, -107.2, 1],
  ['holly2', 38.7, 19.1, 66.4, 1],
  ['holly', 47.0, 20.3, 124.2, 1],
  ['holly', 46.3, 21.5, 89.6, 1],
  ['holly', 51.6, 21.6, 107.9, 0.9],
  ['holly', 56.4, 21.3, 99.5, 1.1],
  ['holly2', 63.6, 21, -98.3, 0.9],
  ['holly', 68.6, 20.4, 110.6, 0.8],
  ['holly2', 70.4, 21, 129.2, 1.1],
  ['holly', 76.0, 21.1, 211.8, 0.8],
  ['holly2', 74.7, 21.2, -76.1, 1],
  ['holly2', 80.7, 20.8, 241.6, 1.1],
  ['holly2', 80.6, 20.5, 139.9, 1.1],
  ['holly', 86.8, 19.4, 99.6, 1],
  ['holly', 88.1, 19.5, -101.8, 1],
  ['holly', 95.2, 17.2, 20.2, 0.9],
  ['holly', 100.4, 16.9, 130.7, 0.9],
  ['holly', 106.5, 15.4, 25.2, 1],
  ['holly', 105.7, 14.1, -97.6, 0.9],
  ['holly', 110.9, 12.6, 236.7, 1],
  ['holly2', 109.6, 12.6, -63.6, 1.1],
  ['holly2', 116.1, 11.8, 228.3, 1.1],
  ['b', 45.5, 21.2, 0, 1.1],
  ['b', 50.5, 21, 0, 1.1],
  ['b', 48.0, 24.4, 0, 1.1],
  ['b', 51.7, 21.6, 0, 1],
  ['b', 56.3, 21.4, 0, 1],
  ['b', 54.0, 24.5, 0, 1],
  ['b', 87.7, 18.9, 0, 1],
  ['b', 92.3, 18.7, 0, 1],
  ['b', 90.0, 21.8, 0, 1],
  ['b', 90.3, 16.2, 0, 1],
  ['b', 93.6, 17.6, 0, 1],
  ['b', 98.4, 17.4, 0, 1],
  ['b', 99.9, 16.2, 0, 0.9],
  ['b', 104.1, 16.1, 0, 0.9],
  ['b', 102.0, 18.8, 0, 0.9],
  ['b', 102.3, 13.8, 0, 0.9],
];

/** The garland's shared pieces (pine, holly, berries), with ids unique to this tile. */
function GarlandDefs({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-leaf`} x1="0" y1="-1" x2="0" y2="1" gradientUnits="objectBoundingBox">
        <stop offset="0" stopColor="#8fd05a" />
        <stop offset=".5" stopColor="#4fa83a" />
        <stop offset="1" stopColor="#2c7a2a" />
      </linearGradient>
      <linearGradient id={`${uid}-leaf2`} x1="0" y1="-1" x2="0" y2="1" gradientUnits="objectBoundingBox">
        <stop offset="0" stopColor="#6cbf45" />
        <stop offset=".5" stopColor="#3a8f30" />
        <stop offset="1" stopColor="#215f22" />
      </linearGradient>
      <radialGradient id={`${uid}-berry`} cx=".35" cy=".35" r=".7">
        <stop offset="0" stopColor="#ff7a6e" />
        <stop offset=".45" stopColor="#e0262f" />
        <stop offset="1" stopColor="#9c1118" />
      </radialGradient>
      <g id={`${uid}-holly`}>
        <path
          d="M0 0Q3-1 4-4.6Q6.4-2.8 8-5.8Q9.6-2.8 12-4.6Q13-1.2 16 0Q13 1.2 12 4.6Q9.6 2.8 8 5.8Q6.4 2.8 4 4.6Q3 1 0 0Z"
          fill={`url(#${uid}-leaf)`}
          stroke="#23611f"
          strokeWidth=".5"
          strokeLinejoin="round"
        />
        <path d="M.6 0Q8-.6 15 0" fill="none" stroke="#c4eaa0" strokeWidth=".7" strokeLinecap="round" />
      </g>
      <g id={`${uid}-holly2`}>
        <path
          d="M0 0Q3-1 4-4.6Q6.4-2.8 8-5.8Q9.6-2.8 12-4.6Q13-1.2 16 0Q13 1.2 12 4.6Q9.6 2.8 8 5.8Q6.4 2.8 4 4.6Q3 1 0 0Z"
          fill={`url(#${uid}-leaf2)`}
          stroke="#1b4f1a"
          strokeWidth=".5"
          strokeLinejoin="round"
        />
        <path d="M.6 0Q8-.6 15 0" fill="none" stroke="#a9db86" strokeWidth=".7" strokeLinecap="round" />
      </g>
      <g id={`${uid}-pine`} fill="none" strokeLinecap="round">
        <path
          d="M0 0L11 0M3 0l3-3.4M3 0l3 3.4M6 0l3.2-3.4M6 0l3.2 3.4M8.6 0l2.6-2.6M8.6 0l2.6 2.6M1 0l2.4-3M1 0l2.4 3"
          stroke="#1d5a2c"
          strokeWidth="1"
        />
        <path d="M4 0l3-2.6M4.4 0l3 2.6M7.4 0l2.4-2.2" stroke="#4f8f52" strokeWidth=".6" />
      </g>
      <g id={`${uid}-b`}>
        <circle r="2.6" fill={`url(#${uid}-berry)`} />
        <circle cx="-.8" cy="-.9" r=".7" fill="#fff" opacity=".7" />
      </g>
    </defs>
  );
}

type Point = [number, number];
/** Leaf size on a tile, relative to the page garland. */
const SIZE = 0.45;

/** A smooth curve through `points` (Catmull-Rom), sampled densely so it can be walked by distance. */
function smoothCurve(points: Point[]) {
  const samples: { x: number; y: number; distance: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!,
      p1 = points[i]!,
      p2 = points[i + 1]!,
      p3 = points[Math.min(points.length - 1, i + 2)]!;
    for (let j = i ? 1 : 0; j <= 16; j++) {
      const t = j / 16,
        t2 = t * t,
        t3 = t2 * t;
      const blend = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      const x = blend(p0[0], p1[0], p2[0], p3[0]),
        y = blend(p0[1], p1[1], p2[1], p3[1]);
      const last = samples.at(-1);
      samples.push({ x, y, distance: last ? last.distance + Math.hypot(x - last.x, y - last.y) : 0 });
    }
  }
  return samples;
}

/**
 * Snow patches under and around the garland, so its greens stand out on a dark floor: where along
 * the rope (0–1), how far below it (some drift well away), and each patch's half width and height.
 */
const SNOW_PATCHES: [t: number, drop: number, rx: number, ry: number][] = [
  [0.03, 3, 7, 2.6],
  [0.13, -1, 5, 2],
  [0.22, 5, 8, 2.8],
  [0.3, 13, 5.5, 2],
  [0.41, 2, 6, 2.2],
  [0.5, -3, 4.5, 1.8],
  [0.57, 6, 9, 3],
  [0.66, 16, 6, 2.2],
  [0.74, 1, 5, 2],
  [0.84, 7, 7.5, 2.6],
  [0.93, -2, 5, 2],
  [0.97, 12, 4, 1.6],
];
const SNOW = { top: '#ffffff', under: '#d9e6ee' };

/** One continuous run of the UI garland lying on the ground, snaking through `points`; `snow` beds it in snow. */
export function GarlandRope({ uid, points, snow = false }: { uid: string; points: Point[]; snow?: boolean }) {
  const id = `${uid}-garland`;
  const curve = smoothCurve(points);
  const length = curve.at(-1)!.distance;
  /** Position and heading a share `t` of the way along the curve. */
  const at = (t: number) => {
    const d = t * length;
    const i = Math.max(
      1,
      curve.findIndex(p => p.distance >= d),
    );
    const a = curve[i - 1]!,
      b = curve[i]!;
    const k = (d - a.distance) / Math.max(0.001, b.distance - a.distance);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  // The swag's pattern repeats along the curve at the page garland's leaf size.
  const swags = Math.max(1, Math.round(length / (120 * SIZE)));
  const size = length / swags / 120;
  // Each piece keeps its offset from the swag's cord, turned to follow the new curve.
  const place = ([kind, x, y, rotate, scale]: Piece, i: number, swag: number) => {
    const u = x / 120;
    const offset = (y - (10 + 2 * u * (1 - u) * (SAG - 10))) * size;
    const p = at((swag + u) / swags);
    const px = p.x - Math.sin(p.angle) * offset,
      py = p.y + Math.cos(p.angle) * offset;
    const turn = rotate + (p.angle * 180) / Math.PI;
    return (
      <use
        key={`${swag}-${i}`}
        href={`#${id}-${kind}`}
        transform={`translate(${px} ${py}) rotate(${turn}) scale(${scale * size})`}
      />
    );
  };
  return (
    <g className="candy-garland" aria-hidden="true">
      <GarlandDefs uid={id} />
      {snow &&
        SNOW_PATCHES.map(([t, drop, rx, ry]) => {
          const p = at(t);
          return (
            <g key={t}>
              <ellipse cx={p.x} cy={p.y + drop + 0.8} rx={rx} ry={ry} fill={SNOW.under} />
              <ellipse cx={p.x - 0.4} cy={p.y + drop} rx={rx * 0.94} ry={ry * 0.85} fill={SNOW.top} />
            </g>
          );
        })}
      <polyline
        points={curve.map(p => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="#5b3a22"
        strokeWidth={1.2 * size}
      />
      {Array.from({ length: swags }, (_, swag) => PIECES.map((piece, i) => place(piece, i, swag)))}
    </g>
  );
}
