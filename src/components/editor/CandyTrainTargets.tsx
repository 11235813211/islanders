import type { BoardDesign } from '../../../shared/maps';
import { candyGraph } from '../../../shared/maps/candy-train';

/** Keyboard and touch targets expose only connected extensions or earlier corners to trim to. */
export default function CandyTrainTargets({
  design,
  route,
  choose,
}: {
  design: BoardDesign;
  route: number;
  choose: (key: string) => void;
}) {
  const graph = candyGraph(design.tiles);
  const selected = design.candyRoutes?.[route];
  if (!selected) return null;
  const keys = selected.corners.map(k => graph.get(k)?.key);
  const last = keys.at(-1);
  const targets = [...new Set(graph.values())].filter(
    p => !last || keys.includes(p.key) || graph.get(last)?.neighbors.has(p.key),
  );
  return (
    <g className="candy-train-targets">
      {targets.map(p => {
        const picked = keys.includes(p.key);
        const label = last ? `Train corner ${p.key}${picked ? ' selected' : ''}` : `Start train at ${p.key}`;
        return (
          <g key={p.key} transform={`translate(${p.x} ${p.y})`}>
            {/* biome-ignore lint/a11y/useSemanticElements: SVG targets support keyboard activation. */}
            <g
              className="candy-corner"
              role="button"
              tabIndex={0}
              aria-label={label}
              onClick={() => choose(p.key)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  choose(p.key);
                }
              }}
            >
              <circle r="13" fill="transparent" />
              <circle
                r={last === p.key ? 6 : 4.5}
                fill={picked ? '#f7d376' : '#fff9e9'}
                stroke="#98405a"
                strokeWidth="2"
              />
            </g>
            {selected.corners.length === 1 && picked && (
              <text y="-12" textAnchor="middle" fontSize="9" fill="#67283d">
                Start
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
