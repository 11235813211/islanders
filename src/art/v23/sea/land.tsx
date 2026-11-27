// Unassigned land: the editor's "land" tile, filled with a real terrain when a game is set up.
// Muted rolling ground with contour lines and a footpath, so it reads as land but no resource.

/** Tweak here: ground bands from back to front, bushes, contour lines, path, and stones. */
export const LAND = {
  base: '#c5c899',
  far: '#d3d4a8',
  middle: '#b0b984',
  near: '#c2c58f',
  bush: '#7e925d',
  bushLight: '#9aad73',
  contour: '#8a966a',
  path: '#efe7c5',
  stone: '#a7a084',
};

function Bush({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cy="5" rx="8" ry="2.2" fill="#56603f" opacity=".18" />
      <circle cx="-3.5" cy="0" r="4.2" fill={LAND.bush} />
      <circle cx="3.5" cy="0.5" r="3.8" fill={LAND.bush} />
      <circle cx="0" cy="-3" r="4.6" fill={LAND.bushLight} />
      <circle cx="-1.5" cy="-4.5" r="1.6" fill="#b7c58f" opacity=".7" />
    </g>
  );
}

export function LandTile() {
  return (
    <g>
      <polygon points="0,-60 52,-30 52,30 0,60 -52,30 -52,-30" fill={LAND.base} />
      <path d="M-70-6Q-31-35 6-14T70-19V70H-70Z" fill={LAND.far} />
      <path d="M-70 22Q-24-7 12 14T70 10V70H-70Z" fill={LAND.middle} />
      <path d="M-70 46Q-20 22 16 40T70 36V70H-70Z" fill={LAND.near} />
      <g fill="none" stroke={LAND.contour} strokeWidth="1" opacity=".38" strokeLinecap="round">
        <path d="M-40-21q16-11 33-2" />
        <path d="M-33-15q11-7 22-1" />
        <path d="M14-27q14-8 30 2" />
        <path d="M20-21q9-5 18 1" />
        <path d="M-46 32q14-8 30-1" />
      </g>
      <path
        d="M-48 46Q-26 28-6 33T40 3"
        fill="none"
        stroke={LAND.path}
        strokeWidth="2.2"
        strokeDasharray="1.5 3.5"
        strokeLinecap="round"
        opacity=".9"
      />
      <Bush x={-31} y={-25} scale={0.95} />
      <Bush x={31} y={-30} scale={0.8} />
      <Bush x={37} y={27} scale={1.05} />
      <Bush x={-36} y={22} scale={0.85} />
      <Bush x={4} y={-41} scale={0.62} />
      <g fill={LAND.stone}>
        <path d="m-14 44 4-3 5 1 1 3-6 1Z" />
        <path d="m22 42 3-2 4 1v3h-5Z" />
        <path d="m-44 4 3-2 3 1-1 3Z" />
      </g>
    </g>
  );
}
