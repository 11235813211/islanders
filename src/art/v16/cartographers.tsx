// Cartographers art: the lodestone tile, card, and icon; relay stations; survey ships and their
// target markers; the extra numbers charted onto tiles; and the seam of a split tile. Colors sit at the top so they are easy to tweak.
import { hexPoints } from '../../lib/geometry';
import type { CartographersArt } from '../types';
import { FOG } from './sea/fog';
import { Ship } from './sea/ship';
import { arch, gabledHouse, outlineTone, Solids, tone } from './solids';

/** Heather moor with near-black magnetite; the purple is only in the heather and the card frame. */
const LODE = {
  groundBack: '#b0a978',
  ground: '#8f8b5c',
  groundFront: '#a39c68',
  groundDusk: '#958a6e',
  heatherWash: '#9a78a8',
  heather: '#a77cbf',
  heatherLight: '#c9a5da',
  heatherDark: '#6f4f88',
  rockDark: '#29262f',
  rock: '#423d4d',
  rockLight: '#625a72',
  sheen: '#a294c4',
};

/** A clump of heather: a dark base with purple and pale blooms on top. */
function Heather({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cy="3" rx="8" ry="2.4" fill="#4d5a35" opacity=".3" />
      <path d="M-7 2Q-6-4 0-5 6-4 7 2Z" fill="#5f7140" />
      <g fill={LODE.heather}>
        <circle cx="-4" cy="-3" r="2" />
        <circle cx="0" cy="-5" r="2.2" />
        <circle cx="4" cy="-3" r="2" />
        <circle cx="-1" cy="-1" r="1.8" />
      </g>
      <g fill={LODE.heatherLight}>
        <circle cx="-4.5" cy="-3.6" r=".8" />
        <circle cx="-.4" cy="-5.8" r=".9" />
        <circle cx="3.6" cy="-3.7" r=".8" />
      </g>
      <circle cx="2" cy="-1" r="1.3" fill={LODE.heatherDark} />
    </g>
  );
}

/** One black magnetite crystal (an octahedron) poking out of the ground. */
function Crystal({ x, y, scale = 1, angle = 0 }: { x: number; y: number; scale?: number; angle?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
      <ellipse cy="7" rx="9" ry="2.4" fill="#2e3324" opacity=".3" />
      <path d="M0-12 8 0 0 7-8 0Z" fill={LODE.rockDark} />
      <path d="M0-12 8 0 0 2Z" fill={LODE.rock} />
      <path d="M0-12-8 0 0 2Z" fill={LODE.rockLight} />
      <path d="M0-11-6-1" stroke={LODE.sheen} strokeWidth=".9" strokeLinecap="round" />
    </g>
  );
}

const HEATHER: [number, number, number][] = [
  [-38, -14, 1.1],
  [-44, 12, 1],
  [-30, 36, 1.15],
  [-8, 46, 0.95],
  [26, 40, 1.1],
  [42, 18, 1],
  [40, -16, 0.95],
  [-18, -40, 0.9],
];

const CRYSTALS: [number, number, number, number][] = [
  [-20, -30, 1.5, -8],
  [-6, -38, 1.15, 6],
  [8, -32, 1.35, 14],
  [24, -24, 1, -4],
  [-34, 20, 1.05, 10],
  [-24, 28, 0.8, -12],
  [30, 26, 1.1, -10],
];

/** The lodestone tile: magnetite crystals on a heather moor, with room for the number token. */
function LodestoneTile({ uid }: { uid: string }) {
  return (
    <>
      <polygon points={hexPoints(59)} fill="#e8d9b3" stroke="#cfbe96" strokeWidth="1.5" />
      <g clipPath={`url(#${uid}-tile)`} className="terrain-art terrain-lodestone">
        <polygon points={hexPoints(58)} fill={LODE.ground} />
        <path d="M-70-5Q-28-41 2-14T70-10V65H-70Z" fill={LODE.groundDusk} />
        <path d="M-70 24Q-24-12 14 11T70 7V65H-70Z" fill={LODE.ground} />
        <path d="M-70 51Q-17 10 21 35T70 32V65H-70Z" fill={LODE.groundFront} />
        <path d="M-50 4Q-34-10-17-7M10 38q22-8 41-3" fill="none" stroke="#d6cfa2" strokeWidth="1.2" />
        <g fill={LODE.heatherWash} opacity=".28">
          <path d="M-62 8Q-46-4-30 2-36 14-52 18Z" />
          <path d="M20 46Q36 34 56 38 48 52 30 54Z" />
          <path d="M28-40Q40-46 52-36 44-28 32-30Z" />
        </g>
        {HEATHER.map(([x, y, s], i) => (
          <Heather key={i} x={x} y={y} scale={s} />
        ))}
        <path d="M-30-22Q-8-40 30-24-6-10-30-22Z" fill="#5d5a4c" opacity=".35" />
        {CRYSTALS.map(([x, y, s, a], i) => (
          <Crystal key={i} x={x} y={y} scale={s} angle={a} />
        ))}
        <polygon points={hexPoints(56.5)} fill="none" stroke="#fff5d8" strokeOpacity=".18" strokeWidth="1.2" />
      </g>
    </>
  );
}

const STONE = { dark: '#2a2730', mid: '#45404f', light: '#6a6279', sheen: '#a99bc8' };

/** The card's illustration: one dark faceted lodestone. */
function LodestoneArt() {
  return (
    <svg className="cards-art" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="49" r="36" fill="currentColor" opacity=".08" />
      <g transform="translate(50 56) scale(1.18) translate(-50 -58)">
        <ellipse cx="50" cy="84" rx="30" ry="5" fill="#2b2433" opacity=".18" />
        <path d="m20 70 8-26 20-12 24 6 10 24-10 14-30 4Z" fill={STONE.dark} />
        <path d="m28 44 20-12 24 6-10 16-22 2Z" fill={STONE.light} />
        <path d="m20 70 8-26 12 12-2 24Z" fill={STONE.mid} />
        <path d="m62 54 10-16 10 24-10 14Z" fill={STONE.mid} />
        <path d="m31 44 17-10 21 5M42 54l18-2" fill="none" stroke={STONE.sheen} strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Corner, harbor, and log icon: the same stone, small. */
function LodestoneIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="resource-icon"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="m2 18 2.5-9 6-5 8 2.5 3.5 8-3.5 4.5-10 1Z" fill={STONE.dark} stroke="#4f2c70" strokeWidth="1.2" />
      <path d="m4.5 9 6-5 8 2.5-3.5 6-7.5 1Z" fill={STONE.light} />
      <path d="m5.5 9 5-4 7 2.2" fill="none" stroke={STONE.sheen} strokeWidth="1" />
    </svg>
  );
}

/** The relay hut is a smaller cousin of a settlement. */
const HUT_SCALE = 1.05;

/** A small gabled hut with a door, built from the same 3D solids as settlements and cities. */
function relayHut() {
  const hut = gabledHouse({ x: 0, z: 0, width: 10, depth: 9, wall: 6.5, rise: 5, overhang: 1, fascia: 1.1 });
  hut.front.decals.push({ points: arch(-1.6, 1.6, 0, 4.2).map(([x, y]) => hut.onFront(x, y)), fill: 'line' });
  return hut.solids;
}

/** A relay station: a road in the seat color with a small station hut and its flag at its middle. */
function Relay({
  from: a,
  to: b,
  color,
  inset,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  inset: number;
}) {
  const dx = (b.x - a.x) * inset;
  const dy = (b.y - a.y) * inset;
  const line = outlineTone(color);
  const bar = (stroke: string, width: number) => (
    <line
      x1={a.x + dx}
      y1={a.y + dy}
      x2={b.x - dx}
      y2={b.y - dy}
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
    />
  );
  return (
    <g className="board-relay">
      {bar(line, 8.4)}
      {bar(color, 5.8)}
      <g transform={`translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2})`}>
        {/* A flag on a post behind a little station hut, modeled in 3D like a settlement (no shadow). */}
        <path d="M7 1V-25" stroke={line} strokeWidth="1.7" strokeLinecap="round" />
        <path d="M7-25 16-22 7-19Z" fill={color} stroke={line} strokeWidth="1" strokeLinejoin="round" />
        <g transform={`translate(0 3) scale(${HUT_SCALE})`}>
          <Solids solids={relayHut()} color={tone(color, 0.08)} />
        </g>
      </g>
    </g>
  );
}

/** A survey ship: the seat's ship over a compass-rose ring drawn on the water. */
function SurveyShip({
  from,
  to,
  color,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
}) {
  const x = (from.x + to.x) / 2;
  const y = (from.y + to.y) / 2;
  const ring = tone(color, 0.45);
  return (
    <g className="board-survey">
      <g transform={`translate(${x} ${y + 5})`} aria-hidden="true">
        <circle r="17" fill="#0b3f52" opacity=".22" />
        <circle r="17" fill="none" stroke={outlineTone(color)} strokeWidth="3.2" opacity=".6" />
        <circle r="17" fill="none" stroke={ring} strokeWidth="1.8" />
        <path
          d="M0-22 2.6-17H-2.6ZM0 22 2.6 17H-2.6ZM-22 0-17 2.6V-2.6ZM22 0 17 2.6V-2.6Z"
          fill={ring}
          stroke={outlineTone(color)}
          strokeWidth=".7"
        />
      </g>
      <Ship from={from} to={to} color={color} />
    </g>
  );
}

/** Numbers a survey ship charted, as small tokens beside the tile's own (6 and 8 in red). */
function ExtraNumbers({ numbers }: { numbers: number[] }) {
  return (
    <g className="board-charts" aria-hidden="true">
      {numbers.map((n, i) => {
        const red = n === 6 || n === 8;
        return (
          <g key={i} transform={`translate(${22 + i * 15} ${-6 + i * 12})`}>
            <circle cy="1.2" r="10.6" fill="#394a3d" opacity=".22" />
            <circle r="10" fill="#fff6dc" stroke="#7a5a99" strokeWidth="1.4" />
            <text textAnchor="middle" y="4" fontSize="11.5" fontWeight="800" fill={red ? '#b8513f' : '#3c4942'}>
              {n}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** A survey ship's target on a tile: a small compass rose in the seat's color, like the ship's ring. */
function SurveyTarget({ color }: { color: string }) {
  const ring = tone(color, 0.45);
  return (
    <g className="board-survey-target" aria-hidden="true">
      <circle r="9.5" fill="#fff8e4" stroke={outlineTone(color)} strokeWidth="2.4" />
      <circle r="9.5" fill="none" stroke={ring} strokeWidth="1.3" />
      <path
        d="M0-7 1.9-1.9 7 0 1.9 1.9 0 7-1.9 1.9-7 0-1.9-1.9Z"
        fill={color}
        stroke={outlineTone(color)}
        strokeWidth=".8"
        strokeLinejoin="round"
      />
      <circle r="1.6" fill="#fff8e4" />
    </g>
  );
}

/** Cloud puffs near a peeked tile's rim: [x, y, radius] for each circle, three small banks. */
const PEEK_PUFFS: [number, number, number][] = [
  [-46, -20, 11],
  [-36, -30, 9],
  [-50, -6, 8],
  [44, 14, 10],
  [50, 2, 8],
  [36, 24, 8],
  [-8, 52, 9],
  [6, 54, 10],
  [-20, 48, 7],
];

/**
 * Over a fog tile you peeked at: mist that thickens toward the rim and a few cloud banks at the
 * edges, so the tile still reads as fog while what it hides shows clearly in the middle.
 */
function PeekVeil({ uid }: { uid: string }) {
  const rim = hexPoints(60.6);
  return (
    <g className="peek-veil" aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}-peek-mist`}>
          <stop offset=".5" stopColor={FOG.center} stopOpacity="0" />
          <stop offset=".8" stopColor={FOG.center} stopOpacity=".28" />
          <stop offset="1" stopColor={FOG.rim} stopOpacity=".7" />
        </radialGradient>
        <clipPath id={`${uid}-peek-clip`}>
          <polygon points={rim} />
        </clipPath>
      </defs>
      <polygon points={rim} fill={`url(#${uid}-peek-mist)`} />
      <g clipPath={`url(#${uid}-peek-clip)`}>
        {PEEK_PUFFS.map(([x, y, r]) => (
          <circle key={`s${x},${y}`} cx={x} cy={y + 2} r={r} fill={FOG.wispShade} opacity=".35" />
        ))}
        {PEEK_PUFFS.map(([x, y, r]) => (
          <circle key={`${x},${y}`} cx={x} cy={y} r={r} fill={FOG.wisp} opacity=".8" />
        ))}
      </g>
    </g>
  );
}

/** The seam down a split tile, top corner to bottom corner, between its two halves. */
function SplitSeam() {
  return (
    <g className="board-split-seam" aria-hidden="true">
      <path d="M0-58V58" stroke="#5b4a2f" strokeWidth="4.2" strokeOpacity=".35" />
      <path d="M0-58V58" stroke="#fff3cf" strokeWidth="2" strokeDasharray="7 4" />
    </g>
  );
}

export const cartographers: CartographersArt = {
  // Map previews and the editor show lodestone in Cartographers purple (the tile art keeps its moor).
  terrain: { name: 'Moor · lodestone', color: LODE.heather },
  // A muted take on the purple seat color, so the card sits beside the others.
  cardColors: { base: '#9168b8', light: '#efe4f6', dark: '#4f2c70' },
  Tile: LodestoneTile,
  ResourceIcon: LodestoneIcon,
  ResourceArt: LodestoneArt,
  Relay,
  SurveyShip,
  ExtraNumbers,
  SurveyTarget,
  SplitSeam,
  PeekVeil,
};
