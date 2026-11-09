// Flat tropical silhouettes match the forest's illustration style, with a denser canopy.

/** Warmer olive foliage and broad crowns distinguish the jungle from the pine forest. */
export const JUNGLE = {
  ground: '#648444',
  slope: '#476d36',
  near: '#385d32',
  shadow: '#24492d',
  canopy: '#35632f',
  leaf: '#658b38',
  palm: '#719641',
  trunk: '#8a7346',
  trunkLight: '#b29b64',
};

/** Reusable tree silhouettes keep a dense tile as light to draw as the standard forest. */
export function JungleDefs({ uid }: { uid: string }) {
  return (
    <>
      <g id={`${uid}-jungle-palm`}>
        <ellipse cx="1" cy="9" rx="10" ry="3" fill={JUNGLE.shadow} opacity=".2" />
        <path d="M-2 10Q2-4-3-20L.5-20Q6-5 2 10Z" fill={JUNGLE.trunk} />
        <path d="M-1 8Q2-5-2-18" fill="none" stroke={JUNGLE.trunkLight} strokeWidth="1.2" />
        <path
          d="M-2-20Q-17-28-23-9L-14-15-8-15-15-6Q-3-10-1-18 1-6 12-4L7-13 16-8 23-7Q17-23 2-21 11-26 19-24 8-34-2-23-11-36-20-27L-10-25Z"
          fill={JUNGLE.canopy}
        />
        <path
          d="M-2-20Q-16-27-23-9L-14-18-3-20ZM-2-20Q-11-34-20-27L-10-25ZM-1-20Q8-32 19-24L8-25ZM0-19Q17-23 23-7L14-17Z"
          fill={JUNGLE.palm}
        />
      </g>
      <g id={`${uid}-jungle-broadleaf`}>
        <ellipse cx="1" cy="9" rx="11" ry="3" fill={JUNGLE.shadow} opacity=".2" />
        <path d="M0 10V-9M0 2-7-6M0-2 7-9" fill="none" stroke={JUNGLE.trunk} strokeWidth="2.8" />
        <path
          d="M-17-9Q-21-18-13-21-13-29-4-28 1-34 7-27 17-28 17-20 25-13 17-7 13-1 6-5 0 0-6-4-14 0-17-9Z"
          fill={JUNGLE.canopy}
        />
        <path d="M-17-9Q-21-18-13-21-13-29-4-28 1-34 7-27 10-23 6-20 0-21-2-16-9-18-12-12Z" fill={JUNGLE.leaf} />
      </g>
      <g id={`${uid}-jungle-banana`}>
        <path d="M0 9V-14M0 3-7-6M0 1 8-6" fill="none" stroke={JUNGLE.trunk} strokeWidth="2" />
        <path
          d="M0-4Q-12-19-18-12-16-3-1 1ZM0-5Q-10-23-3-27 6-23 2-5ZM2-3Q8-22 17-17 21-8 2 1ZM-1 4Q-13-6-18 0-14 7-1 7ZM2 5Q11-6 18-1 15 7 2 8Z"
          fill={JUNGLE.canopy}
        />
        <path
          d="M0-4Q-12-19-18-12L-1 1ZM0-5Q-10-23-3-27L2-5ZM2-3Q8-22 17-17L2 1ZM-1 4Q-13-6-18 0L-1 7ZM2 5Q11-6 18-1L2 8Z"
          fill={JUNGLE.leaf}
        />
      </g>
    </>
  );
}

type TreeKind = 'palm' | 'broadleaf' | 'banana';
// Draw from back to front so crowns overlap trunks, as they do in the forest illustration.
const TREES: [TreeKind, number, number, number, boolean][] = [
  ['palm', -7, -34, 0.76, false],
  ['broadleaf', 16, -24, 0.74, true],
  ['broadleaf', -27, -18, 0.8, false],
  ['palm', 32, -12, 0.87, true],
  ['palm', -44, 1, 0.76, false],
  ['broadleaf', -9, -5, 0.86, true],
  ['palm', 12, 5, 0.89, false],
  ['broadleaf', 46, 10, 0.79, true],
  ['palm', -28, 13, 0.92, true],
  ['broadleaf', 27, 20, 0.79, false],
  ['broadleaf', -3, 25, 0.9, false],
  ['banana', -46, 28, 0.72, false],
  ['palm', 44, 32, 0.77, false],
  ['broadleaf', -28, 37, 0.8, true],
  ['palm', 18, 43, 0.86, true],
  ['banana', -9, 47, 0.8, false],
  ['banana', -34, 50, 0.66, true],
  ['broadleaf', 3, 61, 0.8, false],
  ['banana', 30, 56, 0.7, false],
];

/** Layered palms and broadleaf trees keep tropical foliage recognizable around a number token. */
export function JungleTile({ uid }: { uid: string }) {
  return (
    <g>
      <polygon points="0,-60 52,-30 52,30 0,60 -52,30 -52,-30" fill={JUNGLE.ground} />
      <path d="M-65 7Q-35-17-2 2T65-8V65H-65Z" fill={JUNGLE.slope} />
      <path d="M-65 43Q-29 14 5 32T65 22V65H-65Z" fill={JUNGLE.near} />
      {TREES.map(([kind, x, y, size, flip], i) => (
        <use
          key={i}
          href={`#${uid}-jungle-${kind}`}
          transform={`translate(${x} ${y}) scale(${flip ? -size : size} ${size})`}
        />
      ))}
    </g>
  );
}
