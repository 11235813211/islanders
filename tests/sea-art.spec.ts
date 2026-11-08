import { test } from '@playwright/test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PLAYER_COLORS } from '../shared/colors';
import type { SeaTileKind } from '../src/art/types';
import { art } from '../src/art/v7';
import { sea } from '../src/art/v7/sea';

// Sea-map tiles and pieces, large, for reviewing and tweaking the art in src/art/v7/sea.
// Writes test-results/sea-art.png. Run: npx playwright test tests/sea-art.spec.ts
const TILES: SeaTileKind[] = ['sea', 'land', 'gold', 'jungle', 'volcano', 'iceberg'];
const CELL = 130;

test('render sea tiles and pieces for review', async ({ page }) => {
  const uid = 'sea';
  const tiles = h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 -70 ${TILES.length * CELL} 140`,
      width: TILES.length * CELL * 2.4,
    },
    h('defs', null, h(art.ArtDefs, { uid }), h(sea.Defs, { uid })),
    h('rect', { x: 0, y: -70, width: TILES.length * CELL, height: 140, fill: '#139fc2' }),
    ...TILES.map((terrain, i) =>
      h(
        'g',
        { key: terrain, transform: `translate(${i * CELL + CELL / 2} 0)` },
        h(sea.SeaTile, { uid, terrain }),
        ['gold', 'jungle', 'volcano', 'land'].includes(terrain)
          ? h(art.NumberToken, { uid, number: 6 + (i % 3) })
          : null,
        terrain === 'land' ? h(sea.BonusChip, { points: 2 }) : null,
        terrain === 'sea' ? h(sea.Pirate) : null,
      ),
    ),
  );
  const colors = Object.values(PLAYER_COLORS);
  const ships = h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 -40 ${colors.length * 70} 80`,
      width: TILES.length * CELL * 2.4,
    },
    h('defs', null, h(sea.Defs, { uid: 'ships' })),
    h('rect', { x: 0, y: -40, width: colors.length * 70, height: 80, fill: '#1c9fc5' }),
    ...colors.map((color, i) =>
      h(
        'g',
        { key: color.label },
        h(sea.Ship, { from: { x: i * 70 + 8, y: -16 }, to: { x: i * 70 + 60, y: -16 }, color: color.fill }),
        h(sea.Ship, { from: { x: i * 70 + 35, y: 2 }, to: { x: i * 70 + 35, y: 36 }, color: color.fill }),
      ),
    ),
  );
  await page.setViewportSize({ width: TILES.length * CELL * 2.4 + 40, height: 1200 });
  await page.setContent(
    `<style>body{margin:16px;background:#0d6f88}svg{display:block;margin-bottom:12px}text{font-family:sans-serif}</style>${renderToStaticMarkup(tiles)}${renderToStaticMarkup(ships)}`,
  );
  await page.screenshot({ path: 'test-results/sea-art.png', fullPage: true });
});
