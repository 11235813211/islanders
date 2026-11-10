import type { CSSProperties, ReactNode } from 'react';
import { isLandTerrain } from '../../shared/seafaring';
import type { Board, Hex } from '../../shared/types';
import { type Frame, Harbor, NumberToken, Robber, SEA, SeaBackdrop, Tile } from '../art';
import IslandRims, { rimTiles } from './IslandRims';

/** An iceberg's last drift, for its slide-in (see icebergDrifts in Board.tsx). `from` = `to` when it was blocked. */
export interface Drift {
  id: number;
  from: string;
  to: string;
  die: number;
}

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
  drifts = [],
  children,
}: {
  uid: string;
  board: Board;
  frame: Frame;
  robber?: string;
  pirate?: string | null;
  /** Outline the islands where starting settlements may go (setup, previews). */
  showClosed?: boolean;
  /** Icebergs that just drifted: they slide in from where they were, showing their die. */
  drifts?: Drift[];
  children?: ReactNode;
}) {
  const seaMap = board.hexes.some(h => h.terrain === 'sea');
  const vertices = new Map(board.vertices.map(v => [v.id, v]));
  const land = board.hexes.filter(h => isLandTerrain(h.terrain));
  // Water and unexplored fog fill the whole hex; land sits on the island's shore.
  const water = board.hexes.filter(h => !isLandTerrain(h.terrain));
  return (
    <>
      <SeaBackdrop uid={uid} hexes={seaMap ? [] : board.hexes} frame={frame} />
      {water.map(hex => {
        const drift = drifts.find(d => d.to === hex.id);
        const from = drift && board.hexes.find(h => h.id === drift.from);
        return (
          <g key={hex.id} transform={`translate(${hex.x} ${hex.y})`}>
            {/* A drifting iceberg leaves open sea under it as it slides in. */}
            {from && <Tile uid={uid} terrain="sea" variant={tileVariant(hex)} />}
            <g
              key={drift?.id}
              className={from ? 'iceberg-drift' : undefined}
              style={
                from ? ({ '--dx': `${from.x - hex.x}px`, '--dy': `${from.y - hex.y}px` } as CSSProperties) : undefined
              }
            >
              <Tile uid={uid} terrain={hex.terrain} variant={tileVariant(hex)} />
              {hex.terrain === 'iceberg' && hex.number !== null && <NumberToken uid={uid} number={hex.number} />}
            </g>
            {drift && (
              <g key={`die-${drift.id}`} className="drift-die" transform="translate(30 -34)">
                <rect x="-11" y="-11" width="22" height="22" rx="5" />
                <text y="6" textAnchor="middle">
                  {drift.die}
                </text>
              </g>
            )}
          </g>
        );
      })}
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
      {/* Corners the map rules out for starting settlements. */}
      {showClosed &&
        board.vertices
          .filter(v => v.noSetup)
          .map(v => (
            <g key={v.id} className="board-nostart" transform={`translate(${v.x} ${v.y})`} aria-hidden="true">
              <circle r="8" />
              <path d="M-5-5 5 5" />
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
