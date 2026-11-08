import type { ReactNode } from 'react';
import { isLandTerrain, isWater } from '../../shared/seafaring';
import type { Board, Hex } from '../../shared/types';
import { type Frame, Harbor, NumberToken, Robber, SEA, SeaBackdrop, Tile } from '../art';
import IslandRims, { rimTiles } from './IslandRims';

/** A stable small integer per tile, so repeated sea tiles vary their waves. */
export const tileVariant = (hex: Pick<Hex, 'q' | 'r'>) => Math.abs(hex.q * 7 + hex.r * 13);

/**
 * The map itself: sea, tiles, numbers, harbors, island markers, robber, and pirate. Shared by the
 * game board and the editor's preview; interactive layers go in `children`.
 */
export default function BoardScene({
  uid,
  board,
  frame,
  robber = '',
  pirate = null,
  showClosed = false,
  children,
}: {
  uid: string;
  board: Board;
  frame: Frame;
  robber?: string;
  pirate?: string | null;
  /** Outline the islands where starting settlements may go (setup, previews). */
  showClosed?: boolean;
  children?: ReactNode;
}) {
  const seaMap = board.hexes.some(h => h.terrain === 'sea');
  const vertices = new Map(board.vertices.map(v => [v.id, v]));
  const land = board.hexes.filter(h => isLandTerrain(h.terrain));
  const water = board.hexes.filter(h => isWater(h.terrain));
  return (
    <>
      <SeaBackdrop uid={uid} hexes={seaMap ? [] : board.hexes} frame={frame} />
      {water.map(hex => (
        <g key={hex.id} transform={`translate(${hex.x} ${hex.y})`}>
          <Tile uid={uid} terrain={hex.terrain} variant={tileVariant(hex)} />
        </g>
      ))}
      {seaMap && <SEA.IslandBase uid={uid} hexes={land} />}
      {land.map(hex => (
        <g key={hex.id} transform={`translate(${hex.x} ${hex.y})`}>
          <Tile uid={uid} terrain={hex.terrain} />
          {hex.number !== null && <NumberToken uid={uid} number={hex.number} />}
          {!!hex.bonus && <SEA.BonusChip points={hex.bonus} />}
          {robber === hex.id && <Robber />}
        </g>
      ))}
      {showClosed && seaMap && (
        <IslandRims tiles={rimTiles(board.hexes.map(h => ({ ...h, land: isLandTerrain(h.terrain) })))} />
      )}
      {pirate &&
        board.hexes
          .filter(hex => hex.id === pirate)
          .map(hex => (
            <g key={hex.id} transform={`translate(${hex.x} ${hex.y})`}>
              <SEA.Pirate />
            </g>
          ))}
      {board.harbors.map(port => (
        <g
          key={port.id}
          className="board-harbor"
          aria-label={`${port.resource === 'any' ? 'Any resource 3:1' : `${port.resource} 2:1`} harbor`}
        >
          <title>
            {port.resource === 'any'
              ? 'Trade any three matching resources for one'
              : `Trade two ${port.resource} for one resource`}
            . Build on either connected coastal corner.
          </title>
          <Harbor resource={port.resource} at={port} corners={port.vertices.map(id => vertices.get(id)!)} />
        </g>
      ))}
      {children}
    </>
  );
}
