import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesignedPiece, type PieceDesign } from '../src/art/v17/pieces/design';

/** Drawn width and height of a piece in board units, measured from its rendered paths. */
export function pieceBounds(design: PieceDesign, city: boolean, color = '#d42f2a') {
  const markup = renderToStaticMarkup(h(DesignedPiece, { design, color, city }));
  const scale = city ? design.cityScale : design.settlementScale;
  const points = [...markup.matchAll(/ d="([^"]+)"/g)].flatMap(([, path]) =>
    [...path!.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)] as const),
  );
  const span = (values: number[]) => (Math.max(...values) - Math.min(...values)) * scale;
  return { width: span(points.map(p => p[0])), height: span(points.map(p => p[1])) };
}
