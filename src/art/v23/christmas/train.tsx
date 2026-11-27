import { useEffect, useMemo, useRef, useState } from 'react';
import { candyGraph, type RailPoint } from '../../../../shared/maps/candy-train';
import type { BoardDesign, CandyRoute } from '../../../../shared/maps/types';
import type { ClassicResource } from '../../../../shared/types';
import { outlineTone } from '../solids';
import { Candy } from './candies';
import { cornerDistance, onRail, type RailSample, railPath } from './rail-geometry';

/** A road drawn on the board, which the rails may have to cross. */
export interface RailRoad {
  from: RailPoint;
  to: RailPoint;
  color: string;
}
interface Crossing extends RailPoint {
  road: number;
  color: string;
}

const CARGO: ClassicResource[] = ['sheep', 'ore', 'brick', 'wood', 'wheat'];

/** A small extruded locomotive or flatcar: yaw follows the rail, height stays upright. */
function Car({
  x,
  y,
  angle,
  cargo,
  empty = false,
}: {
  x: number;
  y: number;
  angle: number;
  cargo?: ClassicResource;
  /** A flatcar with nothing on it (the train hasn't been loaded, or its load is picked over). */
  empty?: boolean;
}) {
  const point = (u: number, v: number, z = 0) => [
    x + u * Math.cos(angle) - v * Math.sin(angle),
    y + u * Math.sin(angle) + v * Math.cos(angle) - z,
  ];
  const poly = (points: number[][]) => points.map(p => p.join(',')).join(' ');
  const box = (u: number, v: number, w: number, d: number, z: number, h: number, color: string, top: string) => {
    const lower = [point(u, v, z), point(u + w, v, z), point(u + w, v + d, z), point(u, v + d, z)];
    const upper = [point(u, v, z + h), point(u + w, v, z + h), point(u + w, v + d, z + h), point(u, v + d, z + h)];
    return (
      <g>
        {[0, 1, 2, 3]
          .filter(i => lower[i]![1]! + lower[(i + 1) % 4]![1]! >= y * 2)
          .map(i => (
            <polygon
              key={i}
              points={poly([lower[i]!, lower[(i + 1) % 4]!, upper[(i + 1) % 4]!, upper[i]!])}
              fill={color}
              stroke="#493e42"
              strokeWidth=".5"
            />
          ))}
        <polygon points={poly(upper)} fill={top} stroke="#775947" strokeWidth=".5" />
      </g>
    );
  };
  return (
    <g className="candy-train-car" data-cargo={cargo ?? 'engine'}>
      <ellipse cx={x + 1} cy={y + 2} rx="12" ry="5" fill="#183b47" opacity=".22" />
      {[-5, 5].flatMap(u =>
        [-4, 4].map(v => {
          const [cx, cy] = point(u, v, 1.6);
          return (
            <g key={`${u},${v}`}>
              <circle cx={cx} cy={cy} r="2.4" fill="#493441" />
              <circle cx={cx} cy={cy} r="1.3" fill="#f5c45d" />
            </g>
          );
        }),
      )}
      {box(-8, -4, 16, 8, 2, 2, '#9a3048', '#f5d594')}
      {cargo || empty ? (
        <>
          {box(-8, -4, 16, 1, 4, 2, '#8c3846', '#e4a359')}
          {cargo && (
            <g transform={`translate(${x} ${y - 5}) scale(.24)`}>
              <Candy resource={cargo} />
            </g>
          )}
          {box(-8, 3, 16, 1, 4, 2, '#a34a43', '#f7ca76')}
        </>
      ) : (
        <>
          {box(-7, -3.5, 6, 7, 4, 8, '#9f2b47', '#ffe2b0')}
          {box(-8, -4.5, 8, 9, 12, 1.5, '#386a54', '#d8f1de')}
          {box(0, -3, 7, 6, 4, 5, '#207456', '#64b992')}
          {box(4, -1.8, 2.8, 3.6, 9, 5, '#7f2941', '#ffd774')}
          <circle
            cx={point(8, 0, 7)[0]}
            cy={point(8, 0, 7)[1]}
            r="2"
            fill="#fff1b2"
            stroke="#d59e43"
            strokeWidth=".7"
          />
          <circle cx={point(-4, 3.6, 9)[0]} cy={point(-4, 3.6, 9)[1]} r="1.5" fill="#b8e9f0" />
        </>
      )}
    </g>
  );
}

/** Where a station's sign stands: beside the rails, off the corner a building may take. */
function stationSpot(path: RailSample[], end: boolean): RailPoint {
  const p = onRail(path, end ? path.at(-1)!.distance : 0);
  return {
    x: p.x + Math.cos(p.angle) * (end ? 18 : -18) - Math.sin(p.angle) * 11,
    y: p.y + Math.sin(p.angle) * (end ? 18 : -18) + Math.cos(p.angle) * 11,
  };
}

/** The dots under a number, as on the board's number tokens. */
const dots = (n: number) => 6 - Math.abs(7 - n);

/**
 * The start station: a striped post, like the END sign's, holding up the number that loads the
 * train (red for 6 and 8, as on the tiles). With no number set, "4/10": each game draws one of them.
 */
function StartSign({ path, number }: { path: RailSample[]; number?: number }) {
  const { x, y } = stationSpot(path, false);
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
function EndSign({ path }: { path: RailSample[] }) {
  const { x, y } = stationSpot(path, true);
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

/** Rail units a moving train covers per second between depots. */
const DEPOT_SPEED = 70;

/**
 * The locomotive's distance along the rails, easing to `target` whenever it changes (at
 * DEPOT_SPEED, eased at both ends); with reduced motion it jumps there.
 */
function useDrive(target: number): number {
  const [at, setAt] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || Math.abs(target - start) < 0.5) {
      from.current = target;
      setAt(target);
      return;
    }
    const seconds = Math.max(0.6, Math.abs(target - start) / DEPOT_SPEED);
    let began = 0;
    let frame = requestAnimationFrame(function step(now) {
      began ||= now;
      const t = Math.min(1, (now - began) / 1000 / seconds);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      from.current = start + (target - start) * eased;
      setAt(from.current);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return at;
}

function Train({
  path,
  seconds,
  cargo,
  parked,
  depot,
}: {
  path: RailSample[];
  seconds: number;
  cargo: ClassicResource[];
  parked: boolean;
  /** Parked trains: how far along the rails the locomotive stops (null: at the start station). */
  depot: number | null;
}) {
  const length = path.at(-1)!.distance;
  const cars = Math.max(1, Math.min(5, Math.floor((length - 20) / 21)));
  const span = cars * 21;
  const travel = Math.max(0, length - span - 10);
  const duration = Math.max(2, travel / 23);
  const cycle = duration * 2 + 4;
  const time = seconds % cycle;
  // The locomotive pulls out, pauses, then backs the same consist into the start station.
  let progress = 0;
  if (parked) progress = 0;
  else if (time > 2 && time <= duration + 2) progress = (time - 2) / duration;
  else if (time > duration + 2 && time <= duration + 4) progress = 1;
  else if (time > duration + 4) progress = 1 - (time - duration - 4) / duration;
  const home = 5 + span;
  const driven = useDrive(Math.min(length, Math.max(home, depot ?? home)));
  const front = parked ? driven : home + progress * travel;
  const positions = Array.from({ length: cars + 1 }, (_, i) => ({ ...onRail(path, front - i * 21), i }));
  return (
    <g data-train-progress={progress.toFixed(3)} data-train-front={front.toFixed(0)}>
      {positions.slice(1).map((p, i) => (
        <line
          key={p.i}
          x1={p.x}
          y1={p.y - 3}
          x2={positions[i]!.x}
          y2={positions[i]!.y - 3}
          stroke="#7b6b59"
          strokeWidth="1.3"
        />
      ))}
      {[...positions]
        .sort((a, b) => a.y - b.y)
        .map(p => (
          <Car key={p.i} {...p} cargo={p.i ? cargo[p.i - 1] : undefined} empty={p.i > cargo.length} />
        ))}
    </g>
  );
}

/** Where each road segment meets the rail line, with the road's direction for drawing the crossing. */
function crossings(path: RailSample[], roads: RailRoad[]): Crossing[] {
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
function RoadDeck({ crossing }: { crossing: Crossing }) {
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
function CrossingSigns({ crossing }: { crossing: Crossing }) {
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

function Railway({
  track,
  path,
  seconds,
  roads,
  parked,
}: {
  track: RailTrack;
  path: RailSample[];
  seconds: number;
  roads: RailRoad[];
  parked: boolean;
}) {
  if (path.length < 2) return null;
  const length = path.at(-1)!.distance;
  const line = path.map(p => `${p.x},${p.y}`).join(' ');
  const decks = crossings(path, roads);
  return (
    <g className="candy-railway" pointerEvents="none">
      <polyline points={line} fill="none" stroke="#ecf5f5" strokeWidth="13" strokeLinejoin="round" />
      {Array.from({ length: Math.floor(length / 7) + 1 }, (_, i) => {
        const p = onRail(path, i * 7);
        return (
          <path
            key={i}
            d="M0-4.8V4.8"
            transform={`translate(${p.x} ${p.y}) rotate(${(p.angle * 180) / Math.PI})`}
            stroke="#96734f"
            strokeWidth="2.4"
          />
        );
      })}
      {decks.map((crossing, i) => (
        <RoadDeck key={i} crossing={crossing} />
      ))}
      {[-1, 1].map(side => {
        const rail = path
          .map((p, i) => {
            const a = path[Math.max(0, i - 1)]!,
              b = path[Math.min(path.length - 1, i + 1)]!;
            const angle = Math.atan2(b.y - a.y, b.x - a.x);
            return `${p.x - Math.sin(angle) * 3 * side},${p.y + Math.cos(angle) * 3 * side}`;
          })
          .join(' ');
        return (
          <g key={side}>
            <polyline points={rail} fill="none" stroke="#496373" strokeWidth="2" strokeLinejoin="round" />
            <polyline points={rail} fill="none" stroke="#d1e4e8" strokeWidth=".8" strokeLinejoin="round" />
          </g>
        );
      })}
      {decks.map((crossing, i) => (
        <g key={i} className="candy-crossing">
          <CrossingSigns crossing={crossing} />
        </g>
      ))}
      <StartSign path={path} number={track.number} />
      <EndSign path={path} />
      <Train
        path={path}
        seconds={seconds}
        cargo={track.cargo ?? CARGO}
        parked={parked}
        depot={track.stop === undefined ? null : cornerDistance(path, track.stop, track.points.length)}
      />
    </g>
  );
}

/** One train's track to draw: its corners from the start station, and what it carries. */
export interface RailTrack {
  points: RailPoint[];
  side: 1 | -1;
  /** The roll that loads it; absent shows 4/10 (drawn each game). */
  number?: number;
  /** Candy on the flatcars; absent fills them with one of each, as in the editor. */
  cargo?: ClassicResource[];
  /** Parked trains: the corner (index into `points`) whose building the train is stopped at, as a depot. */
  stop?: number;
}

/** A design's tracks, for the editor and map previews. */
export function designTracks(design: BoardDesign): RailTrack[] {
  const graph = candyGraph(design.tiles);
  return (design.candyRoutes ?? []).map((route: CandyRoute) => ({
    points: route.corners.flatMap(k => graph.get(k) ?? []),
    side: route.side,
    ...(route.number !== undefined ? { number: route.number } : {}),
  }));
}

/**
 * Candy railways with a single animation clock and reduced-motion support; roads they meet get
 * level crossings. `parked` (in games) stops the shuttling: each train waits at its start station,
 * or drives to its `stop` and waits there while that building's owner picks.
 */
export function CandyRailways({
  tracks,
  paused = false,
  parked = false,
  roads = [],
}: {
  tracks: RailTrack[];
  paused?: boolean;
  parked?: boolean;
  roads?: RailRoad[];
}) {
  const paths = useMemo(() => tracks.map(t => railPath(t.points, t.side)), [tracks]);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0,
      previous = 0;
    const tick = (now: number) => {
      if (previous && now - previous >= 33) {
        const delta = Math.min(0.1, (now - previous) / 1000);
        setSeconds(s => s + delta);
        previous = now;
      }
      if (!previous) previous = now;
      frame = requestAnimationFrame(tick);
    };
    const update = () => {
      cancelAnimationFrame(frame);
      previous = 0;
      if (!paused && !parked && !media.matches && paths.some(p => p.length > 1)) frame = requestAnimationFrame(tick);
    };
    update();
    media.addEventListener('change', update);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener('change', update);
    };
  }, [paused, parked, paths]);
  return (
    <g aria-label="Candy trains">
      {paths.map((path, i) => (
        <Railway key={i} track={tracks[i]!} path={path} seconds={seconds} roads={roads} parked={parked} />
      ))}
    </g>
  );
}
