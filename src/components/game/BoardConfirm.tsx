import type { KeyboardEvent } from 'react';
import type { GameView } from '../../../shared/types';
import type { PlaceKind } from '../Board';
import { PieceArt } from '../PieceIcon';

/** Enter or Space on a focused SVG button does what a click does. */
export function keyboardActivate(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

/**
 * Confirm or cancel, just above a picked tile: where the robber or pirate goes, a fog tile to peek
 * at, or a tile to chart (with `text`, what the chart does to its numbers).
 */
export function HexConfirm({
  at,
  piece,
  text,
  onConfirm,
}: {
  at: { x: number; y: number };
  piece: 'robber' | 'pirate' | 'peek' | 'chart' | 'santa';
  text?: string;
  onConfirm: (confirm: boolean) => void;
}) {
  // About 9 board units per character at this size, plus a margin.
  const textWidth = text ? text.length * 9 + 14 : 0;
  const half = (92 + textWidth) / 2;
  return (
    <g className="map-confirm robber-confirm" transform={`translate(${at.x} ${at.y - 62})`}>
      <g className="map-confirm-body">
        <path d={`M${-half} 18H-6L0 26 6 18H${half}V-20H${-half}Z`} fill="#fffdf4" stroke="#123d54" strokeWidth="2" />
        {text && (
          <text
            className="map-confirm-text"
            x={-half + textWidth / 2 + 4}
            y="0"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {text}
          </text>
        )}
        {[true, false].map(yes => (
          // biome-ignore lint/a11y/useSemanticElements: an SVG group can't be a <button>.
          <g
            key={String(yes)}
            transform={`translate(${yes ? half - 68 : half - 24} 0)`}
            role="button"
            tabIndex={0}
            aria-label={yes ? `Confirm ${piece}` : `Cancel ${piece}`}
            onClick={event => {
              event.stopPropagation();
              onConfirm(yes);
            }}
            onKeyDown={event => keyboardActivate(event, () => onConfirm(yes))}
          >
            <circle r="14" fill={yes ? '#198144' : '#c8473b'} />
            {yes ? (
              <path d="m-6 0 4 4 8-9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            ) : (
              <path d="M-5-5 5 5M5-5-5 5" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            )}
          </g>
        ))}
      </g>
    </g>
  );
}

/** The card above a picked spot: one confirm button per piece that fits there. */
export function ConfirmCard({
  at,
  choices,
  view,
  color,
  onConfirm,
}: {
  at: { x: number; y: number };
  choices: PlaceKind[];
  view: GameView;
  color: string;
  onConfirm?: (kind: PlaceKind) => void;
}) {
  const width = 64 * choices.length;
  return (
    <g className="map-confirm" transform={`translate(${at.x} ${at.y - 42})`}>
      <g className="map-confirm-body">
        <path
          d={`M${-width / 2} 18H-6L0 26 6 18H${width / 2}V-22H${-width / 2}Z`}
          fill="#fffdf4"
          stroke="#123d54"
          strokeWidth="2"
        />
        {choices.map((kind, i) => (
          <g
            key={kind}
            transform={`translate(${-width / 2 + 32 + i * 64} 0)`}
            role="button"
            tabIndex={0}
            aria-label={`Confirm ${kind}`}
            onClick={event => {
              event.stopPropagation();
              onConfirm?.(kind);
            }}
            onKeyDown={event => keyboardActivate(event, () => onConfirm?.(kind))}
          >
            <rect x="-31" y="-20" width="62" height="36" fill="transparent" />
            {/* Outlined in a dark tone of the seat color, so even white shows on the cream card. */}
            <PieceArt kind={kind} color={color} style={view.settings.pieceStyle} />
            <circle cx="17" cy="-2" r="10" fill="#198144" />
            <path d="m12 -2 3.5 3.5 6.5-7.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
          </g>
        ))}
      </g>
    </g>
  );
}
