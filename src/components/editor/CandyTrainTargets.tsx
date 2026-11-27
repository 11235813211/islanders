import type { CSSProperties, ReactNode } from 'react';
import type { BoardDesign } from '../../../shared/maps';
import { candyExtensions, candyGraph } from '../../../shared/maps/candy-train';
import { keyboardActivate } from '../game/BoardConfirm';
import { CornerMark, EdgeMark } from '../game/TargetMarks';
import '../Board.css';

/** Hover color of the highlights: candy red, as the game uses the seat's color. */
const TARGET_STYLE = { '--target-color': '#c22a3a' } as CSSProperties;

/**
 * Where a route can go, drawn as the game's own targets: open corners to start at, then the road
 * highlight on each edge it can grow along, and earlier corners to trim back to. Pointer taps and
 * drags are read by the canvas (candyStepAt); these handle the keyboard and name each target.
 */
export default function CandyTrainTargets({
  design,
  route,
  choose,
}: {
  design: BoardDesign;
  route: number;
  choose: (key: string) => void;
}) {
  const selected = design.candyRoutes?.[route];
  if (!selected) return null;
  const graph = candyGraph(design.tiles);
  const keys = selected.corners.map(k => graph.get(k)?.key).filter((k): k is string => !!k);
  const last = keys.length ? graph.get(keys.at(-1)!)! : undefined;
  const open = candyExtensions(design, route).map(key => graph.get(key)!);
  const target = (key: string, label: string, className: string, mark: ReactNode) => (
    // biome-ignore lint/a11y/useSemanticElements: SVG targets support keyboard activation.
    <g
      key={key}
      className={`board-target candy-target ${className}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      onKeyDown={event => keyboardActivate(event, () => choose(key))}
    >
      {mark}
    </g>
  );
  return (
    <g className="candy-train-targets" style={TARGET_STYLE}>
      {!last &&
        open.map(p =>
          target(
            p.key,
            `Start train at ${p.key}`,
            'board-vertex-target',
            <g transform={`translate(${p.x} ${p.y})`}>
              <circle r="13" fill="transparent" className="board-hit-area" />
              <CornerMark />
            </g>,
          ),
        )}
      {last && open.map(p => target(p.key, `Train corner ${p.key}`, 'board-road-target', <EdgeMark a={last} b={p} />))}
      {keys.slice(0, -1).map(key => {
        const p = graph.get(key)!;
        return target(
          key,
          `Train corner ${key} selected`,
          'candy-trim',
          <g transform={`translate(${p.x} ${p.y})`}>
            <circle r="13" fill="transparent" className="board-hit-area" />
            <circle r="5" fill="#f7d376" stroke="#98405a" strokeWidth="2" />
          </g>,
        );
      })}
      {last && (
        <circle
          className="candy-head"
          cx={last.x}
          cy={last.y}
          r="7"
          fill="#fff9e9"
          stroke="#c22a3a"
          strokeWidth="2.5"
        />
      )}
    </g>
  );
}
