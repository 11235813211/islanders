import { readFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PLAYER_COLORS } from '../shared/colors';
import { RESOURCES, type Resource, type Terrain } from '../shared/types';
import {
  ART_VERSION,
  ArtDefs,
  CARD_COLORS,
  CARTOGRAPHERS,
  NumberToken,
  PeekVeil,
  ResourceArt,
  ResourceIcon,
  ROAD_INSET,
  SEA,
  Tile,
} from '../src/art';

// Cartographers art beside the base tiles and cards: writes test-results/cartographers-art.png
// and cartographers-art-phone.png. Run: npx playwright test tests/cartographers-art.spec.ts
const CELL = 130;
const LABELS: Record<Resource, string> = {
  wood: 'Lumber',
  brick: 'Brick',
  sheep: 'Wool',
  wheat: 'Grain',
  ore: 'Ore',
  lodestone: 'Lodestone',
};
/** Tiles with their numbers: the first is the tile's own, the rest were charted. */
const TILES: [Terrain, number[]][] = [
  ['wood', [9]],
  ['wheat', [6, 3]],
  ['ore', [8, 9, 10]],
  ['lodestone', [5]],
  ['lodestone', [6, 2]],
  ['sheep', [6, 5, 2]],
];
const css = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const STYLE = `<style>
  ${css('../src/components/Board.css')}
  ${css('../src/components/GameTable.css')}
  ${css('../src/components/Cards.css')}
  body{margin:16px;background:#0d6f88;color:#fff;font:14px sans-serif}
  svg.row{display:block;margin-bottom:12px;max-width:100%;height:auto}
  h1{font-size:20px;margin:0 0 12px}h2{font-size:16px;margin:18px 0 8px}
  .hand{display:flex;gap:18px;height:110px;align-items:end;background:#f4ecd6;padding:10px 16px;border-radius:8px;width:max-content}
  .hand .cards-resource-group{flex:none;width:72px}
  text{font-family:sans-serif}
</style>`;

function tiles(uid: string, width: number) {
  return renderToStaticMarkup(
    h(
      'svg',
      { className: 'row', xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 -70 ${TILES.length * CELL} 155`, width },
      h('defs', null, h(ArtDefs, { uid }), h(SEA.Defs, { uid })),
      ...TILES.map(([terrain, [number, ...extra]], i) =>
        h(
          'g',
          { key: i, transform: `translate(${i * CELL + CELL / 2} 0)` },
          h(Tile, { uid, terrain }),
          h(
            'g',
            { transform: 'translate(0 8)' },
            h('g', { transform: 'translate(0 -8)' }, h(NumberToken, { uid, number: number! })),
            extra.length ? h(CARTOGRAPHERS.ExtraNumbers, { numbers: extra }) : null,
          ),
          h(
            'text',
            { y: 76, textAnchor: 'middle', fill: '#fff', fontSize: 11 },
            `${terrain} ${[number, ...extra].join('-')}`,
          ),
        ),
      ),
    ),
  );
}

/** Fog as everyone sees it, then fog tiles you peeked at: the hidden tile under edge mist. */
const PEEKS: [Terrain, number][] = [
  ['wheat', 9],
  ['ore', 6],
  ['sheep', 4],
  ['lodestone', 10],
  ['wood', 8],
];
function fog(uid: string, width: number) {
  const count = PEEKS.length + 1;
  return renderToStaticMarkup(
    h(
      'svg',
      { className: 'row', xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 -70 ${count * CELL} 140`, width },
      h('defs', null, h(ArtDefs, { uid }), h(SEA.Defs, { uid })),
      h('rect', { x: 0, y: -70, width: count * CELL, height: 140, fill: '#1c9fc5' }),
      h('g', { transform: `translate(${CELL / 2} 0)` }, h(Tile, { uid, terrain: 'fog' })),
      ...PEEKS.map(([terrain, number], i) =>
        h(
          'g',
          { key: terrain, transform: `translate(${(i + 1) * CELL + CELL / 2} 0)` },
          h(Tile, { uid, terrain }),
          h(PeekVeil, { uid }),
          h(NumberToken, { uid, number }),
        ),
      ),
    ),
  );
}

/** Relay stations on land and survey ships at sea, one pair per seat color. */
function pieces(uid: string, width: number) {
  const colors = Object.values(PLAYER_COLORS);
  const step = 78;
  return renderToStaticMarkup(
    h(
      'svg',
      { className: 'row', xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 -50 ${colors.length * step} 130`, width },
      h('defs', null, h(ArtDefs, { uid }), h(SEA.Defs, { uid })),
      h('rect', { x: 0, y: -50, width: colors.length * step, height: 60, fill: '#8f8b5c' }),
      h('rect', { x: 0, y: 10, width: colors.length * step, height: 70, fill: '#1c9fc5' }),
      ...colors.map((color, i) => {
        const x = i * step + step / 2;
        return h(
          'g',
          { key: color.label },
          h(CARTOGRAPHERS.Relay, {
            from: { x: x - 30, y: -18 },
            to: { x: x + 30, y: -18 },
            color: color.fill,
            inset: ROAD_INSET,
          }),
          h(CARTOGRAPHERS.SurveyShip, { from: { x: x - 26, y: 44 }, to: { x: x + 26, y: 44 }, color: color.fill }),
        );
      }),
    ),
  );
}

/** The same markup as CardGroup in ResourceHand.tsx (which imports CSS, so a spec cannot load it). */
function card(resource: Resource): ReactElement {
  const { base, light, dark } = CARD_COLORS[resource];
  return h(
    'div',
    {
      key: resource,
      className: 'cards-resource-group',
      style: { '--card': base, '--card-light': light, '--card-dark': dark },
    },
    h(
      'div',
      { className: 'cards-stack' },
      ...[-1, 0, 1].map(spread =>
        h(
          'div',
          {
            key: spread,
            className: 'cards-physical',
            style: { '--card-turn': `${spread * 2.5}deg`, '--card-shift': `${spread * 4}px`, animation: 'none' },
          },
          h(
            'div',
            { className: 'cards-face' },
            h('span', { className: 'cards-corner' }, h(ResourceIcon, { resource, size: 13 })),
            h(ResourceArt, { resource }),
            h('span', { className: 'cards-card-label' }, LABELS[resource]),
          ),
        ),
      ),
    ),
    h('strong', { className: 'cards-count' }, 3),
  );
}

const hand = () => renderToStaticMarkup(h('div', { className: 'hand' }, ...RESOURCES.map(card)));

test('render Cartographers art for review', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.setContent(
    `${STYLE}<h1>Cartographers · ${ART_VERSION}</h1>
    <h2>Tiles and charted numbers</h2>${tiles('tiles', 1060)}
    <h2>Board scale</h2>${tiles('small', 560)}
    <h2>Fog, then fog tiles you peeked at</h2>${fog('fog', 1060)}
    <h2>Relay stations and survey ships</h2>${pieces('pieces', 1060)}
    <h2>Cards</h2>${hand()}`,
  );
  await page.screenshot({ path: 'test-results/cartographers-art.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 700 });
  await page.setContent(
    `${STYLE}<h1>Phone scale</h1>${tiles('phone', 358)}${fog('phone-fog', 358)}${pieces('phone-pieces', 358)}
    <div style="transform:scale(.8);transform-origin:0 0">${hand()}</div>`,
  );
  await page.screenshot({ path: 'test-results/cartographers-art-phone.png', fullPage: true });
});
