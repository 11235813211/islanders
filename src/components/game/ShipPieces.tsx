import { allPieces } from '../../../shared/crossings';
import type { GameView } from '../../../shared/types';
import { SEA } from '../../art';
import type { BoardMode } from '../Board';
import { keyboardActivate } from './BoardConfirm';
import { pieceEnds } from './sharedEdges';

type Point = { x: number; y: number };

/**
 * Every ship on the board. Your ships that may move are picked straight from the piece (hover glows).
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
  /** The ship being moved, once picked. */
  picked: string | null | undefined;
  ends: (edgeId: string) => readonly [Point, Point];
  color: (playerId: string) => string;
  playerName: (playerId: string) => string | undefined;
  onShip: (edgeId: string) => void;
}) {
  return (
    <>
      {allPieces(view, 'ship').map(([edgeId, owner]) => {
        const [a, b] = pieceEnds(view, edgeId, owner, ends(edgeId));
        const mine = owner === view.selfId;
        const movable = mine && !disabled && mode !== 'move-ship' && !!view.legal.shipMoves[edgeId];
        const className = [
          'board-ship-piece',
          mode === 'move-ship' && mine && picked === edgeId ? 'board-ship-moving' : '',
          movable ? 'board-ship-movable' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const label = movable ? `Move the ship at ${edgeId}` : `${playerName(owner)}'s ship`;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: role is set when the ship can be picked.
          <g
            key={`${edgeId}:${owner}`}
            className={className}
            aria-label={label}
            role={movable ? 'button' : undefined}
            tabIndex={movable ? 0 : undefined}
            onClick={movable ? () => onShip(edgeId) : undefined}
            onKeyDown={movable ? event => keyboardActivate(event, () => onShip(edgeId)) : undefined}
          >
            <title>{playerName(owner)}&apos;s ship</title>
            <SEA.Ship from={a} to={b} color={color(owner)} />
          </g>
        );
      })}
    </>
  );
}
