// Gold field: an ochre ridge with gold seams, a timbered mine, a cart of nuggets, and a few
// small sparkles (they twinkle slowly; see .gold-sparkle in Board.css).

/** Tweak here: ground, ridge faces, rock lines, gold, and the mine's timber. */
export const GOLD = {
  base: '#d4a64d',
  ridge: '#b7843f',
  ridgeLight: '#e2bd6c',
  near: '#c8984a',
  nearLight: '#dcb062',
  rock: '#8b622f',
  seam: '#ffe27a',
  nugget: '#f4c430',
  nuggetLight: '#fff0a1',
  timber: '#7a4f2b',
  timberDark: '#4d311b',
  shaft: '#2b1f17',
  sparkle: '#fffbe2',
};

/** Where sparkles sit (clear of the number token in the middle). */
const SPARKLES: [number, number, number][] = [
  [-29, -29, 1],
  [33, -4, 0.8],
  [11, -41, 0.7],
  [-38, 14, 0.75],
  [-12, 42, 0.85],
];

function Sparkle({ x, y, scale, index }: { x: number; y: number; scale: number; index: number }) {
  return (
    <g
      className="gold-sparkle"
      style={{ animationDelay: `${index * 0.7}s` }}
      transform={`translate(${x} ${y}) scale(${scale})`}
    >
      <circle r="3.2" fill={GOLD.sparkle} opacity=".25" />
      <path d="M0-5 1.1-1.1 5 0 1.1 1.1 0 5-1.1 1.1-5 0-1.1-1.1Z" fill={GOLD.sparkle} />
    </g>
  );
}

export function GoldTile() {
  return (
    <g>
      <polygon points="0,-60 52,-30 52,30 0,60 -52,30 -52,-30" fill={GOLD.base} />
      {/* Back ridge with lit faces */}
      <path d="M-70 12-41-31-17-6 9-39 36-14 70 4V70H-70Z" fill={GOLD.ridge} />
      <path d="M-41-31-34 5-17-6ZM9-39 14-3 36-14Z" fill={GOLD.ridgeLight} />
      <path
        d="m-50-4 6-4m6 9 5-6m21-20 5 4m10 7 5-3"
        stroke={GOLD.rock}
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity=".7"
      />
      {/* Seams of gold in the rock */}
      <path
        d="m-45-13 5 3 4-4 5 5m26-24 4 5 5-3 3 6m-49 25 4-2 4 3"
        fill="none"
        stroke={GOLD.seam}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Foreground slope */}
      <path d="M-70 34Q-30 14 4 30T70 24V70H-70Z" fill={GOLD.near} />
      <path d="M-70 50Q-26 33 6 46T70 41" fill="none" stroke={GOLD.nearLight} strokeWidth="2.2" opacity=".7" />
      {/* Mine entrance */}
      <g transform="translate(25 -16)">
        <path d="M-9 8V-4Q0-12 9-4V8Z" fill={GOLD.shaft} />
        <path d="M-10 9V-6M10 9V-6" stroke={GOLD.timber} strokeWidth="3" />
        <path d="M-12-7H12" stroke={GOLD.timber} strokeWidth="3.4" strokeLinecap="round" />
        <path d="M-12-7H12" stroke={GOLD.timberDark} strokeWidth="1" transform="translate(0 1.6)" />
        <path d="M-3 9 1 2l4 7" stroke={GOLD.seam} strokeWidth="1" fill="none" opacity=".55" />
      </g>
      {/* Cart of nuggets on its track */}
      <path d="M17 12H50" stroke={GOLD.timberDark} strokeWidth="1.4" strokeDasharray="3 2" />
      <g transform="translate(38 4)">
        <path d="M-9-4 8-4 6 4H-7Z" fill={GOLD.timber} stroke={GOLD.timberDark} strokeWidth="1" />
        <path d="M-8-4Q-6-10-1-8 3-11 7-5Z" fill={GOLD.nugget} />
        <path d="M-4-7q2-2 4-1" stroke={GOLD.nuggetLight} strokeWidth="1.2" fill="none" />
        <circle cx="-4" cy="5.5" r="2.2" fill={GOLD.timberDark} />
        <circle cx="4" cy="5.5" r="2.2" fill={GOLD.timberDark} />
      </g>
      {/* Nuggets on the ground */}
      <g fill={GOLD.nugget}>
        <path d="m-30 38 3-3 4 1 1 3-4 2Z" />
        <path d="m24 40 2-2 3 1v3h-3Z" />
        <path d="m-46 28 2-2 3 1-1 3Z" />
      </g>
      <g fill={GOLD.nuggetLight}>
        <circle cx="-27" cy="36.5" r=".9" />
        <circle cx="26" cy="39.5" r=".7" />
      </g>
      {SPARKLES.map(([x, y, scale], index) => (
        <Sparkle key={index} x={x} y={y} scale={scale} index={index} />
      ))}
    </g>
  );
}
