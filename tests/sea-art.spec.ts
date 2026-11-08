import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PLAYER_COLORS } from '../shared/colors';
import type { Terrain } from '../shared/types';
import { ART_VERSION, ArtDefs, NumberToken, SEA, Tile } from '../src/art';
import type { SeaTileKind } from '../src/art/types';

// Review the active art, including the three special land tiles beside the standard forest.
// Run: npx playwright test tests/sea-art.spec.ts
const TILES: SeaTileKind[] = ['sea', 'land', 'gold', 'jungle', 'volcano', 'iceberg'];
const DETAIL_TILES: Terrain[] = ['wood', 'jungle', 'gold', 'volcano'];
const DETAIL_LABELS = ['Forest', 'Jungle', 'Gold', 'Volcano'];
const CELL = 130;
const BOARD_STYLE = readFileSync(new URL('../src/components/Board.css', import.meta.url), 'utf8');
const TABLE_STYLE = readFileSync(new URL('../src/components/GameTable.css', import.meta.url), 'utf8');
const BOARD_FONT = readFileSync(
  new URL('../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2', import.meta.url),
).toString('base64');
const REVIEW_STYLE = `<style>
  @font-face{font-family:'DM Sans Variable';font-style:normal;font-weight:100 1000;
    src:url(data:font/woff2;base64,${BOARD_FONT}) format('woff2')}
  ${BOARD_STYLE}
  ${TABLE_STYLE}
  body{margin:16px;background:#0d6f88;color:#fff;font:14px sans-serif}
  svg{display:block;margin-bottom:12px;max-width:100%;height:auto}
  h1{font-size:20px;margin:0 0 12px}h2{font-size:16px;margin:18px 0 8px}
  text{font-family:sans-serif}
</style>`;

function tileRow(uid: string, width: number, samples: { terrain: Terrain; label: string; number: number | null }[]) {
  return renderToStaticMarkup(
    h(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: `0 -70 ${samples.length * CELL} 155`,
        width,
      },
      h('defs', null, h(ArtDefs, { uid }), h(SEA.Defs, { uid })),
      ...samples.map(({ terrain, label, number }, i) =>
        h(
          'g',
          { key: i, transform: `translate(${i * CELL + CELL / 2} 0)` },
          h(Tile, { uid, terrain }),
          number !== null ? h(NumberToken, { uid, number }) : null,
          h('text', { y: 76, textAnchor: 'middle', fill: '#fff', fontSize: 11 }, label),
        ),
      ),
    ),
  );
}

function detailRow(uid: string, width: number, tokens: boolean) {
  return tileRow(
    uid,
    width,
    DETAIL_TILES.map((terrain, i) => ({ terrain, label: DETAIL_LABELS[i]!, number: tokens ? 8 : null })),
  );
}

function volcanoTokens(uid: string, width: number) {
  return tileRow(uid, width, [
    { terrain: 'volcano', label: 'Volcano · 6', number: 6 },
    { terrain: 'volcano', label: 'Volcano · 11', number: 11 },
  ]);
}

test('render sea tiles and pieces for review', async ({ page }) => {
  const uid = 'sea';
  const tiles = h(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 -70 ${TILES.length * CELL} 140`,
      width: TILES.length * CELL * 2.4,
    },
    h('defs', null, h(ArtDefs, { uid }), h(SEA.Defs, { uid })),
    h('rect', { x: 0, y: -70, width: TILES.length * CELL, height: 140, fill: '#139fc2' }),
    ...TILES.map((terrain, i) =>
      h(
        'g',
        { key: terrain, transform: `translate(${i * CELL + CELL / 2} 0)` },
        h(SEA.SeaTile, { uid, terrain }),
        ['gold', 'jungle', 'volcano', 'land'].includes(terrain) ? h(NumberToken, { uid, number: 6 + (i % 3) }) : null,
        terrain === 'land' ? h(SEA.BonusChip, { points: 2 }) : null,
        terrain === 'sea' ? h(SEA.Pirate) : null,
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
    h('defs', null, h(SEA.Defs, { uid: 'ships' })),
    h('rect', { x: 0, y: -40, width: colors.length * 70, height: 80, fill: '#1c9fc5' }),
    ...colors.map((color, i) =>
      h(
        'g',
        { key: color.label },
        h(SEA.Ship, { from: { x: i * 70 + 8, y: -16 }, to: { x: i * 70 + 60, y: -16 }, color: color.fill }),
        h(SEA.Ship, { from: { x: i * 70 + 35, y: 2 }, to: { x: i * 70 + 35, y: 36 }, color: color.fill }),
      ),
    ),
  );
  await page.setViewportSize({ width: TILES.length * CELL * 2.4 + 40, height: 1200 });
  await page.setContent(
    `${REVIEW_STYLE}<h1>Sea art · ${ART_VERSION}</h1>${renderToStaticMarkup(tiles)}${renderToStaticMarkup(ships)}`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/sea-art.png', fullPage: true });
});

test('review special land tiles with and without number tokens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.setContent(
    `${REVIEW_STYLE}<h1>Land art · ${ART_VERSION}</h1>
    <h2>Tile detail</h2>${detailRow('detail-bare', 1408, false)}
    <h2>With number tokens</h2>${detailRow('detail-token', 1408, true)}
    <h2>Volcano number tokens</h2>${volcanoTokens('volcano-token', 704)}
    <h2>Desktop scale</h2>${detailRow('detail-desktop', 520, true)}`,
  );
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.terrain-volcano')).toHaveCount(5);
  for (const tile of await page.locator('.terrain-volcano').all()) {
    expect(await tile.locator('.volcano-corner text').allTextContents()).toEqual(['1', '2', '3', '4', '5', '6']);
  }
  // A missing gradient or clip path can silently erase art while the SVG still renders.
  const unresolved = await page.locator('svg').evaluateAll(svgs =>
    svgs.flatMap(svg => {
      const ids = new Set(Array.from(svg.querySelectorAll('[id]'), node => node.id));
      return Array.from(svg.querySelectorAll('*')).flatMap(node =>
        Array.from(node.attributes).flatMap(attribute =>
          Array.from(attribute.value.matchAll(/url\(#([^)]+)\)/g), match => match[1]!).filter(id => !ids.has(id)),
        ),
      );
    }),
  );
  expect(unresolved).toEqual([]);
  await page.screenshot({ path: 'test-results/sea-art-details.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 700 });
  await page.setContent(
    `${REVIEW_STYLE}<h1>Phone tile scale · ${ART_VERSION}</h1>
    <h2>Without number tokens</h2>${detailRow('phone-bare', 358, false)}
    <h2>With number tokens</h2>${detailRow('phone-token', 358, true)}
    <h2>Volcano number tokens</h2>${volcanoTokens('phone-volcano', 179)}`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/sea-art-phone.png', fullPage: true });
});
