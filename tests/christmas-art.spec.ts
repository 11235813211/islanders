import { readFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PLAYER_COLORS } from '../shared/colors';
import type { BaseTerrain } from '../shared/types';
import { art } from '../src/art/v20';
import { NorthPoleRing, NorthPoleTile, Sleigh } from '../src/art/v20/christmas/northpole';
import { WinterTile } from '../src/art/v20/christmas/tiles';

// Review the Christmas art: each tile as usual and in winter, with gingerbread pieces, and a
// close-up. Writes test-results/christmas-art.png. Run: npx playwright test tests/christmas-art.spec.ts
const TERRAINS: BaseTerrain[] = ['wood', 'sheep', 'wheat', 'brick', 'ore', 'desert'];
const CELL = 130;
const MOTION = readFileSync(new URL('../src/art/v20/christmas/christmas.css', import.meta.url), 'utf8');
const SEATS = ['red', 'blue', 'white', 'green', 'pink', 'teal'] as const;

/** One row of tiles: classic art, or winter art with a gingerbread settlement and city on each. */
function row(uid: string, winter: boolean, paid?: number) {
  return renderToStaticMarkup(
    h(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: `0 -70 ${TERRAINS.length * CELL} 140`,
        width: TERRAINS.length * CELL * 2,
      },
      h('defs', null, h(art.ArtDefs, { uid })),
      ...TERRAINS.map((terrain, i) =>
        h(
          'g',
          { key: terrain, transform: `translate(${i * CELL + CELL / 2} 0)` },
          winter
            ? h(WinterTile, { uid, terrain, seed: i, grinch: terrain === 'ore', paid })
            : h(art.HexTile, { uid, terrain }),
          winter &&
            h(
              'g',
              null,
              h(
                'g',
                { transform: 'translate(-34 -26)' },
                h(art.BuildingPiece, { color: PLAYER_COLORS[SEATS[i]!].fill, city: false, style: 'gingerbread' }),
              ),
              h(
                'g',
                { transform: 'translate(32 -24)' },
                h(art.BuildingPiece, { color: PLAYER_COLORS[SEATS[i]!].fill, city: true, style: 'gingerbread' }),
              ),
            ),
          terrain !== 'desert' && h('g', { transform: 'translate(0 0)' }, h(art.NumberToken, { uid, number: 4 + i })),
        ),
      ),
    ),
  );
}

/** Close-ups at 3×: tiles with the most detail, the North Pole, and the reindeer. */
function closeUps(terrains: BaseTerrain[], uid: string) {
  return renderToStaticMarkup(
    h(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: `0 -70 ${terrains.length * 130 + 130} 140`,
        width: (terrains.length + 1) * 390,
      },
      h('defs', null, h(art.ArtDefs, { uid })),
      ...terrains.map((terrain, i) =>
        h(
          'g',
          { key: terrain, transform: `translate(${65 + i * 130} 0)` },
          h(WinterTile, { uid, terrain, seed: i + 3, grinch: terrain === 'ore' }),
        ),
      ),
      h(
        'g',
        { transform: `translate(${65 + terrains.length * 130} 0)` },
        h(NorthPoleTile, { uid }),
        h(NorthPoleRing),
        h(art.NumberToken, { uid, number: 10 }),
      ),
    ),
  );
}

/** Gingerbread pieces large, and Santa's sleigh. */
function piecesAndSleigh() {
  return renderToStaticMarkup(
    h(
      'svg',
      { xmlns: 'http://www.w3.org/2000/svg', viewBox: '-20 -50 520 80', width: 1560 },
      ...(['red', 'blue', 'teal'] as const).flatMap((seat, i) => [
        h(
          'g',
          { key: `${seat}s`, transform: `translate(${i * 110} 12)` },
          h(art.BuildingPiece, { color: PLAYER_COLORS[seat].fill, city: false, style: 'gingerbread' }),
        ),
        h(
          'g',
          { key: `${seat}c`, transform: `translate(${i * 110 + 45} 12)` },
          h(art.BuildingPiece, { color: PLAYER_COLORS[seat].fill, city: true, style: 'gingerbread' }),
        ),
      ]),
      h('g', { transform: 'translate(420 8)' }, h(Sleigh)),
    ),
  );
}

test('render the Christmas art for review', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1400 });
  await page.setContent(
    `<style>${MOTION}body{margin:16px;background:#0d6f88;color:#fff;font:600 18px sans-serif}h2{margin:10px 0}svg{display:block}</style>
     <h2>Classic</h2>${row('a', false)}<h2>Christmas</h2>${row('b', true)}<h2>Paying out (mid-motion)</h2>${row('p', true, 1)}<h2>Close-up</h2>${closeUps(['wood', 'sheep', 'wheat'], 'c1')}${closeUps(['brick', 'ore', 'desert'], 'c2')}<h2>Pieces and sleigh</h2>${piecesAndSleigh()}`,
  );
  // Tiles paying out start moving as the dice settle (1.1 s); catch them mid-motion.
  await page.waitForTimeout(1900);
  await page.screenshot({ path: 'test-results/christmas-art.png', fullPage: true });
});
