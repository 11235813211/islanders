// Jungle: a dense, layered broadleaf canopy (unlike the forest's open stands of conifers), palms,
// hanging vines, a narrow river dropping over a waterfall, and a black panther resting on a branch.

/** Tweak here: canopy greens from deepest to brightest, water, trunks, vines, flowers, the panther. */
export const JUNGLE = {
  floor: '#123f26',
  deep: '#17502f',
  canopy: '#1f6a3a',
  mid: '#2a8046',
  bright: '#3c9b52',
  light: '#5cb662',
  leafVein: '#16502d',
  water: '#4cc2d6',
  waterDeep: '#2a93ae',
  foam: '#dcf8fb',
  rock: '#3b5446',
  trunk: '#6a4e2f',
  vine: '#2e7d40',
  flower: '#ff6f91',
  flower2: '#ffb347',
  panther: '#0c100e',
  eyes: '#d7f06a',
};

/** A canopy clump: a few overlapping crowns with a lit top, centered at (x, y). */
function Crown({ x, y, size, tone }: { x: number; y: number; size: number; tone: 0 | 1 | 2 }) {
  const fills = [
    [JUNGLE.deep, JUNGLE.canopy],
    [JUNGLE.canopy, JUNGLE.mid],
    [JUNGLE.mid, JUNGLE.bright],
  ][tone]!;
  const r = size;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx={-r * 0.45} cy={r * 0.15} r={r * 0.7} fill={fills[0]} />
      <circle cx={r * 0.45} cy={r * 0.2} r={r * 0.65} fill={fills[0]} />
      <circle cx="0" cy={-r * 0.15} r={r * 0.75} fill={fills[1]} />
      <circle cx={-r * 0.2} cy={-r * 0.4} r={r * 0.35} fill={tone === 2 ? JUNGLE.light : JUNGLE.bright} opacity=".55" />
    </g>
  );
}

/** A broad leaf pointing along `angle`, `size` long. */
function Leaf({
  x,
  y,
  angle,
  size,
  fill = JUNGLE.bright,
}: {
  x: number;
  y: number;
  angle: number;
  size: number;
  fill?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${size / 20})`}>
      <path d="M0 0C6-7 16-6 20 0 16 6 6 7 0 0Z" fill={fill} />
      <path d="M1 0H18M8 0 11-3M8 0l3 3M13 0l2-2M13 0l2 2" stroke={JUNGLE.leafVein} strokeWidth="0.9" fill="none" />
    </g>
  );
}

/** A palm crown poking above the canopy. */
function Palm({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      {[-170, -125, -80, -40, 0, 35].map(angle => (
        <Leaf key={angle} x={0} y={0} angle={angle} size={15} fill={angle % 2 ? JUNGLE.light : JUNGLE.bright} />
      ))}
      <circle r="2.2" fill={JUNGLE.trunk} />
    </g>
  );
}

/** Black panther lying along a branch, tail hanging. Small, dark on dark: easy to miss. */
function Panther() {
  return (
    <g transform="translate(-27 -24) rotate(-9)" aria-hidden="true">
      <path d="M-9 1Q-9-3-4-3.4 3-4 7-3 10-3.6 11.3-1.2 11.5 1.6 8 2.3-2 3.3-7 3Z" fill={JUNGLE.panther} />
      <circle cx="10.4" cy="-2.6" r="2.6" fill={JUNGLE.panther} />
      <path d="M9-4.6 9.4-6.4 10.6-5ZM11.4-4.8 12.3-6.3 12.8-4.4Z" fill={JUNGLE.panther} />
      <path
        d="M-8 2Q-12 6-10 12-9.6 15-11.8 15.4"
        fill="none"
        stroke={JUNGLE.panther}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path d="M5 2.2 5.4 6.3M7.4 2 7.9 5.6" stroke={JUNGLE.panther} strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="11.2" cy="-3" r="0.55" fill={JUNGLE.eyes} />
      <circle cx="9.7" cy="-3.1" r="0.5" fill={JUNGLE.eyes} />
    </g>
  );
}

/** Canopy clumps from back (top, darker) to front (bottom, brighter). */
const CROWNS: [number, number, number, 0 | 1 | 2][] = [
  [-40, -46, 15, 0],
  [-14, -54, 14, 0],
  [14, -52, 15, 0],
  [40, -42, 14, 0],
  [-54, -16, 13, 0],
  [54, -10, 13, 0],
  [-28, -36, 12, 1],
  [2, -40, 12, 1],
  [28, -30, 12, 1],
  [-44, 4, 13, 1],
  [46, 14, 13, 1],
  [-50, 30, 12, 1],
  [-22, 44, 14, 2],
  [8, 50, 13, 2],
  [34, 42, 13, 2],
  [-38, 22, 11, 2],
  [42, 30, 10, 2],
];

export function JungleTile() {
  return (
    <g>
      <polygon points="0,-60 52,-30 52,30 0,60 -52,30 -52,-30" fill={JUNGLE.floor} />
      {CROWNS.slice(0, 6).map(([x, y, size, tone], i) => (
        <Crown key={i} x={x} y={y} size={size} tone={tone} />
      ))}
      {/* A narrow river out of the canopy, over a ledge, and down through the trees */}
      <path
        d="M60-36C46-28 38-24 33-12"
        fill="none"
        stroke={JUNGLE.waterDeep}
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <path d="M60-36C46-28 38-24 33-12" fill="none" stroke={JUNGLE.water} strokeWidth="3.8" strokeLinecap="round" />
      <path d="M26-12H40" stroke={JUNGLE.rock} strokeWidth="4" strokeLinecap="round" />
      <path d="M29-11V7M33-10V9M37-11V6" stroke={JUNGLE.foam} strokeWidth="1.4" opacity=".9" />
      <ellipse cx="33" cy="11" rx="10" ry="4.5" fill={JUNGLE.waterDeep} />
      <ellipse cx="33" cy="10.5" rx="8" ry="3" fill={JUNGLE.water} />
      <path d="M25 13C14 22 6 30-8 36" fill="none" stroke={JUNGLE.waterDeep} strokeWidth="5.5" strokeLinecap="round" />
      <path d="M25 13C14 22 6 30-8 36" fill="none" stroke={JUNGLE.water} strokeWidth="3" strokeLinecap="round" />
      {CROWNS.slice(6).map(([x, y, size, tone], i) => (
        <Crown key={i} x={x} y={y} size={size} tone={tone} />
      ))}
      {/* The branch, its resident, and leaves around it */}
      <path d="M-58-10Q-36-18-8-28" stroke={JUNGLE.trunk} strokeWidth="3" fill="none" strokeLinecap="round" />
      <Panther />
      <Leaf x={-42} y={-17} angle={-150} size={12} fill={JUNGLE.mid} />
      <Leaf x={-10} y={-28} angle={-50} size={11} fill={JUNGLE.bright} />
      {/* Palms above the canopy */}
      <Palm x={-30} y={-46} size={0.9} />
      <Palm x={24} y={-44} size={0.8} />
      <Palm x={48} y={-14} size={0.75} />
      <Palm x={-48} y={16} size={0.85} />
      {/* Vines hanging from the canopy */}
      <g stroke={JUNGLE.vine} strokeWidth="1.3" fill="none" strokeLinecap="round">
        <path d="M-6-44q4 10-1 18" />
        <path d="M12-42q-3 9 1 15" />
        <path d="M44 0q3 8-1 14" />
        <path d="M-46-2q-3 9 1 14" />
      </g>
      <g fill={JUNGLE.light}>
        <ellipse cx="-6" cy="-32" rx="2" ry="1.2" transform="rotate(30 -6 -32)" />
        <ellipse cx="13" cy="-31" rx="2" ry="1.2" transform="rotate(-30 13 -31)" />
        <ellipse cx="44" cy="10" rx="2" ry="1.2" transform="rotate(30 44 10)" />
      </g>
      {/* Big foreground leaves and a few flowers */}
      <Leaf x={-30} y={52} angle={-25} size={20} fill={JUNGLE.mid} />
      <Leaf x={-30} y={52} angle={-75} size={18} fill={JUNGLE.light} />
      <Leaf x={44} y={52} angle={-160} size={19} fill={JUNGLE.mid} />
      <Leaf x={44} y={52} angle={-115} size={17} fill={JUNGLE.light} />
      <circle cx="-20" cy="30" r="2" fill={JUNGLE.flower} />
      <circle cx="40" cy="24" r="1.8" fill={JUNGLE.flower2} />
      <circle cx="16" cy="40" r="1.7" fill={JUNGLE.flower} />
      <circle cx="-46" cy="-4" r="1.6" fill={JUNGLE.flower2} />
    </g>
  );
}
