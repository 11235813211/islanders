// Christmas Candy railways: each train's track is one or more legs. The train comes out of a tunnel
// at the start of the first leg, always drives forward, and goes into a tunnel at the end of each
// leg, coming out of the same-colored tunnel at the start of the next.
import { useEffect, useMemo, useRef, useState } from 'react';
import { candyGraph, type RailPoint } from '../../../../shared/maps/candy-train';
import type { BoardDesign, CandyRoute } from '../../../../shared/maps/types';
import type { ClassicResource } from '../../../../shared/types';
import { cornerDistance, onRail, type RailSample, railPath } from './rail-geometry';
import { CAR_GAP, CARGO, Car } from './train-car';
import {
  CrossingSigns,
  crossings,
  END_TUNNEL,
  EndSign,
  INTO_TUNNEL,
  type RailRoad,
  RoadDeck,
  StartSign,
  TUNNEL_COLORS,
  Tunnel,
} from './train-stations';

export type { RailRoad } from './train-stations';

/** Rail units a train covers per second. */
const SPEED = 55;
/** Seconds a train is wholly out of sight in a tunnel between two legs. */
const TUNNEL_SECONDS = 0.5;
/** Seconds a looping train (the editor's) waits in the start tunnel between runs. */
const TUNNEL_WAIT = 1.5;
/** How far a car's middle may be from a rail end and still show (the tunnel hides the rest). */
const PORTAL_DEPTH = 4;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** One leg of a train's track: corners in order, and the side of the edges its rails run on. */
export interface RailLeg {
  points: RailPoint[];
  side: 1 | -1;
}

/** One train's track to draw: its legs from the start tunnel, and what it carries. */
export interface RailTrack {
  legs: RailLeg[];
  /** The roll that loads it; absent shows both rolls with `dots` dots (drawn each game). */
  number?: number;
  /** Editor and previews: the route's dots, when no number is drawn yet. */
  dots?: number;
  /** Candy on the flatcars; absent fills them with one of each, as in the editor. */
  cargo?: ClassicResource[];
  /** Parked trains: the corner (counted through all legs) whose building the train is stopped at. */
  stop?: number;
}

/**
 * The legs laid end to end as one run: where each leg starts along it. Between legs the run has a
 * gap the whole train fits in plus TUNNEL_SECONDS of driving, the time it is out of sight.
 */
function runLayout(paths: RailSample[][], span: number) {
  const gap = span + 2 * PORTAL_DEPTH + TUNNEL_SECONDS * SPEED;
  const starts: number[] = [];
  let at = 0;
  for (const path of paths) {
    starts.push(at);
    at += path.at(-1)!.distance + gap;
  }
  return { starts, end: at - gap };
}

/**
 * A parked train's locomotive, as a distance along the run. It only drives forward: out of the
 * start tunnel to `depot` (its next stop), and with no stop on through the end tunnel, after which
 * it waits, unseen, back at `hidden`. A stop behind it means going round: out the end, in at the start.
 */
function useParkedFront(depot: number | null, hidden: number, exit: number): number {
  const [at, setAt] = useState(hidden);
  const from = useRef(hidden);
  useEffect(() => {
    const legs: [number, number][] = [];
    let start = from.current;
    if (depot === null || depot < start - 0.5) {
      if (start > hidden + 0.5) legs.push([start, exit]);
      start = hidden;
    }
    if (depot !== null && Math.abs(depot - start) > 0.5) legs.push([start, depot]);
    const final = depot ?? hidden;
    const settle = () => {
      from.current = final;
      setAt(final);
    };
    if (!legs.length || reducedMotion()) return settle();
    // Steady speed, so the time out of sight between legs is the same as in the editor.
    let leg = 0;
    let began = 0;
    let frame = requestAnimationFrame(function step(now) {
      const [a, b] = legs[leg]!;
      began ||= now;
      const t = Math.min(1, (now - began) / 1000 / Math.max(0.3, (b - a) / SPEED));
      from.current = a + (b - a) * t;
      setAt(from.current);
      if (t < 1) frame = requestAnimationFrame(step);
      else if (++leg < legs.length) {
        began = 0;
        frame = requestAnimationFrame(step);
      } else settle();
    });
    return () => cancelAnimationFrame(frame);
  }, [depot, hidden, exit]);
  return at;
}

/** Where along the run a corner lies, counting corners through all the legs. */
function cornerAlongRun(track: RailTrack, paths: RailSample[][], starts: number[], corner: number): number {
  let rest = corner;
  for (const [i, leg] of track.legs.entries()) {
    if (rest < leg.points.length) return starts[i]! + cornerDistance(paths[i]!, rest, leg.points.length);
    rest -= leg.points.length;
  }
  return starts.at(-1)! + paths.at(-1)!.at(-1)!.distance;
}

function Train({
  track,
  paths,
  seconds,
  parked,
}: {
  track: RailTrack;
  paths: RailSample[][];
  seconds: number;
  parked: boolean;
}) {
  const cargo = track.cargo ?? CARGO;
  const first = paths[0]!.at(-1)!.distance;
  const cars = Math.max(1, Math.min(5, Math.floor((Math.max(first, 60) - 20) / CAR_GAP)));
  const span = cars * CAR_GAP;
  const { starts, end } = runLayout(paths, span);
  // Wholly inside the start tunnel, and wholly inside the end one.
  const hidden = -PORTAL_DEPTH - 1;
  const exit = end + span + PORTAL_DEPTH + 1;
  // The editor's train loops: it waits in the start tunnel, then runs through to the end tunnel.
  const duration = (exit - hidden) / SPEED;
  const time = seconds % (duration + TUNNEL_WAIT);
  const progress = parked || time <= TUNNEL_WAIT ? 0 : (time - TUNNEL_WAIT) / duration;
  const depot = track.stop === undefined ? null : cornerAlongRun(track, paths, starts, track.stop);
  const driven = useParkedFront(depot === null ? null : Math.max(span + 5, depot), hidden, exit);
  // With reduced motion the editor's train stands just out of the start tunnel.
  const still = !parked && seconds === 0 && reducedMotion();
  const front = parked ? driven : still ? Math.min(first, span + 5) : hidden + progress * (exit - hidden);
  const positions = Array.from({ length: cars + 1 }, (_, i) => {
    const d = front - i * CAR_GAP;
    const leg = Math.max(0, starts.filter(s => s <= d + PORTAL_DEPTH).length - 1);
    const along = d - starts[leg]!;
    const length = paths[leg]!.at(-1)!.distance;
    return { ...onRail(paths[leg]!, along), i, shown: along >= PORTAL_DEPTH && along <= length - PORTAL_DEPTH };
  });
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
          visibility={p.shown && positions[i]!.shown ? undefined : 'hidden'}
        />
      ))}
      {[...positions]
        .sort((a, b) => a.y - b.y)
        .map(p => (
          <g key={p.i} visibility={p.shown ? undefined : 'hidden'}>
            <Car {...p} cargo={p.i ? cargo[p.i - 1] : undefined} empty={p.i > cargo.length} />
          </g>
        ))}
    </g>
  );
}

/** Distances along a plain point list, so sleepers can be spaced on it. */
function withDistances(points: RailPoint[]): RailSample[] {
  let distance = 0;
  return points.map((p, i) => {
    if (i) distance += Math.hypot(p.x - points[i - 1]!.x, p.y - points[i - 1]!.y);
    return { x: p.x, y: p.y, distance };
  });
}

/** The rails' line run on INTO_TUNNEL at both ends, under the tunnel mounds. */
function intoTunnels(path: RailSample[]): RailSample[] {
  const a = onRail(path, 0);
  const b = onRail(path, path.at(-1)!.distance);
  return withDistances([
    { x: a.x - Math.cos(a.angle) * INTO_TUNNEL, y: a.y - Math.sin(a.angle) * INTO_TUNNEL },
    ...path,
    { x: b.x + Math.cos(b.angle) * INTO_TUNNEL, y: b.y + Math.sin(b.angle) * INTO_TUNNEL },
  ]);
}

/** One leg's track bed, sleepers, rails, and level crossings. */
function Rails({ path, roads }: { path: RailSample[]; roads: RailRoad[] }) {
  const line = intoTunnels(path);
  const length = line.at(-1)!.distance;
  const decks = crossings(path, roads);
  return (
    <>
      <polyline
        points={line.map(p => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke="#ecf5f5"
        strokeWidth="13"
        strokeLinejoin="round"
      />
      {Array.from({ length: Math.floor(length / 7) + 1 }, (_, i) => {
        const p = onRail(line, i * 7);
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
        const rail = line
          .map((p, i) => {
            const a = line[Math.max(0, i - 1)]!,
              b = line[Math.min(line.length - 1, i + 1)]!;
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
    </>
  );
}

/** Which part of the railways to draw: the track bed, the cars with tunnels and signs, or both. */
export type RailLayer = 'all' | 'rails' | 'cars';

/** A tunnel's arch color: gray at the line's two ends, else the color pairing it with the other leg's tunnel. */
function tunnelColor(legs: number, leg: number, end: boolean): string {
  if (end) return leg === legs - 1 ? END_TUNNEL : TUNNEL_COLORS[leg % TUNNEL_COLORS.length]!;
  return leg === 0 ? END_TUNNEL : TUNNEL_COLORS[(leg - 1) % TUNNEL_COLORS.length]!;
}

function Railway({
  track,
  paths,
  seconds,
  roads,
  parked,
  layer,
}: {
  track: RailTrack;
  paths: RailSample[][];
  seconds: number;
  roads: RailRoad[];
  parked: boolean;
  layer: RailLayer;
}) {
  if (!paths.length) return null;
  const last = paths.length - 1;
  const rails = (
    <g className="candy-railway" pointerEvents="none">
      {paths.map((path, i) => (
        <Rails key={i} path={path} roads={roads} />
      ))}
    </g>
  );
  const cars = (
    <g className="candy-railway-cars" pointerEvents="none">
      <Train track={track} paths={paths} seconds={seconds} parked={parked} />
      {paths.flatMap((path, i) =>
        [false, true].map(end => (
          <Tunnel key={`${i}-${end}`} path={path} end={end} color={tunnelColor(paths.length, i, end)} />
        )),
      )}
      <StartSign path={paths[0]!} side={track.legs[0]!.side} number={track.number} dots={track.dots} />
      <EndSign path={paths[last]!} side={track.legs[last]!.side} />
    </g>
  );
  if (layer === 'rails') return rails;
  if (layer === 'cars') return cars;
  return (
    <>
      {rails}
      {cars}
    </>
  );
}

/** A design's tracks, for the editor and map previews: one leg per route. */
export function designTracks(design: BoardDesign): RailTrack[] {
  const graph = candyGraph(design.tiles);
  return (design.candyRoutes ?? []).map((route: CandyRoute) => ({
    legs: [{ points: route.corners.flatMap(k => graph.get(k) ?? []), side: route.side }],
    ...(route.dots !== undefined ? { dots: route.dots } : {}),
  }));
}

/** Each drawable leg's rail line (legs too short to draw are left out). */
function trackPaths(track: RailTrack): RailSample[][] {
  return track.legs.map(leg => railPath(leg.points, leg.side)).filter(path => path.length > 1);
}

/**
 * Candy railways with a single animation clock and reduced-motion support; roads they meet get
 * level crossings. `parked` (in games) stops the looping: each train waits in its start tunnel,
 * or drives to its `stop` and waits there while that building's owner picks.
 */
export function CandyRailways({
  tracks,
  paused = false,
  parked = false,
  roads = [],
  layer = 'all',
}: {
  tracks: RailTrack[];
  paused?: boolean;
  parked?: boolean;
  roads?: RailRoad[];
  /** Boards with pieces draw the rails over roads, then the cars among the buildings (see trainInFront). */
  layer?: RailLayer;
}) {
  const paths = useMemo(() => tracks.map(trackPaths), [tracks]);
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
      if (!paused && !parked && !media.matches && paths.some(p => p.length)) frame = requestAnimationFrame(tick);
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
      {paths.map((legs, i) => (
        <Railway
          key={i}
          track={tracks[i]!}
          paths={legs}
          seconds={seconds}
          roads={roads}
          parked={parked}
          layer={layer}
        />
      ))}
    </g>
  );
}

/** How near the rails a building must stand for the cars to pass in front of or behind it. */
const NEAR_RAILS = 40;

/** The point of segment a–b nearest `p`. */
function nearestOn(p: RailPoint, a: RailPoint, b: RailPoint): RailPoint {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length ** 2));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Whether trains pass in front of a piece standing at `p`: the rails nearest it run lower on the
 * screen, so a car there overlaps the piece's base. Pieces away from every track never meet a car.
 */
export function trainInFront(tracks: RailTrack[], p: RailPoint): boolean {
  let nearest: RailPoint | undefined;
  let distance = NEAR_RAILS;
  for (const path of tracks.flatMap(trackPaths))
    for (let i = 1; i < path.length; i++) {
      const point = nearestOn(p, path[i - 1]!, path[i]!);
      const d = Math.hypot(point.x - p.x, point.y - p.y);
      if (d < distance) {
        nearest = point;
        distance = d;
      }
    }
  return !!nearest && nearest.y > p.y;
}
