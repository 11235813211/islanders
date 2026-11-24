import { test } from '@playwright/test';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PLAYER_COLORS } from '../shared/colors';
import type { PieceStyle, BaseTerrain as Terrain } from '../shared/types';
import type { ArtPack } from '../src/art/types';
import { art as v19 } from '../src/art/v19';

// Side-by-side piece art for choosing between versions: writes test-results/art-compare.png.
// Add or remove packs here to compare others. Run: npx playwright test tests/art-compare.spec.ts
const PACKS: [string, ArtPack, PieceStyle][] = [
  ['v19 classic', v19, 'classic'],
  ['v19 mountain chalet', v19, 'chalet'],
  ['v19 Korean', v19, 'korean'],
];
const TERRAINS: Terrain[] = ['wood', 'wheat', 'sheep', 'ore', 'brick', 'desert', 'wood', 'wheat'];
const CELL = 120;

/** The pack's megacity, if it draws one. */
const mega = (pack: ArtPack, color: string, style: PieceStyle) =>
  pack.MegacityPiece ? h(pack.MegacityPiece, { color, style }) : null;

/** One row: every seat color on a tile, with a settlement, a city, and a road; a megacity below. */
function row(pack: ArtPack, style: PieceStyle, uid: string): ReactElement {
  const colors = Object.values(PLAYER_COLORS);
  return h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 -70 ${colors.length * CELL} 200`,
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
        h('g', { transform: `translate(${x} 100)` }, mega(pack, color.fill, style)),
      );
    }),
  );
}

/** Close-up of a settlement, a city, and a megacity in three colors, for judging edges and details. */
function closeUp(pack: ArtPack, style: PieceStyle): ReactElement {
  const colors = [PLAYER_COLORS.red, PLAYER_COLORS.blue, PLAYER_COLORS.white];
  return h(
    'svg',
    { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 -36 ${colors.length * 200} 56`, width: 8 * CELL * 2 },
    h('rect', { x: 0, y: -36, width: colors.length * 200, height: 56, fill: '#9acb49' }),
    ...colors.map((color, i) =>
      h(
        'g',
        { key: color.label },
        h(
          'g',
          { transform: `translate(${i * 200 + 24} 0)` },
          h(pack.BuildingPiece, { color: color.fill, city: false, style }),
        ),
        h(
          'g',
          { transform: `translate(${i * 200 + 70} 0)` },
          h(pack.BuildingPiece, { color: color.fill, city: true, style }),
        ),
        h('g', { transform: `translate(${i * 200 + 146} 0)` }, mega(pack, color.fill, style)),
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
