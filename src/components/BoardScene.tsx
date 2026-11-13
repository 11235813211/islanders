import type { CSSProperties, ReactNode } from 'react';
import { isLandTerrain } from '../../shared/seafaring';
import type { Board, GameView, Hex, Resource } from '../../shared/types';
import { CARTOGRAPHERS, type Frame, Harbor, NumberToken, Robber, SEA, SeaBackdrop, SplitSeam, Tile } from '../art';
import { hexPoints } from '../lib/geometry';
import IslandRims, { rimTiles } from './IslandRims';

/** An iceberg's last drift, for its slide-in (see icebergDrifts in Board.tsx). `from` = `to` when it was blocked. */
export interface Drift {
  id: number;
  from: string;
  to: string;
  die: number;
}

/**
 * A volcano shaking with its lava rim: on and on while it waits to erupt, or (with `delay`, in
 * seconds) a short quake when its eruption wrecks a building.
 */
export interface Rumble {
  hexId: string;
  delay?: number;
}

function rumbleProps(rumble: Rumble | undefined): { className?: string; style?: CSSProperties } {
  if (!rumble) return {};
  if (rumble.delay === undefined) return { className: 'volcano-rumble' };
  return { className: 'volcano-quake', style: { animationDelay: `${rumble.delay}s` } };
}

/**
 * A fog tile you peeked at: the hidden tile and its number under a thin veil of fog, ringed in
 * lodestone purple so it's clear which tile you know.
 */
function PeekedFog({ uid, hex, peek }: { uid: string; hex: Hex; peek: GameView['fogPeeks'][string] }) {
  return (
    <g className="peeked-fog" aria-label="A fog tile you peeked at">
      <Tile uid={uid} terrain={peek.terrain} variant={tileVariant(hex)} />
      {peek.number !== null && <NumberToken uid={uid} number={peek.number} />}
      <g opacity={0.62}>
        <Tile uid={uid} terrain="fog" variant={tileVariant(hex)} />
      </g>
      <polygon points={hexPoints(47)} fill="none" stroke="#7b4fb0" strokeWidth="5" strokeDasharray="9 6" />
    </g>
  );
}

/** A split tile (Cartographers): its own terrain on the left half, the added resource's on the right. */
function SplitTile({ uid, hex, split }: { uid: string; hex: Hex; split: Resource }) {
  return (
    <g aria-label={`Split tile: ${hex.terrain} or ${split}`}>
      <g clipPath={`url(#${uid}-half-left)`}>
        <Tile uid={uid} terrain={hex.terrain} />
      </g>
      <g clipPath={`url(#${uid}-half-right)`}>
        <Tile uid={uid} terrain={split} />
      </g>
      <SplitSeam />
    </g>
  );
}

/** Clip paths for split tiles' halves, in each tile's own coordinates. */
function HalfClips({ uid }: { uid: string }) {
  return (
    <defs>
      <clipPath id={`${uid}-half-left`}>
        <rect x="-70" y="-70" width="70" height="140" />
      </clipPath>
      <clipPath id={`${uid}-half-right`}>
        <rect x="0" y="-70" width="70" height="140" />
      </clipPath>
    </defs>
  );
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
  rumbles = [],
  peeks = {},
  children,
}: {
  uid: string;
  board: Board;
  /** Fog tiles this viewer peeked at: what each hides shows faintly through the fog. */
  peeks?: GameView['fogPeeks'];
  frame: Frame;
  robber?: string;
  pirate?: string | null;
  /** Outline the islands where starting settlements may go (setup, previews). */
  showClosed?: boolean;
  /** Icebergs that just drifted: they slide in from where they were, showing their die. */
  drifts?: Drift[];
  /** Volcanoes shaking: the tile and its rim move together, under roads and buildings. */
  rumbles?: Rumble[];
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
      {board.hexes.some(h => h.split) && <HalfClips uid={uid} />}
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
              {peeks[hex.id] ? (
                <PeekedFog uid={uid} hex={hex} peek={peeks[hex.id]!} />
              ) : (
                <Tile uid={uid} terrain={hex.terrain} variant={tileVariant(hex)} />
              )}
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
          <g {...rumbleProps(rumbles.find(r => r.hexId === hex.id))}>
            {hex.split ? <SplitTile uid={uid} hex={hex} split={hex.split} /> : <Tile uid={uid} terrain={hex.terrain} />}
            {hex.number !== null && <NumberToken uid={uid} number={hex.number} />}
            {!!hex.extra?.length && (
              <g transform="translate(0 8)">
                <CARTOGRAPHERS.ExtraNumbers numbers={hex.extra} />
              </g>
            )}
            {!!hex.bonus && <SEA.BonusChip points={hex.bonus} />}
            {robber === hex.id && (
              <g className="piece-drop">
                <Robber />
              </g>
            )}
          </g>
        </g>
      ))}
      {rumbles.map(rumble => {
        const hex = board.hexes.find(h => h.id === rumble.hexId);
        if (!hex) return null;
        const { className, style } = rumbleProps(rumble);
        return (
          <g key={`rim-${hex.id}`} transform={`translate(${hex.x} ${hex.y})`} aria-hidden="true">
            <polygon points={hexPoints(56)} className={`volcano-rim ${className}`} style={style} />
          </g>
        );
      })}
      {showClosed && seaMap && (
        <IslandRims tiles={rimTiles(board.hexes.map(h => ({ ...h, land: isLandTerrain(h.terrain) })))} />
      )}
      {pirate &&
        board.hexes
          .filter(hex => hex.id === pirate)
          .map(hex => (
            <g key={hex.id} transform={`translate(${hex.x} ${hex.y})`}>
              <g className="piece-drop">
                <SEA.Pirate />
              </g>
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
