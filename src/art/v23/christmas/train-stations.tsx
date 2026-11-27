// What stands along a candy railway: tunnel mouths at the ends of each leg, the start sign with
// the train's number, the END sign, and level crossings where roads meet the rails.
import type { RailPoint } from '../../../../shared/maps/candy-train';
import { outlineTone } from '../solids';
import { onRail, type RailSample } from './rail-geometry';

/** A road drawn on the board, which the rails may have to cross. */
export interface RailRoad {
  from: RailPoint;
  to: RailPoint;
  color: string;
}

/** Arch colors of the tunnels joining one leg to the next, in order; the line's two ends are gray. */
export const TUNNEL_COLORS = ['#3d9a5b', '#cc3d56', '#3a6fc4', '#8a4fc0', '#d9a429'];
export const END_TUNNEL = '#8d969e';
/** How far the rails run on into a tunnel, under its mound. */
export const INTO_TUNNEL = 12;

/** A rail end and the direction into its tunnel: on along the track at the end, back at the start. */
function railEnd(path: RailSample[], end: boolean) {
  const p = onRail(path, end ? path.at(-1)!.distance : 0);
  const angle = end ? p.angle : p.angle + Math.PI;
  return { x: p.x, y: p.y, dx: Math.cos(angle), dy: Math.sin(angle) };
}

/**
 * Where a station's sign stands: beside its tunnel on the tile's side of the rails (`side`, as
 * railPath offsets them), away from the corner where a building may stand.
 */
function stationSpot(path: RailSample[], end: boolean, side: 1 | -1): RailPoint {
  const p = onRail(path, end ? path.at(-1)!.distance : 0);
  const back = end ? -2 : 2;
  return {
    x: p.x + Math.cos(p.angle) * back - Math.sin(p.angle) * side * 15,
    y: p.y + Math.sin(p.angle) * back + Math.cos(p.angle) * side * 15,
  };
}

/** The dots under a number, as on the board's number tokens. */
const dots = (n: number) => 6 - Math.abs(7 - n);

/**
 * The start station: a striped post, like the END sign's, holding up the number that loads the
 * train (red for 6 and 8, as on the tiles). With no number set, "4/10": each game draws one of them.
 */
export function StartSign({ path, side, number }: { path: RailSample[]; side: 1 | -1; number?: number }) {
  const { x, y } = stationSpot(path, false, side);
  const red = number === 6 || number === 8;
  const count = number === undefined ? 0 : dots(number);
  return (
    <g className="candy-station candy-start" transform={`translate(${x} ${y})`} data-number={number ?? ''}>
      <path d="M0 3V-12" stroke="#fff8e4" strokeWidth="3" />
      <path d="M0 3V-12" stroke="#cc3d56" strokeWidth="3" strokeDasharray="2 3" />
      <circle cy="-22" r="11" fill="#fff6dc" stroke="#cc3d56" strokeWidth="2" />
      <text
        y={number === undefined ? -19.8 : -20.4}
        textAnchor="middle"
        fill={red ? '#c22a3a' : '#33282a'}
        fontSize={number === undefined ? 6.4 : 11}
        fontFamily="sans-serif"
        fontWeight="800"
      >
        {number ?? '4/10'}
      </text>
      {Array.from({ length: count }, (_, i) => (
        <circle key={i} cx={(i - (count - 1) / 2) * 2.4} cy="-15.2" r=".85" fill={red ? '#c22a3a' : '#33282a'} />
      ))}
    </g>
  );
}

/** The end of the line: a striped post with an END board. */
export function EndSign({ path, side }: { path: RailSample[]; side: 1 | -1 }) {
  const { x, y } = stationSpot(path, true, side);
  return (
    <g className="candy-station candy-end" transform={`translate(${x} ${y})`}>
      <path d="M0 3V-13" stroke="#fff8e4" strokeWidth="3" />
      <path d="M0 3V-13" stroke="#cc3d56" strokeWidth="3" strokeDasharray="2 3" />
      <rect x="-11" y="-22" width="22" height="12" rx="3" fill="#883444" stroke="#ffdda0" strokeWidth="1" />
      <text y="-14" textAnchor="middle" fill="#fff9e9" fontSize="6.6" fontFamily="sans-serif" fontWeight="700">
        END
      </text>
    </g>
  );
}

/** Mound and arch sizes, in board units (the arch is the mouth's upright face). */
const MOUND = { radius: 12, rise: 12, back: 11 };
const ARCH = { half: 8, high: 10.5, inner: 0.72 };

/** An upright arch across the track at `at`, its face square to the rails (along `ux`, `uy`). */
function archPath(at: RailPoint, ux: number, uy: number, half: number, high: number): string {
  const points = Array.from({ length: 13 }, (_, i) => {
    const t = (Math.PI * i) / 12;
    const s = half * Math.cos(t);
    return `${at.x + ux * s},${at.y + uy * s - high * Math.sin(t)}`;
  });
  return `M${points.join('L')}Z`;
}

/**
 * A tunnel mouth at one end of a leg: a snowy mound over the rails with an arch in `color`, its
 * face square to the track, drawn over the cars so the train slips in and out of it. Two tunnels
 * of one color are the same tunnel. A track running down the screen into it hides the face.
 */
export function Tunnel({ path, end, color }: { path: RailSample[]; end: boolean; color: string }) {
  const { x, y, dx, dy } = railEnd(path, end);
  const face = { x: x + dx * 2, y: y + dy * 2 };
  const m = { x: x + dx * MOUND.back, y: y + dy * MOUND.back };
  const { radius: r, rise: h } = MOUND;
  // Across the track, on the ground.
  const ux = -dy;
  const uy = dx;
  const mound = `M${m.x - r},${m.y}C${m.x - r},${m.y - h * 1.3} ${m.x + r},${m.y - h * 1.3} ${m.x + r},${m.y}A${r} ${r * 0.55} 0 0 1 ${m.x - r},${m.y}Z`;
  return (
    <g className="candy-tunnel" data-color={color} pointerEvents="none">
      <path d={mound} fill="#eef5f9" stroke="#a9c3d2" strokeWidth="1" />
      <path
        d={`M${m.x - r * 0.6},${m.y - h * 0.55}Q${m.x - r * 0.3},${m.y - h * 0.9} ${m.x + r * 0.1},${m.y - h * 0.92}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d={`M${m.x - r},${m.y}A${r} ${r * 0.55} 0 0 0 ${m.x + r},${m.y}`}
        fill="none"
        stroke={color}
        strokeWidth="2.6"
      />
      {/* A flag in the tunnel's color on top, so a pair reads even where the arch faces away. */}
      <path d={`M${m.x + 2},${m.y - h}v-11`} stroke="#6b5a4a" strokeWidth="1.2" />
      <path d={`M${m.x + 2.6},${m.y - h - 11}l8 2.6-8 2.6Z`} fill={color} stroke="#fff8e4" strokeWidth=".6" />
      {dy < 0.15 && (
        <>
          <path
            d={archPath(face, ux, uy, ARCH.half, ARCH.high)}
            fill={color}
            stroke="#fff8e4"
            strokeWidth="1.4"
            strokeDasharray="2.2 2.2"
          />
          <path d={archPath(face, ux, uy, ARCH.half * ARCH.inner, ARCH.high * ARCH.inner)} fill="#2a2430" />
        </>
      )}
    </g>
  );
}

export interface Crossing extends RailPoint {
  road: number;
  color: string;
}

/** Where each road segment meets the rail line, with the road's direction for drawing the crossing. */
export function crossings(path: RailSample[], roads: RailRoad[]): Crossing[] {
  const found: Crossing[] = [];
  for (const { from: a, to: b, color } of roads) {
    const rx = b.x - a.x,
      ry = b.y - a.y;
    for (let i = 1; i < path.length; i++) {
      const p = path[i - 1]!,
        q = path[i]!;
      const sx = q.x - p.x,
        sy = q.y - p.y;
      const denominator = rx * sy - ry * sx;
      if (Math.abs(denominator) < 1e-9) continue;
      const t = ((p.x - a.x) * sy - (p.y - a.y) * sx) / denominator;
      const u = ((p.x - a.x) * ry - (p.y - a.y) * rx) / denominator;
      if (t >= 0 && t <= 1 && u >= 0 && u < 1)
        found.push({ x: a.x + rx * t, y: a.y + ry * t, road: Math.atan2(ry, rx), color });
    }
  }
  return found;
}

/** A small candy-striped crossbuck on a post. */
function Crossbuck({ x, y }: RailPoint) {
  const bar = 'M-5-3.2 5 3.2M-5 3.2 5-3.2';
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cy="1" rx="3" ry="1.2" fill="#183b47" opacity=".25" />
      <path d="M0 1V-14" stroke="#fff8e4" strokeWidth="1.8" />
      <path d="M0 1V-14" stroke="#cc3d56" strokeWidth="1.8" strokeDasharray="1.6 2" />
      <g transform="translate(0 -15)">
        <path d={bar} stroke="#7d2238" strokeWidth="3" strokeLinecap="round" />
        <path d={bar} stroke="#fffaf0" strokeWidth="2" strokeLinecap="round" />
        <path d={bar} stroke="#d5304b" strokeWidth="2" strokeDasharray="1.4 1.6" />
      </g>
    </g>
  );
}

/** The road carried across the track bed, so it reads as a level crossing rather than a gap. */
export function RoadDeck({ crossing }: { crossing: Crossing }) {
  const dx = Math.cos(crossing.road) * 9,
    dy = Math.sin(crossing.road) * 9;
  const bar = (stroke: string, width: number) => (
    <line
      x1={crossing.x - dx}
      y1={crossing.y - dy}
      x2={crossing.x + dx}
      y2={crossing.y + dy}
      stroke={stroke}
      strokeWidth={width}
    />
  );
  return (
    <>
      {bar(outlineTone(crossing.color), 9.6)}
      {bar('#e9dccb', 8)}
      {bar(crossing.color, 5.8)}
    </>
  );
}

/** A sign on each road approach, beside the road on its upper side and clear of the track bed. */
export function CrossingSigns({ crossing }: { crossing: Crossing }) {
  const along = { x: Math.cos(crossing.road), y: Math.sin(crossing.road) };
  // The road's normal that points up the screen, so the posts stand behind the road.
  const side = along.x >= 0 ? { x: along.y, y: -along.x } : { x: -along.y, y: along.x };
  return (
    <>
      {[1, -1].map(d => (
        <Crossbuck
          key={d}
          x={crossing.x + d * along.x * 12 + side.x * 6}
          y={crossing.y + d * along.y * 12 + side.y * 6}
        />
      ))}
    </>
  );
}
