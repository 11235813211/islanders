import { chartScores, fullyCharted } from '../../../shared/rules';
import type { GameView, Hex } from '../../../shared/types';

/** One tile's claim: "Ana's finished chart: 1 point", or why it scores nothing now. */
function claimLabel(view: GameView, hex: Hex, name: string | undefined): string {
  return chartScores(view, hex)
    ? `${name}'s finished chart: 1 point`
    : `${name}'s finished chart: no point unless ${name} is alone beside it`;
}

/** A marker on each finished chart, in its claimer's color: 1 while it scores, 0 while it doesn't. */
export default function ChartClaims({
  view,
  color,
  playerName,
}: {
  view: GameView;
  color: (playerId: string) => string;
  playerName: (playerId: string) => string | undefined;
}) {
  const claimed = view.board.hexes.filter(hex => hex.chartedBy && fullyCharted(hex));
  return (
    <>
      {claimed.map(hex => {
        const scores = chartScores(view, hex);
        const label = claimLabel(view, hex, playerName(hex.chartedBy!));
        return (
          <g
            key={hex.id}
            className={`chart-claim${scores ? ' chart-claim-scores' : ''}`}
            aria-label={label}
            transform={`translate(${hex.x} ${hex.y - 34})`}
          >
            <title>{label}</title>
            <circle
              r="11"
              fill={scores ? color(hex.chartedBy!) : '#fffdf4'}
              stroke={color(hex.chartedBy!)}
              strokeWidth="3"
            />
            <text textAnchor="middle" dominantBaseline="central" fill={scores ? '#fff' : '#123d54'}>
              {scores ? 1 : 0}
            </text>
          </g>
        );
      })}
    </>
  );
}
