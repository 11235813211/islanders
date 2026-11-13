import { expect, test } from '@playwright/test';
import { applyAction, getView } from '../shared/engine';
import { grant, inSeatOrder, makeLobby, richGame, seeded, TEST_NOW } from './fixtures';
import { mountGame, seatRgb } from './ui-harness';

test('map confirmation cancels outside, toolbar roads and cities build immediately', async ({ page }) => {
  const game = await mountGame(page, richGame());
  const roads = Object.keys(game.state().roads).length;
  await page
    .getByRole('button', { name: /^Build road at/ })
    .first()
    .click();
  await expect(page.getByRole('button', { name: 'Confirm road', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel placement' })).toHaveCount(0);
  await page.locator('.turn-clock').click();
  await expect(page.locator('.map-confirm')).toHaveCount(0);
  expect(Object.keys(game.state().roads)).toHaveLength(roads);
  await page.getByRole('button', { name: 'Build road', exact: true }).click();
  await page
    .getByRole('button', { name: /^Build road at/ })
    .first()
    .click();
  await expect.poll(() => Object.keys(game.state().roads).length).toBe(roads + 1);
  await expect(page.locator('.map-confirm')).toHaveCount(0);
  await page.getByRole('button', { name: 'Build city', exact: true }).click();
  await page
    .getByRole('button', { name: /^Upgrade to city at/ })
    .first()
    .click();
  await expect.poll(() => Object.values(game.state().buildings).filter(b => b.kind === 'city').length).toBe(1);
  await expect(page.locator('.map-confirm')).toHaveCount(0);
  expect(game.errors).toEqual([]);
});

test('private totals, no dev stacks without cards, player-colored build pieces and colored recipes', async ({
  page,
}) => {
  const initial = richGame();
  initial.players[0].development = [{ id: 'vp', kind: 'victory-point', boughtTurn: 0 }];
  await mountGame(page, initial);
  await page.getByLabel('Follow current turn').uncheck();
  const own = page.getByRole('row', { name: 'Player 0, you', exact: true });
  await expect(own.locator('.points')).toHaveText('2 (3)');
  await expect(page.getByRole('row', { name: 'Player 1', exact: true }).locator('.stat-dev')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Buy development card' })).toContainText('Dev Card');
  const build = page.getByRole('button', { name: 'Build city', exact: true });
  await expect(build.locator('svg')).toHaveCSS('color', seatRgb('red'));
  await build.hover();
  await expect(page.getByRole('tooltip').filter({ hasText: 'Build city' }).locator('.resource-icon')).toHaveCount(5);
  await expect(page.locator('.board-harbor .resource-icon')).toHaveCount(5);
  const fills = await page
    .locator('.board-harbor .resource-icon')
    .evaluateAll(icons =>
      icons.map(icon => [...icon.querySelectorAll('[fill]')].map(node => node.getAttribute('fill'))),
    );
  expect(new Set(fills.flat()).size).toBeGreaterThan(10);
  await page.getByLabel('Play as', { exact: true }).selectOption('p1');
  await expect(page.getByRole('row', { name: 'Player 0', exact: true }).locator('.points')).toHaveText('2');
  await expect(page.locator('.cards-dev')).toHaveCount(0);
  await expect(build.locator('svg')).toHaveCSS('color', seatRgb('blue'));
});

test('trade stays beside the hand, collects hand clicks and supports bank exchanges on every viewport', async ({
  page,
}) => {
  const initial = richGame(),
    game = await mountGame(page, initial);
  await page.getByRole('button', { name: /^Trade Lumber/ }).click();
  await page.getByRole('button', { name: /^Trade Lumber/ }).click();
  await page.getByRole('button', { name: /^Trade Brick/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Trade resources' });
  await expect(dialog.getByRole('button', { name: 'Remove one Lumber from give' })).toHaveText('2');
  await expect(dialog.getByRole('button', { name: 'Remove one Brick from give' })).toHaveText('1');
  await dialog.getByRole('button', { name: 'Request one more Ore' }).click();
  await dialog.getByRole('button', { name: 'Request one more Grain' }).click();
  for (const [width, height, label] of [
    [1440, 900, 'desktop'],
    [390, 844, 'phone'],
    [390, 667, 'small-phone'],
    [844, 390, 'landscape'],
    [667, 375, 'small-landscape'],
  ] as const) {
    await page.setViewportSize({ width, height });
    const box = (await dialog.boundingBox())!,
      board = (await page.locator('.board-viewport').boundingBox())!;
    expect(box.x - board.x).toBeLessThan(10);
    expect(box.y + box.height).toBeLessThanOrEqual(board.y + board.height);
    expect(box.y).toBeGreaterThanOrEqual(board.y);
    await expect(dialog.getByRole('button', { name: 'Offer to players' })).toBeInViewport();
    await page.screenshot({ path: `test-results/trading-${label}.png` });
  }
  await dialog.getByRole('button', { name: 'Offer to players' }).click();
  await expect.poll(() => game.state().tradeOffer?.give.wood).toBe(2);
  expect(game.state().tradeOffer?.give.brick).toBe(1);
  expect(game.state().tradeOffer?.want).toMatchObject({ ore: 1, wheat: 1 });
  await page.getByRole('button', { name: 'Withdraw offer' }).click();
  // A bank trade is the same draft at your harbor rate: Bank stays off until it matches.
  const before = game.state().players[0].resources.wood,
    rate = getView(game.state(), 'p0').tradeRates.wood;
  await page.getByRole('button', { name: /^Trade Lumber/ }).click();
  await dialog.getByRole('button', { name: 'Request one more Ore' }).click();
  if (rate > 1) await expect(dialog.getByRole('button', { name: 'Bank', exact: true })).toBeDisabled();
  for (let i = 1; i < rate; i++) await page.getByRole('button', { name: /^Trade Lumber/ }).click();
  await expect(dialog.getByRole('button', { name: 'Remove one Lumber from give' })).toHaveText(String(rate));
  await dialog.getByRole('button', { name: 'Bank', exact: true }).click();
  await expect.poll(() => game.state().players[0].resources.wood).toBe(before - rate);
  // One bank trade can buy several cards, mixing kinds: wool and brick at their rates, for ore and grain.
  const rates = getView(game.state(), 'p0').tradeRates;
  for (let i = 0; i < rates.sheep; i++) await page.getByRole('button', { name: /^Trade Wool/ }).click();
  for (let i = 0; i < rates.brick; i++) await page.getByRole('button', { name: /^Trade Brick/ }).click();
  await dialog.getByRole('button', { name: 'Request one more Ore' }).click();
  await expect(dialog.getByRole('button', { name: 'Bank', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Request one more Grain' }).click();
  const { ore, sheep } = game.state().players[0].resources;
  await dialog.getByRole('button', { name: 'Bank', exact: true }).click();
  await expect.poll(() => game.state().players[0].resources.ore).toBe(ore + 1);
  expect(game.state().players[0].resources.sheep).toBe(sheep - rates.sheep);
  expect(game.errors).toEqual([]);
});

test('victim selection uses readable player-colored cards inside the board', async ({ page }) => {
  const g = richGame();
  g.phase = 'steal';
  g.buildings = {};
  const hex = g.board.hexes[0];
  g.robber = hex.id;
  g.buildings[hex.vertexIds[0]] = { playerId: 'p1', kind: 'settlement' };
  g.buildings[hex.vertexIds[3]] = { playerId: 'p2', kind: 'settlement' };
  grant(g, 'p1', { ore: 1 });
  grant(g, 'p2', { ore: 2 });
  const game = await mountGame(page, g);
  const chooser = page.getByRole('region', { name: 'Choose a player to steal from' });
  await expect(chooser).toBeVisible();
  const blue = chooser.getByRole('button', { name: 'Steal from Player 1' });
  await expect(blue).toHaveCSS('border-top-color', seatRgb('blue'));
  await expect(chooser.getByRole('button', { name: 'Steal from Player 2' })).toHaveCSS(
    'border-top-color',
    seatRgb('white'),
  );
  await page.setViewportSize({ width: 390, height: 667 });
  await page.screenshot({ path: 'test-results/steal-phone.png' });
  await blue.click();
  await expect.poll(() => game.state().phase).toBe('build');
  expect(game.errors).toEqual([]);
});

test('pause proposals show individual yes, pending and no votes and permit a new proposal', async ({ page }) => {
  await mountGame(page, richGame());
  await page.getByLabel('Follow current turn').uncheck();
  await page.getByRole('button', { name: 'Propose pause', exact: true }).click();
  await expect(page.getByLabel('Player 0: yes', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Player 1: not yet approved', { exact: true })).toBeVisible();
  await page.getByLabel('Play as', { exact: true }).selectOption('p1');
  await page.getByRole('button', { name: 'Reject proposal' }).click();
  await expect(page.getByLabel('Player 1: no', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Propose pause', exact: true }).click();
  await expect(page.getByLabel('Player 1: yes', { exact: true })).toBeVisible();
});

test('releasing outside the board or canceling touch never leaves a stale drag', async ({ page }) => {
  const game = await mountGame(page, richGame());
  const board = page.locator('.board-viewport'),
    svg = page.locator('.board-svg');
  const box = (await board.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 40, box.y + 60);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Reset board view' }).click();
  const reset = await svg.getAttribute('viewBox');
  await page.mouse.move(box.x + 50, box.y + 50);
  await expect(svg).toHaveAttribute('viewBox', reset!);
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: x - 40, y, id: 1 },
      { x: x + 40, y, id: 2 },
    ],
  });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: x - 70, y, id: 1 },
      { x: x + 70, y, id: 2 },
    ],
  });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await touch.detach();
  await page.getByRole('button', { name: 'Reset board view' }).click();
  await page.mouse.move(x + 30, y + 30);
  await expect(svg).toHaveAttribute('viewBox', reset!);
  await page
    .getByRole('button', { name: /^Build road at/ })
    .first()
    .click();
  await expect(page.getByRole('button', { name: 'Confirm road', exact: true })).toBeVisible();
  expect(game.errors).toEqual([]);
});

test('corners breathe in step, hover and picking show the seat color, and city upgrades stay unmarked', async ({
  page,
}) => {
  const setup = inSeatOrder(applyAction(makeLobby(2), 'p0', { type: 'start' }, seeded(), TEST_NOW));
  setup.testMode = true;
  const game = await mountGame(page, setup);
  // Each circle's current size as a share of its full size: equal shares mean the same point in the rhythm.
  const phases = () =>
    page
      .locator('.board-pulse')
      .evaluateAll(circles =>
        circles.map(c =>
          ((c as SVGCircleElement).r.animVal.value / (c as SVGCircleElement).r.baseVal.value).toFixed(2),
        ),
      );
  const corner = page.getByRole('button', { name: /^Build settlement at/ }).first();
  await corner.hover();
  await expect(corner.locator('.board-pulse-hover')).toHaveCSS('fill', seatRgb('red', 'fill'));
  await expect(corner.locator('.board-pulse')).toBeHidden();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(700);
  expect(new Set(await phases()).size).toBe(1);
  // A picked corner stays still and colored while the confirm card is up.
  await corner.click();
  await page.mouse.move(5, 5);
  await expect(corner.locator('.board-pulse-hover')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm settlement', exact: true }).click();
  await page
    .getByRole('button', { name: /^Build road at/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Confirm road', exact: true }).click();
  // The next seat's corners appear later, mid-rhythm, and still move together.
  await expect.poll(() => game.state().setupIndex).toBe(1);
  await expect(page.getByRole('button', { name: /^Build settlement at/ }).first()).toBeVisible();
  await page.waitForTimeout(500);
  expect((await phases()).length).toBeGreaterThan(1);
  expect(new Set(await phases()).size).toBe(1);
  expect(game.errors).toEqual([]);
});

test('settlements that can become cities are clickable without a marker', async ({ page }) => {
  await mountGame(page, richGame());
  await page.getByLabel('Follow current turn').uncheck();
  const upgrade = page.getByRole('button', { name: /^Upgrade to city at/ }).first();
  await expect(upgrade.locator('.board-target-mark')).toHaveCount(0);
  await upgrade.click();
  await expect(page.getByRole('button', { name: 'Confirm city', exact: true })).toBeVisible();
});

test('a setup spot tapped but not confirmed is placed before the clock runs out', async ({ page }) => {
  const start = inSeatOrder(applyAction(makeLobby(3), 'p0', { type: 'start' }, seeded(), Date.now()));
  start.turnDeadline = Date.now() + 4000;
  const game = await mountGame(page, start);
  const target = page.getByRole('button', { name: /settlement at/ }).first();
  await target.click();
  await expect(page.locator('.map-confirm')).toBeVisible();
  expect(Object.keys(game.state().buildings)).toHaveLength(0);
  await expect.poll(() => Object.keys(game.state().buildings).length, { timeout: 6000 }).toBe(1);
  expect(game.errors).toEqual([]);
});
