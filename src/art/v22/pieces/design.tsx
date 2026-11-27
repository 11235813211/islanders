// What a building style provides, and the one component that draws any style.
import { memo } from 'react';
import type { Camera } from '../projection';
import { type Palette, type Solid, Solids } from '../solids';

/** One building style: its models, drawn sizes, and optional material colors. */
export interface PieceDesign {
  /** Builds fresh solids; the ground center of the model is the origin. */
  build: (city: boolean) => Solid[];
  settlementScale: number;
  cityScale: number;
  /** The megacity's three buildings, drawn at `megacityScale`. */
  megacity: () => Solid[];
  megacityScale: number;
  /** Material colors for a seat. Without one, the whole piece is shaded seat color. */
  palette?: (seat: string) => Palette;
  /** The view of both pieces. A settlement and its city always share one camera. */
  camera?: Camera;
}

/**
 * A settlement or city in a given design, standing on its corner of the board. Memoized because
 * detailed roofs are costly to rebuild, and the board re-renders often while pieces stay put.
 */
export const DesignedPiece = memo(function DesignedPiece({
  design,
  color,
  city,
  mega = false,
}: {
  design: PieceDesign;
  color: string;
  city: boolean;
  mega?: boolean;
}) {
  const scale = mega ? design.megacityScale : city ? design.cityScale : design.settlementScale;
  const solids = mega ? design.megacity() : design.build(city);
  // The model's ground center sits just below the corner, so the piece stands on it.
  return (
    <g className="board-piece" transform={`translate(0 7) scale(${scale})`}>
      <Solids solids={solids} color={color} palette={design.palette?.(color)} camera={design.camera} />
    </g>
  );
});
