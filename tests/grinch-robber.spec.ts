import { test } from '@playwright/test';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BaseTerrain } from '../shared/types';
import { art } from '../src/art/v20';
import { GrinchCloak, GrinchSack, GrinchSanta } from '../src/art/v20/christmas/grinch-robber';
import { WinterTile } from '../src/art/v20/christmas/tiles';

// Review the proposed Grinch robbers beside the current robber, on winter tiles with a number
// token, at board size and at 3×. Writes test-results/grinch-robber.png.
const OPTIONS: [string, () => ReactElement][] = [
  ['Current robber', art.Robber],
  ['A: Grinch as Santa', GrinchSanta],
  ['B: Grinch with a sack', GrinchSack],
  ['C: Green cloak and hat', GrinchCloak],
];
const TERRAINS: BaseTerrain[] = ['wood', 'ore', 'sheep', 'desert'];

/** One option on each test tile, scaled so a tile is `cell` pixels across. */
function strip(uid: string, Robber: () => ReactElement, cell: number) {
  return renderToStaticMarkup(
    h(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: `0 -70 ${TERRAINS.length * 130} 140`,
        width: TERRAINS.length * cell,
      },
      h('defs', null, h(art.ArtDefs, { uid })),
      ...TERRAINS.map((terrain, i) =>
        h(
          'g',
          { key: terrain, transform: `translate(${i * 130 + 65} 0)` },
          h(WinterTile, { uid, terrain, seed: i }),
          terrain !== 'desert' && h(art.NumberToken, { uid, number: 6 + i }),
          h(Robber),
        ),
      ),
    ),
  );
}

test('render the Grinch robber options for review', async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  const rows = OPTIONS.map(
    ([name, Robber], i) =>
      `<h2>${name}</h2><div class="row">${strip(`s${i}`, Robber, 110)}${strip(`l${i}`, Robber, 300).replace('<svg', '<svg class="big"')}</div>`,
  ).join('');
  await page.setContent(
    `<style>body{margin:16px;background:#0d6f88;color:#fff;font:600 18px sans-serif}h2{margin:8px 0}.row{display:flex;gap:24px;align-items:center}svg.big{height:220px;width:auto}</style>${rows}`,
  );
  await page.screenshot({ path: 'test-results/grinch-robber.png', fullPage: true });
});
