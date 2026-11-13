import type { GameView, Hex } from '../../../shared/types';
import { hexPoints } from '../../lib/geometry';
import { keyboardActivate } from './BoardConfirm';

/** Tiles a Cartographers tool can pick (chart, split, survey target), the one picked, and a pick. */
export interface TilePicking {
  hexes: string[];
  picked: string | null;
  onPick: (hexId: string) => void;
  /** The accessible name of a tile's target. */
  label: (hex: Hex) => string;
  /** With a tile picked: a confirm card above it, showing `text` (the chart tool). */
  confirm?: { text: string; onConfirm: (confirm: boolean) => void } | null;
}

/** Dashed purple outlines on every tile the tool can pick; the picked one is filled in. */
export default function TileTargets({ view, tiles }: { view: GameView; tiles: TilePicking }) {
  const hexes = new Set(tiles.hexes);
  return (
    <g className="board-tile-targets">
      {view.board.hexes
        .filter(hex => hexes.has(hex.id))
        .map(hex => {
          const picked = tiles.picked === hex.id;
          return (
            <g
              key={hex.id}
              className={`board-target board-tile-target${picked ? ' board-target-selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={tiles.label(hex)}
              aria-pressed={picked}
              onClick={() => tiles.onPick(hex.id)}
              onKeyDown={event => keyboardActivate(event, () => tiles.onPick(hex.id))}
              transform={`translate(${hex.x} ${hex.y})`}
            >
              <polygon
                points={hexPoints(52)}
                fill={picked ? 'rgba(145, 104, 184, .28)' : 'transparent'}
                stroke={picked ? '#f6eefc' : '#e7d8f4'}
                strokeWidth={picked ? 3.5 : 2.5}
                strokeDasharray={picked ? undefined : '3 5'}
              />
            </g>
          );
        })}
    </g>
  );
}

/**
 * With no tool picked, every tile you can chart is a tap target with nothing drawn until hover, so
 * the board stays clear. Drawn under ships, roads, and corners, which keep their own taps.
 */
export function ChartTaps({ view, onChart }: { view: GameView; onChart: (hexId: string) => void }) {
  const hexes = new Set(view.legal.chartHexes);
  return (
    <g className="board-chart-taps">
      {view.board.hexes
        .filter(hex => hexes.has(hex.id))
        .map(hex => (
          <g
            key={hex.id}
            className="board-chart-tap"
            role="button"
            tabIndex={0}
            aria-label={`Chart the tile ${hex.id}`}
            onClick={() => onChart(hex.id)}
            onKeyDown={event => keyboardActivate(event, () => onChart(hex.id))}
            transform={`translate(${hex.x} ${hex.y})`}
          >
            <polygon points={hexPoints(52)} fill="transparent" />
          </g>
        ))}
    </g>
  );
}
