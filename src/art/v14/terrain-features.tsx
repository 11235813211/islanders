// Ground and upright features are separate so the icon can tilt the island without flattening its trees.

const FOREST_TREES = [
  [-28, -12, 0.9],
  [-6, -27, 1.02],
  [22, -18, 0.94],
  [34, 9, 0.72],
  [-32, 23, 0.83],
  [17, 38, 0.78],
  [-6, 47, 0.63],
] as const;

const WHEAT_STALKS = [
  [-29, -13, -12],
  [-15, -24, 5],
  [22, -15, 10],
  [32, 9, -8],
  [-30, 29, -14],
  [10, 40, 9],
] as const;

/** The board's pine silhouette can stand upright above a projected ground plane. */
export function Tree({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="1" cy="9" rx="10" ry="3" fill="#253f38" opacity=".17" />
      <path d="M0 1V11" stroke="#5e6750" strokeWidth="3" />
      <path d="M0-24 12 0H7L14 8H-14L-7 0H-12Z" fill="#135a32" />
      <path d="M0-24V8H-14L-7 0H-12Z" fill="#237e3b" />
      <path d="M-2-17-8-4H-4" fill="none" stroke="#83a374" strokeWidth="1.2" opacity=".55" />
    </g>
  );
}

/** The board's wheat keeps its full height when its ground position is projected. */
export function Wheat({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) {
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${rotate})`}
      stroke="#9b7f38"
      strokeWidth="1.3"
      fill="#f3d682"
      strokeLinecap="round"
    >
      <path d="M0 6V-15M0-8-5-12M0-3-5-7M0-8 5-12M0-3 5-7" />
      <ellipse cx="-3" cy="-11" rx="1.6" ry="3.4" transform="rotate(-40 -3 -11)" stroke="none" />
      <ellipse cx="3" cy="-11" rx="1.6" ry="3.4" transform="rotate(40 3 -11)" stroke="none" />
      <ellipse cx="-3" cy="-6" rx="1.6" ry="3.4" transform="rotate(-40 -3 -6)" stroke="none" />
      <ellipse cx="3" cy="-6" rx="1.6" ry="3.4" transform="rotate(40 3 -6)" stroke="none" />
      <ellipse cy="-16" rx="1.7" ry="3.4" stroke="none" />
    </g>
  );
}

/** Forest ground can tilt independently of the trees without changing its board illustration. */
export function ForestGround() {
  return (
    <>
      <path d="M-65 5Q-36-12-4 5T65-2V65H-65Z" fill="#69b554" />
      <path d="M-65 43Q-30 12 0 26T65 18V65H-65Z" fill="#31854b" />
      <path d="M-52-27Q-11-11 4-38M18 32Q24 15 48 7" fill="none" stroke="#b0bd8b" opacity=".5" strokeWidth="1.5" />
    </>
  );
}

/** Field contours stay on the ground while their wheat stalks stand above it. */
export function WheatGround() {
  return (
    <>
      <path d="M-70-1Q-32-32 9-15T70-20V65H-70Z" fill="#f5cf61" />
      <path d="M-70 24Q-18-8 13 14T70 15V65H-70Z" fill="#d6a026" />
      <path
        d="M-70 38Q-17 8 12 30T70 29M-70 45Q-17 15 12 37T70 36M-70 52Q-17 22 12 44T70 43"
        fill="none"
        stroke="#ffe28b"
        strokeWidth="2.6"
      />
      <path d="M-50-18q21-10 41-3m17-10q18 1 33 10" fill="none" stroke="#ba994f" opacity=".65" strokeWidth="1.3" />
    </>
  );
}

/** Project tree feet into the island plane while preserving their original upright silhouettes. */
export function ForestTrees({ depth = 1 }: { depth?: number }) {
  return (
    <>
      {FOREST_TREES.map(([x, y, scale], i) => (
        <Tree key={i} x={x} y={y * depth + 11 * scale * (depth - 1)} scale={scale} />
      ))}
    </>
  );
}

/** Keep each rotated stalk rooted on its projected ground position, with its height unchanged. */
export function WheatStalks({ depth = 1 }: { depth?: number }) {
  return (
    <>
      {WHEAT_STALKS.map(([x, y, rotate], i) => (
        <Wheat key={i} x={x} y={y * depth + 6 * Math.cos((rotate * Math.PI) / 180) * (depth - 1)} rotate={rotate} />
      ))}
    </>
  );
}

/** The existing clay ridges and blocks are shared verbatim with the icon's upright relief. */
export function BrickHills() {
  return (
    <g>
      <path d="M-70 8-37-31-5-16 16-39 68 14V70H-70Z" fill="#eb9b55" />
      <path d="M-70 8-37-31-28 1-5-16 10 19 16-39 36-8 68 14V70H-70Z" fill="#bf6536" />
      <path d="M-67 36-30 12 1 27 33 9 64 33V65H-67Z" fill="#f1ae6c" />
      <path
        d="m-45-3 13-7 17 8m25-17 15-9 15 17m-78 38 15-8 14 5m32 8 18-5"
        stroke="#9e614b"
        strokeWidth="1.6"
        fill="none"
        opacity=".7"
      />
      <path d="m-29 34 10-5 9 5v9l-10 4-9-5Z" fill="#b56c50" />
      <path d="m-29 34 10 4 9-4m-10 4v9" fill="none" stroke="#e6ab83" strokeWidth="1.4" />
      <path d="m22-7 10-4 7 4v8l-9 3-8-4Z" fill="#ac664e" />
      <path d="m22-7 9 4 8-4m-8 4v7" fill="none" stroke="#e7aa80" strokeWidth="1.4" />
      <path d="M-38 12h5m46 33h8m4-65h4" stroke="#efc198" strokeWidth="1.5" strokeLinecap="round" />
    </g>
  );
}
