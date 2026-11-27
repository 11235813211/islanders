import { expect, test } from '@playwright/test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hexCenter, hexCorner } from '../shared/board';
import { candyGraph } from '../shared/maps/candy-train';
import { newDesign } from '../shared/maps/edit';
import type { ClassicResource } from '../shared/types';
import { CandyTile as BeforeTile } from '../src/art/v21/christmas/candy-tiles';
import { art } from '../src/art/v22';
import { CandyTile } from '../src/art/v22/christmas/candy-tiles';
import { CandyRailways } from '../src/art/v22/christmas/train';

const RESOURCES: ClassicResource[] = ['sheep', 'ore', 'brick', 'wood', 'wheat'];

/** The v21 options picked for each resource, to compare against v22's refinements. */
const PICKED = { sheep: 'a', ore: 'a', brick: 'a', wood: 'b', wheat: 'b' } as const;

/** One row of five tiles with number tokens, large enough to judge the composition. */
function row(title: string, uid: string, tile: (terrain: ClassicResource) => ReturnType<typeof h>) {
  return (
    `<h2>${title}</h2>` +
    renderToStaticMarkup(
      h(
        'svg',
        { viewBox: '-65 -68 650 140', width: 1500 },
        h('defs', null, h(art.ArtDefs, { uid })),
        ...RESOURCES.map((terrain, i) =>
          h(
            'g',
            { key: terrain, transform: `translate(${i * 130} 0)` },
            tile(terrain),
            h(art.NumberToken, { uid, number: 8 }),
          ),
        ),
      ),
    )
  );
}

test('review the candy tiles against the v21 picks, and the raised train beside roads and buildings', async ({
  page,
}) => {
  const rows =
    row('v22', 'review-new', terrain => h(CandyTile, { uid: 'review-new', terrain })) +
    row('v21 picks', 'review-old', terrain =>
      h(BeforeTile, { uid: 'review-old', terrain, style: PICKED[terrain as keyof typeof PICKED] }),
    );
  const d = newDesign('blank', 'review', 'review', 'Train');
  d.tiles = [
    { q: 0, r: 0, kind: 'wheat' },
    { q: 1, r: 0, kind: 'wood' },
    { q: 1, r: -1, kind: 'ore' },
  ];
  d.candyRoutes = [{ side: -1, corners: ['0,0,3', '0,0,2', '0,0,1', '0,0,0', '0,0,5', '1,-1,0', '1,-1,5', '1,-1,4'] }];
  const corners = d.candyRoutes[0]!.corners.map(key => {
    const [q, r, c] = key.split(',').map(Number);
    const center = hexCenter(q!, r!);
    return hexCorner(center.x, center.y, c!);
  });
  // Roads on the edges that leave the route: the ones on the rails' side get level crossings.
  const graph = candyGraph(d.tiles);
  const onRoute = new Set(corners.map(p => `${Math.round(p.x)},${Math.round(p.y)}`));
  const spokes = d.candyRoutes[0]!.corners.flatMap(key => {
    const from = graph.get(key)!;
    return [...from.neighbors]
      .map(k => graph.get(k)!)
      .filter(to => !onRoute.has(`${Math.round(to.x)},${Math.round(to.y)}`))
      .map(to => ({ from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, color: '#c8463a' }));
  });
  const routeRoads = corners.slice(1).map((to, i) => ({ from: corners[i]!, to, color: '#256cca' }));
  const train = renderToStaticMarkup(
    h(
      'svg',
      { viewBox: '-90 -190 350 330', width: 1100 },
      h('defs', null, h(art.ArtDefs, { uid: 'train' })),
      ...d.tiles.map(t => {
        const p = hexCenter(t.q, t.r);
        return h(
          'g',
          { key: `${t.q},${t.r}`, transform: `translate(${p.x} ${p.y})` },
          h(CandyTile, { uid: 'train', terrain: t.kind as ClassicResource }),
          h(art.NumberToken, { uid: 'train', number: 8 }),
        );
      }),
      ...corners.slice(1).map((p, i) => h(art.Road, { key: i, from: corners[i]!, to: p, color: '#256cca' })),
      ...[corners[3]!, corners[6]!].map((p, i) =>
        h(
          'g',
          { key: i, transform: `translate(${p.x} ${p.y})` },
          h(art.BuildingPiece, { color: '#2878bd', city: !!i, style: 'gingerbread' }),
        ),
      ),
      ...spokes.map((road, i) => h(art.Road, { key: `spoke${i}`, ...road })),
      h(CandyRailways, { design: d, paused: true, roads: [...routeRoads, ...spokes] }),
    ),
  );
  await page.setViewportSize({ width: 1540, height: 1800 });
  await page.setContent(
    `<style>body{margin:20px;background:#184e51;color:#fff8e7;font:18px system-ui}h2{margin:12px 0}svg{display:block}p{margin:6px 0}</style><h1>Christmas Candy</h1><p>Cotton candy · Kisses · Twizzlers · Candy canes · Gumdrops</p>${rows}<h2>Railroad · roads and buildings stay on their edges; roads across the rails get crossings</h2>${train}`,
  );
  await expect(page.locator('[data-candy-terrain]')).toHaveCount(13);
  expect(await page.locator('.candy-crossing').count()).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/christmas-candy-review.png', fullPage: true });
});
