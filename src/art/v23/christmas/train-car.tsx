import type { ClassicResource } from '../../../../shared/types';
import { Candy } from './candies';

/** Candy on the flatcars when nothing says otherwise (the editor): one of each. */
export const CARGO: ClassicResource[] = ['sheep', 'ore', 'brick', 'wood', 'wheat'];
/** Cars are drawn at this size, and spaced CAR_GAP apart along the rails. */
const CAR_SCALE = 0.85;
export const CAR_GAP = 18;

/** A small extruded locomotive or flatcar: yaw follows the rail, height stays upright. */
export function Car({
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
    <g
      className="candy-train-car"
      data-cargo={cargo ?? 'engine'}
      transform={`translate(${x} ${y}) scale(${CAR_SCALE}) translate(${-x} ${-y})`}
    >
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
