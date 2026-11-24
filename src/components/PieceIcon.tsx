import { playerColor } from '../../shared/colors';
import type { PieceStyle, PlayerColor } from '../../shared/types';
import { BuildingPiece, CARTOGRAPHERS, MegacityPiece, ROAD_INSET, Road, SEA } from '../art';
import type { PlaceKind } from './Board';

/** A piece as the board draws it, small, centered a little left of the origin (the confirm card's check sits right). */
export function PieceArt({ kind, color, style }: { kind: PlaceKind; color: string; style?: PieceStyle }) {
  if (kind === 'road') return <Road from={{ x: -26, y: 10 }} to={{ x: 4, y: -14 }} color={color} />;
  if (kind === 'relay')
    return <CARTOGRAPHERS.Relay from={{ x: -28, y: 10 }} to={{ x: 6, y: -12 }} color={color} inset={ROAD_INSET / 2} />;
  if (kind === 'ship')
    return (
      <g transform="translate(-10 0) scale(.8)">
        <SEA.Ship from={{ x: -18, y: 8 }} to={{ x: 18, y: 8 }} color={color} />
      </g>
    );
  if (kind === 'megacity')
    return (
      <g transform="translate(-11 -1) scale(.6)">
        <MegacityPiece color={color} style={style} />
      </g>
    );
  return (
    <g transform="translate(-11 -1) scale(.75)">
      <BuildingPiece color={color} city={kind === 'city'} style={style} />
    </g>
  );
}

/** Each piece's own frame around PieceArt, so small icons fill their box. */
const FRAMES: Record<PlaceKind, string> = {
  settlement: '-25 -20 28 28',
  city: '-27 -22 32 32',
  megacity: '-30 -24 38 38',
  road: '-30 -18 38 32',
  relay: '-31 -16 40 30',
  ship: '-24 -12 28 28',
};

/**
 * A piece in a seat's color as an inline icon beside its name (lobby extra pieces, the editor's
 * pieces menu, the how-to). Red when no seat is given.
 */
export default function PieceIcon({
  kind,
  color,
  size = 22,
  style,
}: {
  kind: PlaceKind;
  color?: PlayerColor;
  size?: number;
  style?: PieceStyle;
}) {
  return (
    <svg className="piece-icon" width={size} height={size} viewBox={FRAMES[kind]} overflow="visible" aria-hidden="true">
      <PieceArt kind={kind} color={playerColor(color).fill} style={style} />
    </svg>
  );
}
