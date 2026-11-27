import { copyFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BaseTerrain } from '../shared/types';
import { art } from '../src/art/v20';
import {
  BLACK_EDGE,
  CREAM_EDGE,
  GrinchCloak,
  type GrinchProps,
  GrinchSack,
  GrinchSanta,
  GrinchSantaCloak,
  GrinchSantaSlim,
} from '../src/art/v20/christmas/grinch-robber';
import { WinterTile } from '../src/art/v20/christmas/tiles';

// Review the proposed Grinch robbers beside the current robber: each design with the cream and
// the black outline, on winter tiles at board size, then on a forest tile at 3×. Writes
// test-results/grinch-robber.png and copies it to docs/proposals/ (test-results is wiped by later runs).
type Draft = (props: GrinchProps) => ReactElement;
const OPTIONS: [string, Draft][] = [
  ['Current robber', () => h(art.Robber)],
  ['A: Grinch as Santa', GrinchSanta],
  ['B: Grinch with a sack', GrinchSack],
  ['C: Green cloak and hat', GrinchCloak],
  ['D: Robber cloak as a Santa suit', GrinchSantaCloak],
  ['E: Skinny Santa suit', GrinchSantaSlim],
];
const TERRAINS: BaseTerrain[] = ['wood', 'ore', 'sheep', 'desert'];

/** The draft on each of `terrains`, `cell` pixels per tile. */
function strip(uid: string, Draft: Draft, edge: string, terrains: BaseTerrain[], cell: number) {
  return renderToStaticMarkup(
    h(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: `0 -70 ${terrains.length * 130} 140`,
        width: terrains.length * cell,
      },
      h('defs', null, h(art.ArtDefs, { uid })),
      ...terrains.map((terrain, i) =>
        h(
          'g',
          { key: terrain, transform: `translate(${i * 130 + 65} 0)` },
          h(WinterTile, { uid, terrain, seed: i }),
          terrain !== 'desert' && h(art.NumberToken, { uid, number: 6 + i }),
          h(Draft, { edge }),
        ),
      ),
    ),
  );
}

/** One design: board size and 3× forest, cream outline then black. */
function row(i: number, name: string, Draft: Draft) {
  const cells = [CREAM_EDGE, BLACK_EDGE].map(
    (edge, e) =>
      `<div class="cell"><span>${e ? 'Black outline' : 'Cream outline'}</span>${strip(`s${i}${e}`, Draft, edge, TERRAINS, 80)}${strip(`l${i}${e}`, Draft, edge, ['wood'], 200)}</div>`,
  );
  return `<h2>${name}</h2><div class="row">${cells.join('')}</div>`;
}

test('render the Grinch robber options for review', async ({ page }) => {
  await page.setViewportSize({ width: 1240, height: 1200 });
  const rows = OPTIONS.map(([name, Draft], i) => row(i, name, Draft)).join('');
  await page.setContent(
    `<style>body{margin:16px;background:#0d6f88;color:#fff;font:600 18px sans-serif}h2{margin:10px 0 4px}.row{display:flex;gap:40px}.cell{display:flex;align-items:center;gap:10px}.cell span{writing-mode:vertical-rl;transform:rotate(180deg);font-size:13px;opacity:.8}</style>${rows}`,
  );
  await page.screenshot({ path: 'test-results/grinch-robber.png', fullPage: true });
  copyFileSync('test-results/grinch-robber.png', 'docs/proposals/grinch-robber.png');
});
