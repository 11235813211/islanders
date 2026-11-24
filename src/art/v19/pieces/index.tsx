// Board pieces: flat roads, and settlements and cities modeled in 3D. Each building style is one
// `PieceDesign` in DESIGNS; add a style there. See design.tsx for what a design provides.
import type { PieceStyle } from '../../../../shared/types';
import { outlineTone } from '../solids';
import { chaletPiece } from './chalet';
import { classicPiece } from './classic';
import { DesignedPiece, type PieceDesign } from './design';
import { KOREAN_DESIGN } from './korean';
import { chaletMegacity, classicMegacity, koreanMegacity } from './megacity';

/** Share of the edge left bare at each end of a road. */
export const ROAD_INSET = 0.1;

/** A road: a flat bar in the seat color with a dark edge. */
export function Road({
  from: a,
  to: b,
  color,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
}) {
  // Ends stop a little short of each corner, so settlements and cities sit over clear ground.
  const dx = (b.x - a.x) * ROAD_INSET;
  const dy = (b.y - a.y) * ROAD_INSET;
  const bar = (stroke: string, width: number) => (
    <line
      x1={a.x + dx}
      y1={a.y + dy}
      x2={b.x - dx}
      y2={b.y - dy}
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
    />
  );
  return (
    <>
      {bar(outlineTone(color), 8.4)}
      {bar(color, 5.8)}
    </>
  );
}

/** Classic pieces are drawn a tenth larger than chalets. */
const DESIGNS: Record<PieceStyle, PieceDesign> = {
  classic: {
    build: classicPiece,
    settlementScale: 1.15 * 1.1,
    cityScale: 1.32 * 1.1,
    megacity: classicMegacity,
    megacityScale: 1.32 * 1.1,
  },
  chalet: { build: chaletPiece, settlementScale: 1.15, cityScale: 1.32, megacity: chaletMegacity, megacityScale: 1.2 },
  korean: { ...KOREAN_DESIGN, megacity: koreanMegacity, megacityScale: 1.5 },
};

/** A settlement or city in the room's piece style, standing on its corner of the board. */
export function BuildingPiece({
  color,
  city,
  style = 'classic',
}: {
  color: string;
  city: boolean;
  style?: PieceStyle;
}) {
  return <DesignedPiece design={DESIGNS[style]} color={color} city={city} />;
}

/** A megacity (three buildings) in the room's piece style. */
export function MegacityPiece({ color, style = 'classic' }: { color: string; style?: PieceStyle }) {
  return <DesignedPiece design={DESIGNS[style]} color={color} city mega />;
}
