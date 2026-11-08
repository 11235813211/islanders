// Jungle: deep broad-leaf canopy (unlike the forest's light-green conifers), a river with a
// waterfall and pool, hanging vines, a few flowers, and a black panther resting on a branch.

/** Tweak here: canopy greens back to front, water, trunks, vines, flowers, and the panther. */
export const JUNGLE = {
  base: '#1b6139',
  canopyBack: '#236f42',
  canopy: '#2c8a4d',
  canopyLight: '#3ea65e',
  leaf: '#46b468',
  leafDark: '#1f7a43',
  water: '#4cc2d6',
  waterDeep: '#2e9fba',
  foam: '#dcf8fb',
  rock: '#3e5847',
  trunk: '#6e5232',
  vine: '#2f8545',
  flower: '#ff6f91',
  flower2: '#ffb347',
  panther: '#0f1412',
  eyes: '#d7f06a',
};

/** A broad leaf pointing along `angle`, `size` long. */
function Leaf({
  x,
  y,
  angle,
  size,
  fill = JUNGLE.leaf,
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
      <path d="M1 0H18M8 0 11-3M8 0l3 3M13 0l2-2M13 0l2 2" stroke={JUNGLE.leafDark} strokeWidth="0.9" fill="none" />
    </g>
  );
}

/** A palm: curved trunk and a crown of fronds. */
function Palm({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M0 0Q-4-14 2-28" stroke={JUNGLE.trunk} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M-1-6h3m-3-8h3m-2-8h3" stroke="#4d3920" strokeWidth="0.8" />
      {[-160, -120, -75, -35, 10].map(angle => (
        <Leaf key={angle} x={2} y={-28} angle={angle} size={17} fill={JUNGLE.canopyLight} />
      ))}
    </g>
  );
}

/** Black panther lying along a branch, tail hanging. Small, dark on dark: easy to miss. */
function Panther() {
  return (
    <g transform="translate(-26 -27) rotate(-9)" aria-hidden="true">
      <path d="M-8 3.5Q-1 0.8 9 2.6 12 2 13.2 0.3" fill="none" stroke={JUNGLE.panther} strokeWidth="1.2" />
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

export function JungleTile() {
  return (
    <g>
      <polygon points="0,-60 52,-30 52,30 0,60 -52,30 -52,-30" fill={JUNGLE.base} />
      {/* Back canopy */}
      <g fill={JUNGLE.canopyBack}>
        <circle cx="-38" cy="-42" r="16" />
        <circle cx="-14" cy="-50" r="14" />
        <circle cx="12" cy="-48" r="15" />
        <circle cx="38" cy="-40" r="14" />
        <circle cx="-52" cy="-8" r="13" />
      </g>
      <g fill={JUNGLE.canopy}>
        <circle cx="-30" cy="-46" r="9" />
        <circle cx="0" cy="-52" r="9" />
        <circle cx="26" cy="-46" r="9" />
      </g>
      {/* River from the upper right, over a ledge, into a pool, and away to the lower left */}
      <path d="M62-42C44-34 34-30 30-12" fill="none" stroke={JUNGLE.waterDeep} strokeWidth="9" strokeLinecap="round" />
      <path d="M62-42C44-34 34-30 30-12" fill="none" stroke={JUNGLE.water} strokeWidth="5.5" strokeLinecap="round" />
      <path d="M22-12H40" stroke={JUNGLE.rock} strokeWidth="5" strokeLinecap="round" />
      <path d="M25-11V12M29-10V14M33-11V12M37-10V9" stroke={JUNGLE.foam} strokeWidth="1.6" opacity=".9" />
      <path d="M24-11V12M38-11V10" stroke={JUNGLE.water} strokeWidth="2" />
      <ellipse cx="31" cy="18" rx="17" ry="7" fill={JUNGLE.waterDeep} />
      <ellipse cx="31" cy="17" rx="14" ry="5" fill={JUNGLE.water} />
      <path d="M22 16q4-2 8 0t8 0" stroke={JUNGLE.foam} strokeWidth="1.2" fill="none" />
      <path d="M17 22C2 36-18 34-38 48-46 54-60 52-66 58" fill="none" stroke={JUNGLE.waterDeep} strokeWidth="8" />
      <path d="M17 22C2 36-18 34-38 48-46 54-60 52-66 58" fill="none" stroke={JUNGLE.water} strokeWidth="4.6" />
      <path d="M-6 35q4-2 7 0M-30 46q4-2 7 0" stroke={JUNGLE.foam} strokeWidth="1" fill="none" opacity=".8" />
      {/* The branch, its resident, and the leaves around it */}
      <path d="M-58-14Q-36-22-6-31" stroke={JUNGLE.trunk} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <path d="M-30-22q3-6 9-8" stroke={JUNGLE.trunk} strokeWidth="1.6" fill="none" />
      <Panther />
      <Leaf x={-42} y={-21} angle={-150} size={13} fill={JUNGLE.canopy} />
      <Leaf x={-10} y={-31} angle={-60} size={12} fill={JUNGLE.canopyLight} />
      <Leaf x={-6} y={-30} angle={20} size={11} />
      {/* Vines from the canopy */}
      <g stroke={JUNGLE.vine} strokeWidth="1.3" fill="none" strokeLinecap="round">
        <path d="M-2-46q4 10-1 19" />
        <path d="M16-40q-3 9 1 15" />
        <path d="M44-30q3 8-1 14" />
      </g>
      <g fill={JUNGLE.canopyLight}>
        <ellipse cx="0" cy="-36" rx="2" ry="1.2" transform="rotate(30 0 -36)" />
        <ellipse cx="15" cy="-31" rx="2" ry="1.2" transform="rotate(-30 15 -31)" />
        <ellipse cx="45" cy="-21" rx="2" ry="1.2" transform="rotate(30 45 -21)" />
      </g>
      <Palm x={-38} y={12} scale={0.95} />
      {/* Foreground leaves and flowers */}
      <Leaf x={-30} y={34} angle={-20} size={20} fill={JUNGLE.canopy} />
      <Leaf x={-30} y={34} angle={-70} size={18} />
      <Leaf x={-30} y={34} angle={-130} size={16} fill={JUNGLE.canopyLight} />
      <Leaf x={48} y={38} angle={-160} size={19} fill={JUNGLE.canopy} />
      <Leaf x={48} y={38} angle={-110} size={17} />
      <Leaf x={4} y={52} angle={-90} size={14} fill={JUNGLE.canopyLight} />
      <Leaf x={4} y={52} angle={-40} size={13} />
      <g>
        <circle cx="-20" cy="24" r="2" fill={JUNGLE.flower} />
        <circle cx="42" cy="26" r="1.8" fill={JUNGLE.flower2} />
        <circle cx="12" cy="44" r="1.7" fill={JUNGLE.flower} />
        <circle cx="-46" cy="-2" r="1.6" fill={JUNGLE.flower2} />
      </g>
    </g>
  );
}
