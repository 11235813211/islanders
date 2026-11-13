import type { GameView } from '../../../shared/types';
import { CARTOGRAPHERS, SEA } from '../../art';
import type { BoardMode } from '../Board';
import { keyboardActivate } from './BoardConfirm';

type Point = { x: number; y: number };

/**
 * Every ship on the board. Your ships that may move, or become survey ships, are picked straight
 * from the piece (hover glows); in survey mode the ships that qualify glow until one is picked.
 */
export default function ShipPieces({
  view,
  mode,
  disabled,
  picked,
  ends,
  color,
  playerName,
  onShip,
}: {
  view: GameView;
  mode: BoardMode;
  disabled: boolean;
  /** The ship being moved or fitted out, once picked. */
  picked: string | null | undefined;
  ends: (edgeId: string) => readonly [Point, Point];
  color: (playerId: string) => string;
  playerName: (playerId: string) => string | undefined;
  onShip: (edgeId: string) => void;
}) {
  return (
    <>
      {Object.entries(view.ships).map(([edgeId, owner]) => {
        const [a, b] = ends(edgeId);
        const survey = view.surveys.includes(edgeId);
        const surveyable =
          !disabled && view.legal.surveys.includes(edgeId) && (mode === null || (mode === 'survey' && !picked));
        const movable = !disabled && mode !== 'move-ship' && mode !== 'survey' && !!view.legal.shipMoves[edgeId];
        const tappable = surveyable || movable;
        const className = [
          'board-ship-piece',
          mode === 'move-ship' && picked === edgeId ? 'board-ship-moving' : '',
          mode === 'survey' && picked === edgeId ? 'board-ship-picked' : '',
          tappable ? 'board-ship-movable' : '',
          mode === 'survey' && surveyable ? 'board-ship-glow' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const label = surveyable
          ? `Make the ship at ${edgeId} a survey ship`
          : movable
            ? `Move the ship at ${edgeId}`
            : `${playerName(owner)}'s ${survey ? 'survey ship' : 'ship'}`;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: role is set when the ship can be picked.
          <g
            key={edgeId}
            className={className}
            aria-label={label}
            role={tappable ? 'button' : undefined}
            tabIndex={tappable ? 0 : undefined}
            onClick={tappable ? () => onShip(edgeId) : undefined}
            onKeyDown={tappable ? event => keyboardActivate(event, () => onShip(edgeId)) : undefined}
          >
            <title>
              {playerName(owner)}&apos;s {survey ? 'survey ship' : 'ship'}
            </title>
            {survey ? (
              <CARTOGRAPHERS.SurveyShip from={a} to={b} color={color(owner)} />
            ) : (
              <SEA.Ship from={a} to={b} color={color(owner)} />
            )}
          </g>
        );
      })}
    </>
  );
}
