import type { GameView } from '../../../shared/types';
import { SurveyTarget } from '../../art';

/** Survey ships' targets: a small marker in the owner's color on each tile, side by side when several share one. */
export default function SurveyTargets({
  view,
  color,
  playerName,
}: {
  view: GameView;
  color: (playerId: string) => string;
  playerName: (playerId: string) => string | undefined;
}) {
  const byHex = new Map<string, string[]>();
  for (const edgeId of view.surveys) {
    const hexId = view.surveyTargets[edgeId];
    const owner = view.ships[edgeId];
    if (hexId && owner) byHex.set(hexId, [...(byHex.get(hexId) ?? []), owner]);
  }
  return (
    <>
      {view.board.hexes
        .filter(hex => byHex.has(hex.id))
        .map(hex => {
          const owners = byHex.get(hex.id)!;
          return (
            <g key={hex.id} className="board-piece" transform={`translate(${hex.x} ${hex.y - 31})`}>
              <title>{`Survey target of ${owners.map(playerName).join(', ')}`}</title>
              {owners.map((owner, i) => (
                <g key={`${owner}-${i}`} transform={`translate(${(i - (owners.length - 1) / 2) * 21} 0)`}>
                  <SurveyTarget color={color(owner)} />
                </g>
              ))}
            </g>
          );
        })}
    </>
  );
}
