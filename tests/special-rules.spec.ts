import { expect, type Page, test } from '@playwright/test';
import { hexCenter } from '../shared/board';
import { applyAction, getActivePlayerId, getView } from '../shared/engine';
import { type BoardDesign, BUILTIN_BOARDS, tileKey } from '../shared/maps';
import type { GameState } from '../shared/types';
import { inSeatOrder, seaLobby, seeded, TEST_NOW } from './fixtures';
import { server, signIn } from './server-helpers';
import { expectNoSpill, mountGame } from './ui-harness';

/** Map special rules in the picker, on the board during and after setup, and in the editor. */

const WIDTHS = [
  [1600, 900],
  [1280, 800],
  [1024, 768],
  [820, 1000],
  [390, 844],
] as const;

/** Outer Isles with three setup rounds (the last a city), extra pieces, and a route needed to win. */
function rulesBoard(id = 'rules-test'): BoardDesign {
  const base = structuredClone(BUILTIN_BOARDS.find(b => b.id === 'outer-isles')!);
  const land = base.tiles.filter(t => t.kind !== 'sea' && t.kind !== 'iceberg' && t.kind !== 'fog');
  const keys = land.map(t => tileKey(t.q, t.r));
  return {
    ...base,
    id,
    name: 'Rules test',
    victoryPoints: 16,
    setupPieces: ['settlement', 'settlement', 'city'],
    pieceRewards: [{ points: 8, settlements: 1, cities: 2, roads: 3 }],
    routes: [{ start: keys.slice(0, 2), next: keys.slice(0, 6), finish: keys.slice(-2) }],
    routeGoal: { required: true, points: 2 },
  };
}

test('the map picker tags a board with special rules and explains each, with its route areas drawn', async ({
  page,
}) => {
  const headers = await signIn(page);
  const design = rulesBoard();
  expect((await page.request.put(`${server}/api/boards/${design.id}`, { headers, data: design })).ok()).toBe(true);
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Create room' }).click();
    await page.getByRole('radio', { name: 'Choose map' }).click();
    const picker = page.getByRole('dialog', { name: 'Maps' });
    const card = picker.locator('.map-card', { hasText: 'Rules test' });
    await expect(card.locator('.special-tag')).toHaveText(['Setup', 'Extra pieces', 'Route']);
    await picker.getByRole('button', { name: 'View Rules test' }).click();
    const rules = picker.getByRole('region', { name: 'Special rules' });
    await expect(rules.locator('.special-rule h5')).toHaveText([
      'Start with 3 pieces',
      'Extra pieces',
      'Route to finish',
    ]);
    await expect(rules).toContainText('Round 1: settlement, round 2: settlement, round 3: city.');
    await expect(rules).toContainText('At 8 points: +1 settlement, +2 cities, +3 roads.');
    await expect(rules).toContainText('To win, you also need a settlement or city in your Finish area.');
    await expect(picker.locator('.map-preview .route-zone-label')).toHaveText(['Second', 'Start', 'Finish']);
    for (const [width, height] of WIDTHS) {
      await page.setViewportSize({ width, height });
      await expectNoSpill(picker.locator('.map-info'));
      await page.screenshot({ path: `test-results/special-picker-${width}.png` });
    }
  } finally {
    await page.request.delete(`${server}/api/boards/${design.id}`, { headers });
  }
});

/** A three-seat game on the rules board, in setup with p0 to place. */
function setupGame(): GameState {
  return inSeatOrder(applyAction(seaLobby(rulesBoard(), 3), 'p0', { type: 'start' }, seeded(), TEST_NOW));
}

/** The same game past setup, each seat taking its first legal corner. */
function afterSetup(game: GameState): GameState {
  while (game.phase.startsWith('setup')) {
    const id = getActivePlayerId(game)!;
    const legal = getView(game, id).legal;
    game = applyAction(
      game,
      id,
      game.phase === 'setup-settlement'
        ? { type: 'place-settlement', vertexId: legal.settlements[0]! }
        : legal.ships.length
          ? { type: 'place-ship', edgeId: legal.ships[0]! }
          : { type: 'place-road', edgeId: legal.roads[0]! },
      seeded(),
      TEST_NOW,
    );
  }
  return game;
}

test('setup shows the order of every round and where your route must start; then only your green finish', async ({
  page,
}) => {
  const game = setupGame();
  const table = await mountGame(page, game);
  const order = page.getByRole('region', { name: 'Setup order' });
  await expect(order.locator('.setup-round')).toHaveCount(3);
  await expect(order.locator('.setup-step')).toHaveCount(9);
  await expect(order.locator('.setup-step.now')).toHaveCount(1);
  await expect(order.locator('.setup-round-label small')).toHaveText(['Settle', 'Settle', 'City']);
  await expect(page.locator('.board-svg .route-zone-label')).toHaveText(['Second', 'Start', 'Finish']);
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expectNoSpill(order);
    await page.screenshot({ path: `test-results/special-setup-${width}.png` });
  }

  table.update(g => Object.assign(g, afterSetup(game)));
  await expect(order).toBeHidden();
  await expect(page.locator('.board-svg .route-zone')).toHaveCount(1);
  await expect(page.locator('.board-svg .zone-finish')).toHaveCount(1);
  await expect(page.locator('.player-panel .route-mark')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/special-finish-390.png' });
  expect(table.errors).toEqual([]);
});

/** Click the middle of tile (q, r) on the editor canvas, below its number token. */
async function clickTile(page: Page, q: number, r: number) {
  const svg = page.locator('.editor-canvas > svg');
  const [vx, vy, vw, vh] = (await svg.getAttribute('viewBox'))!.split(' ').map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const box = (await svg.boundingBox())!;
  const c = hexCenter(q, r);
  await page.mouse.click(box.x + ((c.x - vx) / vw) * box.width, box.y + ((c.y + 32 - vy) / vh) * box.height);
}

test('the editor sets setup rounds, extra pieces, and paints routes; the panel fits at every width', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/#editor');
  await page.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name: 'Edit Outer Isles' }).click();
  const panel = page.getByRole('complementary', { name: 'Settings' });
  const special = panel.getByRole('region', { name: 'Special rules' });
  await special.getByRole('button', { name: 'More setup rounds' }).click();
  await expect(special.getByRole('radiogroup', { name: 'Round 3 piece' })).toBeVisible();
  await special.getByRole('radiogroup', { name: 'Round 2 piece' }).getByRole('radio', { name: 'City' }).click();
  await expect(
    special.getByRole('radiogroup', { name: 'Round 2 piece' }).getByRole('radio', { name: 'City' }),
  ).toHaveAttribute('aria-checked', 'true');
  await special.getByRole('button', { name: 'Add extra pieces' }).click();
  await expect(special.locator('.reward-row')).toHaveCount(1);

  await special.getByRole('button', { name: 'Add route' }).click();
  await expect(page.getByRole('button', { name: /^Route/, pressed: true })).toBeVisible();
  const land = BUILTIN_BOARDS.find(b => b.id === 'outer-isles')!.tiles.filter(t => t.kind === 'land');
  await clickTile(page, land[0]!.q, land[0]!.r);
  await expect(special.getByRole('button', { name: 'Start 1' })).toBeVisible();
  await page.locator('.editor-route-target').getByRole('radio', { name: 'Finish' }).click();
  await clickTile(page, land.at(-1)!.q, land.at(-1)!.r);
  await expect(special.getByRole('button', { name: 'Finish 1' })).toBeVisible();
  await expect(page.locator('.editor-canvas .zone-finish')).toHaveCount(1);
  await expect(special.getByRole('note')).toContainText('needs Second tiles');

  for (const [width, height] of WIDTHS) {
    await page.setViewportSize({ width, height });
    // Narrow screens keep the settings in a drawer, opened from the toolbar.
    const drawer = page.getByRole('button', { name: 'Show settings' });
    const narrow = await drawer.isVisible();
    if (narrow) await drawer.click();
    await panel.evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
    await expectNoSpill(page.locator('.editor-tools'));
    await special.scrollIntoViewIfNeeded();
    await expectNoSpill(special);
    // Nothing on the page scrolls sideways to show the panel.
    const scrolled = await page.evaluate(() =>
      [document.scrollingElement!, ...document.querySelectorAll('main, main *')]
        .filter(e => e.scrollLeft > 0)
        .map(e => e.className),
    );
    expect(scrolled).toEqual([]);
    await page.screenshot({ path: `test-results/special-editor-page-${width}.png` });
    const routes = special.locator('.special-block').last();
    await routes.scrollIntoViewIfNeeded();
    await routes.screenshot({ path: `test-results/special-routes-${width}.png` });
    if (narrow) await drawer.click();
  }
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: 'Home', exact: true }).click();
});
