import type { KeyboardEvent } from 'react';
import type { GameView } from '../../../shared/types';
import { BuildingPiece, CARTOGRAPHERS, ROAD_INSET, Road, SEA } from '../../art';
import type { PlaceKind } from '../Board';

/** Enter or Space on a focused SVG button does what a click does. */
export function keyboardActivate(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

/** Confirm or cancel, just above where the robber or pirate was put. */
export function RobberConfirm({
  at,
  pirate,
  onConfirm,
}: {
  at: { x: number; y: number };
  pirate: boolean;
  onConfirm: (confirm: boolean) => void;
}) {
  const piece = pirate ? 'pirate' : 'robber';
  return (
    <g className="map-confirm robber-confirm" transform={`translate(${at.x} ${at.y - 62})`}>
      <g className="map-confirm-body">
        <path d="M-46 18H-6L0 26 6 18H46V-20H-46Z" fill="#fffdf4" stroke="#123d54" strokeWidth="2" />
        {[true, false].map(yes => (
          // biome-ignore lint/a11y/useSemanticElements: an SVG group can't be a <button>.
          <g
            key={String(yes)}
            transform={`translate(${yes ? -22 : 22} 0)`}
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

/** The board's own art for a piece, small, for the confirm card. */
function PiecePreview({ kind, view, color }: { kind: PlaceKind; view: GameView; color: string }) {
  if (kind === 'road') return <Road from={{ x: -26, y: 10 }} to={{ x: 4, y: -14 }} color={color} />;
  if (kind === 'relay')
    return <CARTOGRAPHERS.Relay from={{ x: -28, y: 10 }} to={{ x: 6, y: -12 }} color={color} inset={ROAD_INSET / 2} />;
  if (kind === 'ship' || kind === 'survey') {
    const Piece = kind === 'ship' ? SEA.Ship : CARTOGRAPHERS.SurveyShip;
    return (
      <g transform="translate(-10 0) scale(.8)">
        <Piece from={{ x: -18, y: 8 }} to={{ x: 18, y: 8 }} color={color} />
      </g>
    );
  }
  return (
    <g transform="translate(-11 -1) scale(.75)">
      <BuildingPiece color={color} city={kind === 'city'} style={view.settings.pieceStyle} />
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
            <PiecePreview kind={kind} view={view} color={color} />
            <circle cx="17" cy="-2" r="10" fill="#198144" />
            <path d="m12 -2 3.5 3.5 6.5-7.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
          </g>
        ))}
      </g>
    </g>
  );
}
