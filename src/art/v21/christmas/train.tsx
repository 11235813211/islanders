import { useEffect, useMemo, useState } from 'react';
import { candyGraph } from '../../../../shared/maps/candy-train';
import type { BoardDesign, CandyRoute } from '../../../../shared/maps/types';
import type { ClassicResource } from '../../../../shared/types';
import { Candy } from './candies';
import { onRail, type RailSample, railPath } from './rail-geometry';

const CARGO: ClassicResource[] = ['sheep', 'ore', 'brick', 'wood', 'wheat'];

/** A small extruded locomotive or flatcar: yaw follows the rail, height stays upright. */
function Car({ x, y, angle, cargo }: { x: number; y: number; angle: number; cargo?: ClassicResource }) {
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
      {cargo ? (
        <>
          {box(-8, -4, 16, 1, 4, 2, '#8c3846', '#e4a359')}
          <g transform={`translate(${x} ${y - 5}) scale(.24)`}>
            <Candy resource={cargo} />
          </g>
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

/** A striped station sign sits beside the rails, leaving the building vertex available. */
function Station({ path, end, number }: { path: RailSample[]; end: boolean; number: number }) {
  const p = onRail(path, end ? path.at(-1)!.distance : 0);
  const x = p.x + Math.cos(p.angle) * (end ? 18 : -18) - Math.sin(p.angle) * 11,
    y = p.y + Math.sin(p.angle) * (end ? 18 : -18) + Math.cos(p.angle) * 11;
  return (
    <g className="candy-station" transform={`translate(${x} ${y})`}>
      <path d="M0 3V-13" stroke="#fff8e4" strokeWidth="3" />
      <path d="M0 3V-13" stroke="#cc3d56" strokeWidth="3" strokeDasharray="2 3" />
      <rect
        x="-15"
        y="-22"
        width="30"
        height="12"
        rx="3"
        fill={end ? '#883444' : '#256d55'}
        stroke="#ffdda0"
        strokeWidth="1"
      />
      <text y="-14" textAnchor="middle" fill="#fff9e9" fontSize="6.6" fontFamily="sans-serif" fontWeight="700">
        {end ? 'END' : 'START'} {number}
      </text>
    </g>
  );
}

function Train({ path, seconds }: { path: RailSample[]; seconds: number }) {
  const length = path.at(-1)!.distance;
  const cars = Math.max(1, Math.min(5, Math.floor((length - 20) / 21)));
  const span = cars * 21;
  const travel = Math.max(0, length - span - 10);
  const duration = Math.max(2, travel / 23);
  const cycle = duration * 2 + 4;
  const time = seconds % cycle;
  // The locomotive pulls out, pauses, then backs the same consist into the start station.
  let progress = 0;
  if (time > 2 && time <= duration + 2) progress = (time - 2) / duration;
  else if (time > duration + 2 && time <= duration + 4) progress = 1;
  else if (time > duration + 4) progress = 1 - (time - duration - 4) / duration;
  const front = 5 + span + progress * travel;
  const positions = Array.from({ length: cars + 1 }, (_, i) => ({ ...onRail(path, front - i * 21), i }));
  return (
    <g data-train-progress={progress.toFixed(3)}>
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
          <Car key={p.i} {...p} cargo={p.i ? CARGO[p.i - 1] : undefined} />
        ))}
    </g>
  );
}

function Railway({ path, seconds, number }: { path: RailSample[]; seconds: number; number: number }) {
  if (path.length < 2) return null;
  const length = path.at(-1)!.distance;
  const line = path.map(p => `${p.x},${p.y}`).join(' ');
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
      <Station path={path} end={false} number={number} />
      <Station path={path} end number={number} />
      <Train path={path} seconds={seconds} />
    </g>
  );
}

/** Editor-only rail preview, with a single animation clock and reduced-motion support. */
export function CandyRailways({ design, paused = false }: { design: BoardDesign; paused?: boolean }) {
  const paths = useMemo(() => {
    const graph = candyGraph(design.tiles);
    return (design.candyRoutes ?? []).map((route: CandyRoute) =>
      railPath(
        route.corners.flatMap(k => graph.get(k) ?? []),
        route.side,
      ),
    );
  }, [design.tiles, design.candyRoutes]);
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
      if (!paused && !media.matches && paths.some(p => p.length > 1)) frame = requestAnimationFrame(tick);
    };
    update();
    media.addEventListener('change', update);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener('change', update);
    };
  }, [paused, paths]);
  return (
    <g aria-label="Candy train preview">
      {paths.map((path, i) => (
        <Railway key={i} path={path} seconds={seconds} number={i + 1} />
      ))}
    </g>
  );
}
