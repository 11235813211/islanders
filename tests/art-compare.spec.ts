import { test } from '@playwright/test';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PLAYER_COLORS } from '../shared/colors';
import type { PieceStyle, BaseTerrain as Terrain } from '../shared/types';
import type { ArtPack } from '../src/art/types';
import { art as v6 } from '../src/art/v6';
import { art as v7 } from '../src/art/v7';

// Side-by-side piece art for choosing between versions: writes test-results/art-compare.png.
// Add or remove packs here to compare others. Run: npx playwright test tests/art-compare.spec.ts
const PACKS: [string, ArtPack, PieceStyle][] = [
  ['v6 classic', v6, 'classic'],
  ['v7 classic', v7, 'classic'],
  ['v6 mountain chalet', v6, 'chalet'],
  ['v7 mountain chalet', v7, 'chalet'],
];
const TERRAINS: Terrain[] = ['wood', 'wheat', 'sheep', 'ore', 'brick', 'desert', 'wood', 'wheat'];
const CELL = 120;

/** One row: every seat color on a tile, with a settlement, a city, and a road. */
function row(pack: ArtPack, style: PieceStyle, uid: string): ReactElement {
  const colors = Object.values(PLAYER_COLORS);
  return h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 -70 ${colors.length * CELL} 140`,
      width: colors.length * CELL * 2,
    },
    h('defs', null, h(pack.ArtDefs, { uid })),
    ...colors.map((color, i) => {
      const x = i * CELL + CELL / 2;
      return h(
        'g',
        { key: color.label },
        h('g', { transform: `translate(${x} 0)` }, h(pack.HexTile, { uid, terrain: TERRAINS[i]! })),
        h(pack.Road, { from: { x: x - 30, y: 38 }, to: { x: x + 30, y: 38 }, color: color.fill }),
        h(
          'g',
          { transform: `translate(${x - 24} -14)` },
          h(pack.BuildingPiece, { color: color.fill, city: false, style }),
        ),
        h(
          'g',
          { transform: `translate(${x + 22} -10)` },
          h(pack.BuildingPiece, { color: color.fill, city: true, style }),
        ),
      );
    }),
  );
}

/** Close-up of a settlement and a city in three colors, for judging edges and details. */
function closeUp(pack: ArtPack, style: PieceStyle): ReactElement {
  const colors = [PLAYER_COLORS.red, PLAYER_COLORS.blue, PLAYER_COLORS.white];
  return h(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 -36 ${colors.length * 96} 56`, width: 8 * CELL * 2 },
    h('rect', { x: 0, y: -36, width: colors.length * 96, height: 56, fill: '#9acb49' }),
    ...colors.map((color, i) =>
      h(
        'g',
        { key: color.label },
        h(
          'g',
          { transform: `translate(${i * 96 + 20} 0)` },
          h(pack.BuildingPiece, { color: color.fill, city: false, style }),
        ),
        h(
          'g',
          { transform: `translate(${i * 96 + 62} 0)` },
          h(pack.BuildingPiece, { color: color.fill, city: true, style }),
        ),
      ),
    ),
  );
}

test('render piece art for comparison', async ({ page }) => {
  const rows = PACKS.map(
    ([label, pack, style], i) =>
      `<h2>${label}</h2>${renderToStaticMarkup(row(pack, style, `cmp${i}`))}${renderToStaticMarkup(closeUp(pack, style))}`,
  ).join('');
  await page.setViewportSize({ width: 8 * CELL * 2 + 40, height: 2400 });
  await page.setContent(
    `<style>body{margin:16px;background:#139fc2;font:600 18px sans-serif;color:#fff}h2{margin:8px 0}svg{display:block}</style>${rows}`,
  );
  await page.screenshot({ path: 'test-results/art-compare.png', fullPage: true });
});
