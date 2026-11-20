import { chartScorer, fullyCharted } from '../../../shared/rules';
import type { GameView } from '../../../shared/types';

/** A marker on each fully charted tile: 1 in the scorer's color, or 0 while no one player is alone there. */
export default function FinishedCharts({
  view,
  color,
  playerName,
}: {
  view: GameView;
  color: (playerId: string) => string;
  playerName: (playerId: string) => string | undefined;
}) {
  return (
    <>
      {view.board.hexes.filter(fullyCharted).map(hex => {
        const scorer = chartScorer(view, hex);
        const label = scorer
          ? `Finished chart: 1 point for ${playerName(scorer)}`
          : 'Finished chart: 1 point for a player alone beside it';
        return (
          <g
            key={hex.id}
            className={`finished-chart${scorer ? ' finished-chart-scores' : ''}`}
            aria-label={label}
            transform={`translate(${hex.x} ${hex.y - 34})`}
          >
            <title>{label}</title>
            <circle
              r="11"
              fill={scorer ? color(scorer) : '#fffdf4'}
              stroke={scorer ? color(scorer) : '#123d54'}
              strokeWidth="3"
            />
            <text textAnchor="middle" dominantBaseline="central" fill={scorer ? '#fff' : '#123d54'}>
              {scorer ? 1 : 0}
            </text>
          </g>
        );
      })}
    </>
  );
}
