import type { ReactNode } from 'react';
import { isLandTerrain, isWater } from '../../shared/seafaring';
import type { Board, Hex } from '../../shared/types';
import { type Frame, Harbor, NumberToken, Robber, SEA, SeaBackdrop, TERRAIN, Tile } from '../art';

/** A stable small integer per tile, so repeated sea tiles vary their waves. */
export const tileVariant = (hex: Pick<Hex, 'q' | 'r'>) => Math.abs(hex.q * 7 + hex.r * 13);

/** Marks an island where setup settlements are not allowed. */
export function ClosedMark() {
  return (
    <g className="board-closed" transform="translate(25 -25)">
      <title>No starting settlements on this island</title>
      <circle r="9" fill="#fff8e6" stroke="#9b3b2a" strokeWidth="1.4" />
      <path d="M-4 4V-5M-4-5H3L1-2.5 3 0H-4" fill="#e7b9a8" stroke="#6b2b1f" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M-6.4 6.4 6.4-6.4" stroke="#9b3b2a" strokeWidth="1.6" strokeLinecap="round" />
    </g>
  );
}

function hexTitle(hex: Hex, robber: string, pirate: string | null): string {
  const parts = [TERRAIN[hex.terrain].name];
  if (hex.number) parts.push(String(hex.number));
  if (hex.bonus) parts.push(`${hex.bonus} bonus point${hex.bonus === 1 ? '' : 's'} for settling this island`);
  if (hex.noSetup) parts.push('no starting settlements');
  if (robber === hex.id) parts.push('robber blocks production');
  if (pirate === hex.id) parts.push('pirate blocks ships here');
  return parts.join(' · ');
}

/**
 * The map itself: sea, tiles, numbers, harbors, island markers, robber, and pirate. Shared by the
 * game board, the map picker's viewer, and the editor; interactive layers go in `children`.
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
  /** Mark islands closed to setup settlements (setup, previews). */
  showClosed?: boolean;
  children?: ReactNode;
}) {
  const seaMap = board.hexes.some(h => h.terrain === 'sea');
  const vertices = new Map(board.vertices.map(v => [v.id, v]));
  const land = board.hexes.filter(h => isLandTerrain(h.terrain));
  const water = board.hexes.filter(h => isWater(h.terrain));
  // One "no starting settlements" flag per island, on its first tile.
  const flagged = new Set<string>();
  const seen = new Set<number>();
  for (const hex of land)
    if (hex.noSetup && hex.island !== undefined && !seen.has(hex.island)) {
      seen.add(hex.island);
      flagged.add(hex.id);
    }
  return (
    <>
      <SeaBackdrop uid={uid} hexes={seaMap ? [] : board.hexes} frame={frame} />
      {water.map(hex => (
        <g key={hex.id} transform={`translate(${hex.x} ${hex.y})`}>
          <title>{hexTitle(hex, robber, pirate)}</title>
          <Tile uid={uid} terrain={hex.terrain} variant={tileVariant(hex)} />
        </g>
      ))}
      {seaMap && <SEA.IslandBase uid={uid} hexes={land} />}
      {land.map(hex => (
        <g key={hex.id} transform={`translate(${hex.x} ${hex.y})`}>
          <title>{hexTitle(hex, robber, pirate)}</title>
          <Tile uid={uid} terrain={hex.terrain} />
          {hex.number !== null && <NumberToken uid={uid} number={hex.number} />}
          {!!hex.bonus && <SEA.BonusChip points={hex.bonus} />}
          {showClosed && flagged.has(hex.id) && <ClosedMark />}
          {robber === hex.id && <Robber />}
        </g>
      ))}
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
