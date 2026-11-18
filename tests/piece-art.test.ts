import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { art as v16 } from '../src/art/v16';
import { art as v17 } from '../src/art/v17';
import { DesignedPiece } from '../src/art/v17/pieces/design';
import { KOREAN_DESIGN } from '../src/art/v17/pieces/korean';
import { pieceBounds } from './piece-bounds';

const SEAT = '#d42f2a';
/** The closest two buildings can stand: two board edges apart. */
const BUILDING_SPACING = 60 * Math.sqrt(3);

describe('building pieces', () => {
  it('keeps classic and chalet identical after the move to designs', () => {
    for (const style of ['classic', 'chalet'] as const) {
      for (const city of [false, true]) {
        const draw = (pack: typeof v16) => renderToStaticMarkup(h(pack.BuildingPiece, { color: SEAT, city, style }));
        expect(draw(v17)).toBe(draw(v16));
      }
    }
  });

  it('draws the Korean pieces with finite coordinates', () => {
    for (const city of [false, true]) {
      const markup = renderToStaticMarkup(h(DesignedPiece, { design: KOREAN_DESIGN, color: SEAT, city }));
      expect(markup).toContain('<path');
      expect(markup).not.toContain('NaN');
    }
  });

  it('keeps the Korean city clearly larger than its settlement, and narrower than building spacing', () => {
    const [house, city] = [pieceBounds(KOREAN_DESIGN, false), pieceBounds(KOREAN_DESIGN, true)];
    expect(city.width * city.height).toBeGreaterThan(house.width * house.height * 1.5);
    expect(city.width).toBeLessThan(BUILDING_SPACING);
  });
});
