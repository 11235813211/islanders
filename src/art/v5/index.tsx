// Art v5: v4's classic pieces plus a mountain chalet style, picked per room (settings.pieceStyle).
// Chalets have a stone ground floor, a balcony, a framed gable, and shuttered square windows.
import type { PieceStyle, Resource, BaseTerrain as Terrain } from '../../../shared/types';
import { hexPoints } from '../../lib/geometry';
import type { ArtPack } from '../types';

const terrain: ArtPack['terrain'] = {
  wood: { name: 'Forest · lumber', color: '#459845' },
  brick: { name: 'Hills · brick', color: '#d87943' },
  sheep: { name: 'Pasture · wool', color: '#9acb49' },
  wheat: { name: 'Fields · grain', color: '#edbf3c' },
  ore: { name: 'Mountains · ore', color: '#6c9eae' },
  desert: { name: 'Desert', color: '#e8c67e' },
};

const cardColors: ArtPack['cardColors'] = {
  // Bases sit between each tile's fill and its art; faces are a pale tint of the same hue.
  wood: { base: '#3f9a4b', light: '#d9efc6', dark: '#1b5a32' },
  brick: { base: '#d8703b', light: '#ffe0c2', dark: '#8a3a1d' },
  sheep: { base: '#8fc743', light: '#eaf6cb', dark: '#46782a' },
  wheat: { base: '#f2bd22', light: '#fff1bd', dark: '#8f5f05' },
  ore: { base: '#6e98a8', light: '#dfeaee', dark: '#31515c' },
};

function ArtDefs({ uid }: { uid: string }) {
  return (
    <>
      <radialGradient id={`${uid}-sea`} cx="50%" cy="44%" r="68%">
        <stop offset="0" stopColor="#24b7cf" />
        <stop offset=".65" stopColor="#149bc1" />
        <stop offset="1" stopColor="#087fa9" />
      </radialGradient>
      <linearGradient id={`${uid}-token`} x1="0" y1="0" x2=".4" y2="1">
        <stop stopColor="#fff9e7" />
        <stop offset="1" stopColor="#eddfbd" />
      </linearGradient>
      <filter id={`${uid}-shadow`} x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="7" stdDeviation="7" floodColor="#193e47" floodOpacity=".3" />
      </filter>
      <clipPath id={`${uid}-tile`}>
        <polygon points={hexPoints(57.2)} />
      </clipPath>
    </>
  );
}

function SeaBackdrop({ uid, hexes }: { uid: string; hexes: { x: number; y: number }[] }) {
  return (
    <>
      <rect x="-335" y="-300" width="670" height="600" fill={`url(#${uid}-sea)`} />
      <g fill="none" stroke="#8ab5b0" strokeWidth="1.2" opacity=".25" aria-hidden="true">
        {Array.from({ length: 55 }, (_, i) => {
          const x = -325 + ((i * 137) % 650);
          const y = -285 + ((i * 79) % 575);
          return <path key={i} d={`M${x} ${y}q5 3 10 0t10 0m-15 6q5 2 10 0`} />;
        })}
        <ellipse rx="291" ry="263" strokeDasharray="2 9" opacity=".4" />
      </g>
      <g filter={`url(#${uid}-shadow)`}>
        {hexes.map((hex, i) => (
          <polygon
            key={i}
            points={hexPoints(60)}
            transform={`translate(${hex.x} ${hex.y})`}
            fill="#e8d9b3"
            stroke="#bdd1bc"
            strokeWidth="13"
            strokeLinejoin="round"
          />
        ))}
      </g>
    </>
  );
}

function Tree({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
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

function Sheep({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cy="6" rx="9" ry="2.5" fill="#68805a" opacity=".22" />
      <path d="M-5 1V6M3 1V6" stroke="#596254" strokeWidth="2" strokeLinecap="round" />
      <path d="M-7 0C-13-5-6-11-2-8 1-13 8-8 7-4 12 0 6 5 2 3-1 7-7 4-7 0" fill="#fff9e6" />
      <ellipse cx="8" cy="-1" rx="3" ry="4" fill="#586251" transform="rotate(-20 8 -1)" />
      <circle cx="9" cy="-2" r=".7" fill="#fff9e6" />
    </g>
  );
}

function Wheat({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) {
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

function TerrainArt({ terrain }: { terrain: Terrain }) {
  if (terrain === 'wood')
    return (
      <g>
        <path d="M-65 5Q-36-12-4 5T65-2V65H-65Z" fill="#69b554" />
        <path d="M-65 43Q-30 12 0 26T65 18V65H-65Z" fill="#31854b" />
        <path d="M-52-27Q-11-11 4-38M18 32Q24 15 48 7" fill="none" stroke="#b0bd8b" opacity=".5" strokeWidth="1.5" />
        <Tree x={-28} y={-12} scale={0.9} />
        <Tree x={-6} y={-27} scale={1.02} />
        <Tree x={22} y={-18} scale={0.94} />
        <Tree x={34} y={9} scale={0.72} />
        <Tree x={-32} y={23} scale={0.83} />
        <Tree x={17} y={38} scale={0.78} />
        <Tree x={-6} y={47} scale={0.63} />
      </g>
    );
  if (terrain === 'brick')
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
  if (terrain === 'sheep')
    return (
      <g>
        <path d="M-70-5Q-28-41 2-14T70-10V65H-70Z" fill="#badb65" />
        <path d="M-70 24Q-24-12 14 11T70 7V65H-70Z" fill="#77b342" />
        <path d="M-70 51Q-17 10 21 35T70 32V65H-70Z" fill="#95c84b" />
        <path d="M-50 4Q-34-10-17-7M10 38q22-8 41-3" fill="none" stroke="#d9e0a9" strokeWidth="1.3" />
        <Sheep x={-22} y={-23} scale={0.88} />
        <Sheep x={26} y={-11} scale={0.82} />
        <Sheep x={-23} y={27} scale={0.9} />
        <Sheep x={15} y={36} scale={0.73} />
        <path
          d="m-37-6-2-5m2 5 3-4m50-18-1-4m1 4 3-3m20 47-2-5m2 5 2-3"
          stroke="#73905e"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <g fill="#f8ecc1">
          <circle cx="-35" cy="13" r="1.4" />
          <circle cx="31" cy="26" r="1.4" />
          <circle cx="-6" cy="-36" r="1.3" />
        </g>
      </g>
    );
  if (terrain === 'wheat')
    return (
      <g>
        <path d="M-70-1Q-32-32 9-15T70-20V65H-70Z" fill="#f5cf61" />
        <path d="M-70 24Q-18-8 13 14T70 15V65H-70Z" fill="#d6a026" />
        <path
          d="M-70 38Q-17 8 12 30T70 29M-70 45Q-17 15 12 37T70 36M-70 52Q-17 22 12 44T70 43"
          fill="none"
          stroke="#ffe28b"
          strokeWidth="2.6"
        />
        <path d="M-50-18q21-10 41-3m17-10q18 1 33 10" fill="none" stroke="#ba994f" opacity=".65" strokeWidth="1.3" />
        <Wheat x={-29} y={-13} rotate={-12} />
        <Wheat x={-15} y={-24} rotate={5} />
        <Wheat x={22} y={-15} rotate={10} />
        <Wheat x={32} y={9} rotate={-8} />
        <Wheat x={-30} y={29} rotate={-14} />
        <Wheat x={10} y={40} rotate={9} />
      </g>
    );
  if (terrain === 'ore')
    return (
      <g>
        <path d="M-70 30-32-27-5 14 18-39 71 33V70H-70Z" fill="#647d83" />
        <path d="m-32-27 4 49L-5 14Zm50-12 4 62 49 10Z" fill="#809397" />
        <path d="m-45-7 13-20 13 20-9-4-5 7-5-7Zm49-9 14-23 18 25-12-6-6 7-6-9Z" fill="#e7e9dc" />
        <path d="M-67 53-22 2 6 34 30 6 67 53V70H-67Z" fill="#9caaa6" />
        <path d="m-22 2 4 51H6Zm52 4 2 47h35Z" fill="#7e9391" />
        <path d="m-34 17 12-15 12 15-8-3-5 4-5-5Zm55 0 9-11 9 14-8-5-5 5Z" fill="#d7dfd3" />
        <path d="m-37 37 8-5 6 4-3 9-10 1Zm55 6 7-5 8 6-4 6-9-1Z" fill="#5b7679" />
        <path d="m-37 37 9 2 5-3m-5 3-2 6m48-2 9 1 6 0m-6 0 2 6" fill="none" stroke="#afbfba" strokeWidth="1.2" />
      </g>
    );
  return (
    <g>
      <path d="M-70 0Q-25-38 5-9T70-13V65H-70Z" fill="#ead6ac" />
      <path d="M-70 28Q-22-18 14 14T70 11V65H-70Z" fill="#d4b987" />
      <path d="M-70 50Q-25 11 8 38T70 29V65H-70Z" fill="#e7cfa0" />
      <path d="M-44-8q21-13 41-7M12 32q18-6 36-1M-44 26q8-5 15-6" fill="none" stroke="#f8e8c4" strokeWidth="1.5" />
      <path
        d="M-22-23q3-12-1-18m1 5q-9-8-15-3m15 3q8-11 16-6m-16 6q-6-9-5-12m5 12q9-4 15 0"
        stroke="#8e9465"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="-23" cy="-21" rx="8" ry="2" fill="#b89f6f" opacity=".45" />
      <path d="m27 28 5-8 6 9Zm-51 9 4-6 8 6Z" fill="#bfa273" />
      <g fill="#bfa273">
        <circle cx="30" cy="-18" r="1.5" />
        <circle cx="23" cy="-16" r="1" />
        <circle cx="-28" cy="13" r="1" />
      </g>
    </g>
  );
}

function HexTile({ uid, terrain: kind }: { uid: string; terrain: Terrain }) {
  return (
    <>
      <polygon points={hexPoints(59)} fill="#e8d9b3" stroke="#cfbe96" strokeWidth="1.5" />
      <g clipPath={`url(#${uid}-tile)`} className="terrain-art">
        <polygon points={hexPoints(58)} fill={terrain[kind].color} />
        <TerrainArt terrain={kind} />
        <polygon points={hexPoints(56.5)} fill="none" stroke="#fff5d8" strokeOpacity=".18" strokeWidth="1.2" />
      </g>
    </>
  );
}

function NumberToken({ uid, number }: { uid: string; number: number }) {
  const red = number === 6 || number === 8;
  const pips = 6 - Math.abs(7 - number);
  return (
    <g className={`board-token${red ? ' board-token-hot' : ''}`} transform="translate(0 8)" aria-hidden="true">
      <circle cy="2" r="18.6" fill="#394a3d" opacity=".22" />
      <circle r="18" fill={`url(#${uid}-token)`} stroke="#bda77b" strokeWidth="1.2" />
      <circle r="15.5" fill="none" stroke="#fff8df" strokeWidth=".7" />
      <text textAnchor="middle" y="3.5" fill={red ? '#b8513f' : '#3c4942'}>
        {number}
      </text>
      {Array.from({ length: pips }, (_, index) => (
        <circle key={index} cx={(index - (pips - 1) / 2) * 3.5} cy="10" r="1.15" fill={red ? '#b8513f' : '#726d56'} />
      ))}
    </g>
  );
}

function Harbor({
  resource,
  at,
  corners,
}: {
  resource: Resource | 'any';
  at: { x: number; y: number };
  corners: { x: number; y: number }[];
}) {
  return (
    <>
      {corners.map((v, i) => (
        <g key={i}>
          <line x1={v.x} y1={v.y} x2={at.x} y2={at.y} stroke="#825329" strokeWidth="5" />
          <line x1={v.x} y1={v.y} x2={at.x} y2={at.y} stroke="#ffd278" strokeWidth="3" strokeDasharray="4 2" />
        </g>
      ))}
      <g transform={`translate(${at.x} ${at.y})`}>
        <path d="M-19 9H19L12 18H-10Z" fill="#c57b30" stroke="#714519" strokeWidth="1.5" />
        <path d="M-15-24H14L18 9H-18Z" fill="#fff9dc" stroke="#bd9d60" strokeWidth="1.5" />
        {resource === 'any' ? (
          <text textAnchor="middle" y="-8" fill="#304c56" fontSize="16" fontWeight="800">
            ?
          </text>
        ) : (
          <g transform="translate(-10 -23)">
            <ResourceIcon resource={resource} size={20} />
          </g>
        )}
        <text textAnchor="middle" y="6" fill="#253f49" fontSize="13" fontWeight="800">
          {resource === 'any' ? '3:1' : '2:1'}
        </text>
      </g>
    </>
  );
}

/** Mix a #rrggbb color toward white (amount > 0) or black (amount < 0). */
function tone(hex: string, amount: number): string {
  const target = amount > 0 ? 255 : 0;
  const mix = Math.abs(amount);
  const channels = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
  return `#${channels
    .map(c => Math.round(c + (target - c) * mix))
    .map(c => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Light comes from the upper left: roofs and road tops are lit, side walls are shaded. */
function pieceTones(color: string) {
  return { face: color, lit: tone(color, 0.3), shaded: tone(color, -0.28), line: tone(color, -0.62) };
}
type Tones = ReturnType<typeof pieceTones>;

const SHADOW = '#10261f';
/** Every edge on a piece: one width, one tone, slightly rounded corners. */
const edge = (tones: Tones, width = 1.15) => ({
  stroke: tones.line,
  strokeWidth: width,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
});
/** Depth of every block, drawn up and to the right. */
const DEPTH = { x: 7, y: -4 };

function Road({
  from: a,
  to: b,
  color,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
}) {
  const dx = (b.x - a.x) * 0.19;
  const dy = (b.y - a.y) * 0.19;
  const tones = pieceTones(color);
  // One bar drawn several times, nudged down for the shadow and side, up for the lit edge.
  const bar = (lift: number, stroke: string, width: number, opacity = 1, shift = 0) => (
    <line
      x1={a.x + dx + shift}
      y1={a.y + dy - lift}
      x2={b.x - dx + shift}
      y2={b.y - dy - lift}
      stroke={stroke}
      strokeOpacity={opacity}
      strokeWidth={width}
      strokeLinecap="round"
    />
  );
  return (
    <>
      {bar(-3.2, SHADOW, 10, 0.32, 1)}
      {bar(-1.8, tones.line, 9.6)}
      {bar(0, tones.line, 9.6)}
      {bar(-0.9, tones.shaded, 6.6)}
      {bar(0.5, tones.face, 5.8)}
      {bar(1.8, tones.lit, 1.6, 0.9)}
    </>
  );
}

/** Points for an SVG path. */
const path = (points: [number, number][]) => `M${points.map(([x, y]) => `${x} ${y}`).join('L')}Z`;

/**
 * A gabled block seen from the front-left: shaded side wall, lit roof with a fascia that
 * overhangs the walls, and the front wall. Returns handy points for doors and windows.
 */
function gable(
  x: number,
  base: number,
  width: number,
  wall: number,
  pitch: number,
  overhang: number,
  depth = DEPTH,
  fascia = 1.7,
) {
  const right = x + width;
  const peak = x + width / 2;
  const eave = base - wall;
  const ridge = eave - width * pitch;
  const drop = 2 * pitch * overhang;
  return {
    x,
    base,
    depth,
    fascia,
    right,
    peak,
    eave,
    ridge,
    /** Run and fall from the ridge to the outer right eave, for placing things on the roof. */
    slope: { x: width / 2 + overhang, y: width * pitch + drop },
    /** Bottom of the roof edge at its outer tips: anything hung below this sits under the roof. */
    underEaves: eave + drop + fascia,
    side: path([
      [right, eave + fascia],
      [right + depth.x, eave + fascia + depth.y],
      [right + depth.x, base + depth.y],
      [right, base],
    ]),
    roof: path([
      [peak, ridge],
      [peak + depth.x, ridge + depth.y],
      [right + overhang + depth.x, eave + drop + depth.y],
      [right + overhang, eave + drop],
    ]),
    front: path([
      [x, base],
      [x, eave + fascia],
      [peak, ridge + fascia],
      [right, eave + fascia],
      [right, base],
    ]),
    trim: path([
      [x - overhang, eave + drop],
      [peak, ridge],
      [right + overhang, eave + drop],
      [right + overhang, eave + drop + fascia],
      [peak, ridge + fascia],
      [x - overhang, eave + drop + fascia],
    ]),
  };
}

function Block({ shape, tones }: { shape: ReturnType<typeof gable>; tones: Tones }) {
  return (
    <>
      <path d={shape.side} fill={tones.shaded} {...edge(tones)} />
      <path d={shape.roof} fill={tones.lit} {...edge(tones)} />
      <path d={shape.front} fill={tones.face} {...edge(tones)} />
      <path d={shape.trim} fill={tones.lit} {...edge(tones)} />
    </>
  );
}

/** An arched opening (door or window) whose bottom edge sits at `y`. */
function Arch({ x, y, width, height, tones }: { x: number; y: number; width: number; height: number; tones: Tones }) {
  const r = width / 2;
  return (
    <path
      d={`M${x} ${y}V${y - height + r}a${r} ${r} 0 0 1 ${width} 0V${y}Z`}
      fill={tones.line}
      stroke={tones.line}
      strokeWidth=".6"
      strokeLinejoin="round"
    />
  );
}

/** A small window on the shaded side wall, skewed to follow it. */
function SideWindow({ x, y, tones, lean = DEPTH.y / DEPTH.x }: { x: number; y: number; tones: Tones; lean?: number }) {
  return (
    <path
      d={path([
        [x, y],
        [x + 2.6, y + 2.6 * lean],
        [x + 2.6, y + 2.6 * lean + 3.2],
        [x, y + 3.2],
      ])}
      fill={tones.line}
      stroke={tones.line}
      strokeWidth=".6"
      strokeLinejoin="round"
    />
  );
}

/** A chimney standing on the roof: `down` (0–1) from ridge to eave, `along` (0–1) front to back. */
function Chimney({
  shape,
  down,
  along,
  tones,
}: {
  shape: ReturnType<typeof gable>;
  down: number;
  along: number;
  tones: Tones;
}) {
  const x = shape.peak + shape.slope.x * down + shape.depth.x * along - 1.2;
  const y = shape.ridge + shape.slope.y * down + shape.depth.y * along + 1;
  return (
    <>
      <path
        d={path([
          [x, y],
          [x, y - 5],
          [x + 2.4, y - 5],
          [x + 2.4, y],
        ])}
        fill={tones.face}
        {...edge(tones)}
      />
      <path
        d={path([
          [x, y - 5],
          [x + 1.2, y - 5.7],
          [x + 3.6, y - 5.7],
          [x + 2.4, y - 5],
        ])}
        fill={tones.lit}
        {...edge(tones)}
      />
      <path
        d={path([
          [x + 2.4, y - 5],
          [x + 3.6, y - 5.7],
          [x + 3.6, y - 0.9],
          [x + 2.4, y],
        ])}
        fill={tones.shaded}
        {...edge(tones)}
      />
    </>
  );
}

/** v4's pieces: a gabled house, and a tall hall beside a house for a city. */
function ClassicPiece({ color, city }: { color: string; city: boolean }) {
  const tones = pieceTones(color);
  if (city) {
    const hall = gable(-15, 9, 11, 17, 0.75, 1.2);
    const house = gable(-3, 9.5, 12, 8.5, 0.55, 1.2);
    return (
      <g className="board-piece" transform="scale(1.2)">
        <Block shape={hall} tones={tones} />
        <Arch x={-11.2} y={-1} width={3.4} height={5} tones={tones} />
        <circle cx={hall.peak} cy={hall.ridge + 5.2} r="1.3" fill={tones.line} />
        <Block shape={house} tones={tones} />
        <Chimney shape={house} down={0.35} along={0.55} tones={tones} />
        <Arch x={1.2} y={9.5} width={3.6} height={5.2} tones={tones} />
        <SideWindow x={house.right + 2.2} y={4} tones={tones} />
      </g>
    );
  }
  const house = gable(-10, 9, 13, 9.5, 0.55, 1.3);
  return (
    <g className="board-piece" transform="scale(1.2)">
      <Block shape={house} tones={tones} />
      <Chimney shape={house} down={0.35} along={0.6} tones={tones} />
      <Arch x={-5.4} y={9} width={3.8} height={5.6} tones={tones} />
      <SideWindow x={house.right + 2.2} y={3.6} tones={tones} />
    </g>
  );
}

/** Chalets are deeper than classic pieces and carry a heavier roof edge. */
const CHALET_DEPTH = { x: 9, y: -5 };
const CHALET_FASCIA = 2.3;

/** A square window with a lit shutter on each side; (x, y) is the window's top center. */
function Shuttered({ x, y, tones, size = 2.6 }: { x: number; y: number; tones: Tones; size?: number }) {
  const half = size / 2;
  const square = (left: number, width: number) =>
    path([
      [left, y],
      [left + width, y],
      [left + width, y + size],
      [left, y + size],
    ]);
  return (
    <>
      <path d={square(x - half - 1.1, 1.1)} fill={tones.lit} {...edge(tones, 0.55)} />
      <path d={square(x + half, 1.1)} fill={tones.lit} {...edge(tones, 0.55)} />
      <path d={square(x - half, size)} fill={tones.line} {...edge(tones, 0.55)} />
    </>
  );
}

/** A stone ground floor across the front and side walls, `height` tall. */
function StoneBase({ shape, height, tones }: { shape: ReturnType<typeof gable>; height: number; tones: Tones }) {
  const { x, right, base, depth } = shape;
  const top = base - height;
  // Stone sits a step darker than the timber, light enough for the dark door to show.
  const front = tone(tones.face, -0.16);
  const side = tone(tones.shaded, -0.1);
  const joints = [x + 1.6, x + (right - x) * 0.45, right - 1.8]
    .map((cx, i) => `M${cx} ${top + (i % 2 ? 1.2 : 2.4)}h1.6`)
    .join('');
  return (
    <>
      <path
        d={path([
          [right, top],
          [right + depth.x, top + depth.y],
          [right + depth.x, base + depth.y],
          [right, base],
        ])}
        fill={side}
        {...edge(tones)}
      />
      <path
        d={path([
          [x, top],
          [right, top],
          [right, base],
          [x, base],
        ])}
        fill={front}
        {...edge(tones)}
      />
      <path d={joints} {...edge(tones, 0.55)} />
    </>
  );
}

/** A balcony across the front at `y`: a lit rail with posts, a little wider than the wall. */
function Balcony({ shape, y, tones }: { shape: ReturnType<typeof gable>; y: number; tones: Tones }) {
  const left = shape.x - 1;
  const right = shape.right + 1;
  const posts = Array.from({ length: Math.floor((right - left) / 2.4) - 1 }, (_, i) => left + 2.4 * (i + 1));
  return (
    <>
      <path
        d={path([
          [left, y],
          [right, y],
          [right, y + 2.6],
          [left, y + 2.6],
        ])}
        fill={tones.lit}
        {...edge(tones)}
      />
      <path d={posts.map(px => `M${px} ${y + 0.6}V${y + 2}`).join('')} {...edge(tones, 0.55)} />
    </>
  );
}

/** A mountain chalet: stone ground floor with a door, timber upper floor and balcony, framed gable. */
function Chalet({
  shape,
  tones,
  floors = 1,
}: {
  shape: ReturnType<typeof gable>;
  tones: Tones;
  /** Timber floors above the stone one; each gets a row of windows. */
  floors?: number;
}) {
  const width = shape.right - shape.x;
  const stone = 4;
  // The balcony hangs just under the roof's outer edge, so the overhang shelters it.
  const balcony = shape.underEaves + 0.5;
  const lean = shape.depth.y / shape.depth.x;
  // Each timber floor between the balcony and the stone gets one row of windows, centered in it.
  const floorTop = balcony + 2.6;
  const floorHeight = (shape.base - stone - floorTop) / floors;
  const windowRows = Array.from({ length: floors }, (_, i) => floorTop + i * floorHeight + (floorHeight - 2.6) / 2);
  return (
    <>
      <Block shape={shape} tones={tones} />
      <StoneBase shape={shape} height={stone} tones={tones} />
      <path
        d={`M${shape.peak} ${shape.ridge + shape.fascia}V${balcony}M${shape.peak} ${shape.ridge + shape.fascia + 1.4}L${shape.x + width * 0.25} ${balcony}M${shape.peak} ${shape.ridge + shape.fascia + 1.4}L${shape.x + width * 0.75} ${balcony}`}
        {...edge(tones, 0.6)}
      />
      <Balcony shape={shape} y={balcony} tones={tones} />
      {windowRows.map(y => (
        <g key={y}>
          <Shuttered x={shape.x + width * 0.27} y={y} tones={tones} />
          <Shuttered x={shape.x + width * 0.73} y={y} tones={tones} />
        </g>
      ))}
      {/* The door stands on the ground and stays inside the stone floor, clear of the windows. */}
      <Arch x={shape.peak - 1.5} y={shape.base} width={3} height={stone - 0.5} tones={tones} />
      <SideWindow x={shape.right + 3} y={windowRows[0]! + 3 * lean} lean={lean} tones={tones} />
    </>
  );
}

/** Mountain chalets: a single chalet, and for a city a tall chalet with a smaller one in front. */
function ChaletPiece({ color, city }: { color: string; city: boolean }) {
  const tones = pieceTones(color);
  if (city) {
    const hall = gable(-19, 7, 17, 19.5, 0.42, 2.8, CHALET_DEPTH, CHALET_FASCIA);
    const lodge = gable(-3, 11, 12, 15, 0.42, 2.4, CHALET_DEPTH, CHALET_FASCIA);
    return (
      <g className="board-piece" transform="scale(.95)">
        <Chalet shape={hall} tones={tones} floors={2} />
        <Chimney shape={hall} down={0.3} along={0.6} tones={tones} />
        <Chalet shape={lodge} tones={tones} />
      </g>
    );
  }
  const house = gable(-12, 9.5, 15, 16, 0.42, 2.6, CHALET_DEPTH, CHALET_FASCIA);
  return (
    <g className="board-piece" transform="scale(1)">
      <Chalet shape={house} tones={tones} />
      <Chimney shape={house} down={0.3} along={0.6} tones={tones} />
    </g>
  );
}

function BuildingPiece({ color, city, style = 'classic' }: { color: string; city: boolean; style?: PieceStyle }) {
  return style === 'chalet' ? <ChaletPiece color={color} city={city} /> : <ClassicPiece color={color} city={city} />;
}

function Robber() {
  return (
    <g className="board-robber" transform="translate(24 -20)">
      <ellipse cy="18" rx="12" ry="4" fill="#263d3e" opacity=".3" />
      <path
        d="M-6-1Q-9 4-7 10L-11 15Q-11 20 0 20T11 15L7 10Q9 4 6-1Z"
        fill="#34474a"
        stroke="#f1e0b6"
        strokeWidth="1.3"
      />
      <circle cy="-6" r="7" fill="#34474a" stroke="#f1e0b6" strokeWidth="1.3" />
      <path d="M-4-8q1-3 4-3M-5 3-3 12" stroke="#6d8080" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  );
}

function SeaDecorations() {
  return (
    <>
      <g className="board-decoration" transform="translate(-282 224)" aria-hidden="true">
        <circle r="20" fill="none" stroke="#c4d8c7" strokeWidth=".8" opacity=".35" />
        <path
          d="M0-27 5-6 0 0-5-6ZM0 27 5 6 0 0-5 6ZM-27 0-6-5 0 0-6 5ZM27 0 6-5 0 0 6 5Z"
          fill="#b7cfc1"
          opacity=".6"
        />
        <path d="M0-27V0L-5-6ZM0 27V0L5 6ZM-27 0H0L-6 5ZM27 0H0L6-5Z" fill="#dce3ca" opacity=".7" />
        <text x="0" y="-33" textAnchor="middle" fill="#d3dfcc" fontSize="10" fontFamily="Georgia, serif">
          N
        </text>
      </g>
      <g className="board-decoration" transform="translate(280 -205) rotate(12)" aria-hidden="true">
        <path d="M-19 18q17 4 33 0M-14 23q12 3 22 0" stroke="#bdd6c6" strokeWidth="1" fill="none" opacity=".4" />
        <path d="M-13 8H13L7 15H-7Z" fill="#d8c79a" />
        <path d="M0-25V9" stroke="#d8c79a" strokeWidth="1.8" />
        <path d="M-2-22-2 5H-18Z" fill="#f0e6c8" />
        <path d="M2-16V5H15Z" fill="#cbd7c3" />
      </g>
      <g stroke="#d7e0cb" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".65" aria-hidden="true">
        <path d="M-242-220q5-6 10 0 5-6 10 0M-270-202q4-5 8 0 4-5 8 0M250 228q5-6 10 0 5-6 10 0" />
      </g>
    </>
  );
}

function ResourceIcon({ resource, size = 22 }: { resource: Resource; size?: number }) {
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
      {resource === 'wood' && (
        <>
          <path d="M10 15h4v8h-4Z" fill="#9e5325" stroke="#58371e" />
          <path d="m12 1 7 9h-3l6 9H2l6-9H5Z" fill="#25a935" stroke="#155a27" strokeWidth="1.4" />
          <path d="m12 3-5 6h3l-5 8h7Z" fill="#65d03b" />
        </>
      )}
      {resource === 'brick' && (
        <>
          <rect x="1" y="4" width="22" height="16" rx="2" fill="#ed7449" stroke="#943f2e" strokeWidth="1.5" />
          <path d="M2 12h20M12 5v7M7 12v7m10-7v7" stroke="#ffdfaa" strokeWidth="2" />
        </>
      )}
      {resource === 'sheep' && (
        <>
          <path d="M6 16v5m9-5v5" stroke="#464b46" strokeWidth="2.8" />
          <path
            d="M3 13C-1 8 4 4 8 6 8 1 15 2 16 6c6-2 8 6 4 8 0 6-7 6-9 3-4 3-9 0-8-4Z"
            fill="#fffef1"
            stroke="#677d50"
            strokeWidth="1.5"
          />
          <ellipse cx="19" cy="13" rx="3" ry="4" fill="#46534b" />
          <circle cx="20" cy="12" r=".7" fill="white" />
        </>
      )}
      {resource === 'wheat' && (
        <>
          <path d="M12 23V5m0 14L5 12m7 2 7-7" stroke="#9c6813" strokeWidth="1.5" />
          <g fill="#ffc532" stroke="#b17b0b">
            <ellipse cx="12" cy="4" rx="2.5" ry="3.5" />
            {[8, 13, 18].map(y => (
              <g key={y}>
                <ellipse cx="8.5" cy={y} rx="2.3" ry="4" transform={`rotate(-40 8.5 ${y})`} />
                <ellipse cx="15.5" cy={y} rx="2.3" ry="4" transform={`rotate(40 15.5 ${y})`} />
              </g>
            ))}
          </g>
        </>
      )}
      {resource === 'ore' && (
        <>
          <path d="m2 19 5-13 5 5 5-9 6 17Z" fill="#698a9f" stroke="#35556a" strokeWidth="1.4" />
          <path d="m4 14 3-8 4 5-3-1Zm9-5 4-7 3 8-3-2Z" fill="#d3e9f0" />
          <path d="m2 19 8-5 5 6 8-1-5 4H6Z" fill="#98bccd" stroke="#35556a" strokeWidth="1.2" />
        </>
      )}
    </svg>
  );
}

function ResourceArt({ resource }: { resource: Resource }) {
  return (
    <svg className="cards-art" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="49" r="36" fill="currentColor" opacity=".08" />
      {resource === 'wood' && (
        <>
          <path d="M12 72Q40 55 88 72L85 88H15Z" fill="#aebf83" />
          <path d="M30 50v30M53 37v42M75 59v21" stroke="#7d5437" strokeWidth="5" />
          <path d="m30 13 16 29h-7l13 22H9l14-22h-7Z" fill="#315a3c" />
          <path d="m30 13v51H9l14-22h-7Z" fill="#537d48" />
          <path d="m53 5 17 31h-8l15 25H30l15-25h-8Z" fill="#254d3a" />
          <path d="m53 5v56H32l13-20h-8Z" fill="#446d45" />
          <path d="m75 29 14 26h-6l12 21H56l12-21h-6Z" fill="#426c42" />
          <path d="M19 83h11m36 3h15" stroke="#e7d9a7" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {resource === 'brick' && (
        <>
          <path d="m8 63 22-13 25 14-23 15Z" fill="#dc9a68" />
          <path d="m8 63 24 16v15L8 78Z" fill="#ad5e40" />
          <path d="m32 79 23-15v15L32 94Z" fill="#864637" />
          <path d="m43 61 23-14 26 14-24 16Z" fill="#e3a274" />
          <path d="m43 61 25 16v15L43 77Z" fill="#b36645" />
          <path d="m68 77 24-16v16L68 92Z" fill="#874a37" />
          <path d="m25 32 26-15 27 15-26 17Z" fill="#e4a16c" />
          <path d="m25 32 27 17v19L25 51Z" fill="#bd6f48" />
          <path d="m52 49 26-17v18L52 68Z" fill="#904c37" />
          <path
            d="m29 32 23 14 21-13M12 63l20 12 17-10m0-4 19 12 18-11"
            fill="none"
            stroke="#ffd49a"
            strokeWidth="2"
            opacity=".8"
          />
        </>
      )}
      {resource === 'sheep' && (
        <>
          <path d="M9 76Q48 57 92 76L87 89H14Z" fill="#99ae61" />
          <path d="M29 60v21m15-20v21m22-21v20" stroke="#4e5142" strokeWidth="6" strokeLinecap="round" />
          <path
            d="M19 55C7 44 16 31 29 32c-2-15 18-22 28-11 11-8 29 1 26 15 18 5 17 25 2 30-5 17-25 16-31 7-15 10-34 2-35-18"
            fill="#fff5d5"
            stroke="#c3ad7e"
            strokeWidth="2"
          />
          <path
            d="M28 34q-4 13 7 15m16-24q-7 13 5 20M22 55q12-7 18 3m11-4q12-8 20 1"
            fill="none"
            stroke="#dfcea6"
            strokeWidth="2"
          />
          <path d="M72 42q-8-8-8 0m15 1q11-8 13 0" fill="none" stroke="#4b5146" strokeWidth="6" strokeLinecap="round" />
          <ellipse cx="77" cy="53" rx="10" ry="15" fill="#4b5146" />
          <circle cx="81" cy="49" r="1.5" fill="#fff9e8" />
        </>
      )}
      {resource === 'wheat' && (
        <>
          <path d="M36 88Q38 55 26 21M51 89V11M64 88q-1-37 15-64" fill="none" stroke="#91680f" strokeWidth="3" />
          {[0, 1, 2].map(stalk => (
            <g
              key={stalk}
              transform={
                stalk === 0
                  ? 'translate(28 29) rotate(-13)'
                  : stalk === 1
                    ? 'translate(51 18)'
                    : 'translate(76 31) rotate(15)'
              }
              fill="#f6c431"
              stroke="#a7720a"
              strokeWidth="1.5"
            >
              {[0, 1, 2].map(level => (
                <g key={level} transform={`translate(0 ${level * 12})`}>
                  <ellipse cx="-5" cy="0" rx="4" ry="8" transform="rotate(-36 -5 0)" />
                  <ellipse cx="5" cy="0" rx="4" ry="8" transform="rotate(36 5 0)" />
                </g>
              ))}
              <ellipse cy="-12" rx="4" ry="9" />
            </g>
          ))}
          <path d="m29 78 42 2-2 9-38-2Z" fill="#9b683b" />
          <path d="m33 81 33 2" stroke="#e4b36a" strokeWidth="2" />
        </>
      )}
      {resource === 'ore' && (
        <>
          <path d="m6 82 21-49 17 18 19-41 31 72Z" fill="#5d707a" />
          <path d="m27 33 4 49H6Zm36-23 4 72h27Z" fill="#83949a" />
          <path d="m50 38 13-28 17 30-12-5-5 7-6-9ZM18 54l9-21 12 20-8-4-4 7-5-7Z" fill="#e9e9d7" />
          <path
            d="m17 72 17-7 13 13-11 17-19-6Zm38 3 18-10 15 14-12 16-20-3Z"
            fill="#a5b4b6"
            stroke="#40535b"
            strokeWidth="2"
          />
          <path
            d="m17 72 18 9 12-3m-12 3 1 14m19-20 19 8 14-4m-14 4 2 12"
            fill="none"
            stroke="#dee2d7"
            strokeWidth="2"
          />
        </>
      )}
    </svg>
  );
}

export const art = {
  version: 'v5',
  terrain,
  cardColors,
  ArtDefs,
  SeaBackdrop,
  HexTile,
  NumberToken,
  Harbor,
  Road,
  BuildingPiece,
  Robber,
  SeaDecorations,
  ResourceIcon,
  ResourceArt,
} satisfies ArtPack;
