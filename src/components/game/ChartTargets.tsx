import { hexNumbers } from '../../../shared/rules';
import type { GameView } from '../../../shared/types';
import { TERRAIN } from '../../art';
import { hexPoints } from '../../lib/geometry';
import { keyboardActivate } from './BoardConfirm';

/** Tiles a survey ship may chart after a 7, the ones picked so far (a tile may repeat), and a pick. */
export interface ChartPicking {
  hexes: string[];
  picks: string[];
  onPick: (hexId: string) => void;
}

/** Outlines on every tile that can be charted; picked tiles are filled in and show how many times. */
export default function ChartTargets({ view, chart }: { view: GameView; chart: ChartPicking }) {
  const hexes = new Set(chart.hexes);
  return (
    <g className="board-chart-targets">
      {view.board.hexes
        .filter(hex => hexes.has(hex.id))
        .map(hex => {
          const times = chart.picks.filter(id => id === hex.id).length;
          return (
            <g
              key={hex.id}
              className={`board-target board-chart-target${times ? ' board-target-selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`Chart ${TERRAIN[hex.terrain].name}, number ${hexNumbers(hex).join('-')}${times ? `, picked ${times}` : ''}`}
              aria-pressed={times > 0}
              onClick={() => chart.onPick(hex.id)}
              onKeyDown={event => keyboardActivate(event, () => chart.onPick(hex.id))}
              transform={`translate(${hex.x} ${hex.y})`}
            >
              <polygon
                points={hexPoints(52)}
                fill={times ? 'rgba(145, 104, 184, .28)' : 'transparent'}
                stroke={times ? '#f6eefc' : '#e7d8f4'}
                strokeWidth={times ? 3.5 : 2.5}
                strokeDasharray={times ? undefined : '3 5'}
              />
              {times > 0 && (
                <g transform="translate(0 -34)">
                  <circle r="10" fill="#7a5a99" stroke="#f6eefc" strokeWidth="2" />
                  <text textAnchor="middle" y="4.5" fontSize="13" fontWeight="800" fill="#fff">
                    {times}
                  </text>
                </g>
              )}
            </g>
          );
        })}
    </g>
  );
}
