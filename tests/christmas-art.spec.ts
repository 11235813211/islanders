import { readFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PLAYER_COLORS } from '../shared/colors';
import type { BaseTerrain } from '../shared/types';
import { art } from '../src/art/v20';
import { Reindeer, WinterTile } from '../src/art/v20/christmas/tiles';

// Review the Christmas art: each tile as usual and in winter, with gingerbread pieces, and a
// close-up. Writes test-results/christmas-art.png. Run: npx playwright test tests/christmas-art.spec.ts
const TERRAINS: BaseTerrain[] = ['wood', 'sheep', 'wheat', 'brick', 'ore', 'desert'];
const CELL = 130;
const MOTION = readFileSync(new URL('../src/art/v20/christmas/christmas.css', import.meta.url), 'utf8');
const SEATS = ['red', 'blue', 'white', 'green', 'pink', 'teal'] as const;

/** One row of tiles: classic art, or winter art with a gingerbread settlement and city on each. */
function row(uid: string, winter: boolean) {
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
          winter ? h(WinterTile, { uid, terrain, seed: i }) : h(art.HexTile, { uid, terrain }),
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

/** Close-ups: the reindeer, and the hills and mountains at 3×. */
function closeUps() {
  return renderToStaticMarkup(
    h(
      'svg',
      { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 -70 520 140', width: 1560 },
      h('defs', null, h(art.ArtDefs, { uid: 'cu' })),
      h('g', { transform: 'translate(65 0)' }, h(WinterTile, { uid: 'cu', terrain: 'sheep', seed: 3 })),
      h('g', { transform: 'translate(195 0)' }, h(WinterTile, { uid: 'cu', terrain: 'brick', seed: 4 })),
      h('g', { transform: 'translate(325 0)' }, h(WinterTile, { uid: 'cu', terrain: 'wheat', seed: 5 })),
      h('g', { transform: 'translate(455 0) scale(2.4)' }, h(Reindeer, { x: -3, y: 2, rudolph: true, scarf: true })),
    ),
  );
}

test('render the Christmas art for review', async ({ page }) => {
  await page.setViewportSize({ width: TERRAINS.length * CELL * 2 + 40, height: 1400 });
  await page.setContent(
    `<style>${MOTION}body{margin:16px;background:#0d6f88;color:#fff;font:600 18px sans-serif}h2{margin:10px 0}svg{display:block}</style>
     <h2>Classic</h2>${row('a', false)}<h2>Christmas</h2>${row('b', true)}<h2>Close-up</h2>${closeUps()}`,
  );
  // Let the snow, wind, and lights run a moment so the frame shows them mid-motion.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/christmas-art.png', fullPage: true });
});
