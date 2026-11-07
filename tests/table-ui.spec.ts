import { expect, type Page, test } from '@playwright/test';
import { grant, richGame } from './fixtures';
import { mountGame } from './ui-harness';

async function fits(page: Page) {
  const boxes = await page.evaluate(() =>
    ['.board-viewport', '.player-panel', '.table-hand', '.table-actions'].map(selector => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return {
        selector,
        x: r.x,
        y: r.y,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
        viewportHeight: innerHeight,
        viewportWidth: innerWidth,
      };
    }),
  );
  for (const b of boxes) {
    expect(b.x, b.selector).toBeGreaterThanOrEqual(0);
    expect(b.right, b.selector).toBeLessThanOrEqual(b.viewportWidth + 1);
    expect(b.bottom, b.selector).toBeLessThanOrEqual(b.viewportHeight + 1);
    expect(b.height, b.selector).toBeGreaterThan(20);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test('four players, board, clumped hand and build controls fit without scrolling on desktop and phones', async ({
  page,
}) => {
  const game = await mountGame(page, richGame());
  for (const [width, height, label] of [
    [1440, 900, 'desktop'],
    [1024, 600, 'small-laptop'],
    [390, 844, 'phone'],
    [390, 667, 'small-phone'],
    [844, 390, 'landscape'],
    [667, 375, 'small-landscape'],
    [820, 1180, 'tablet'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await fits(page);
    await expect(page.locator('.board-harbor')).toHaveCount(9);
    await expect(page.locator('.player-table tbody tr')).toHaveCount(4);
    await expect(page.locator('.cards-resource-groups')).toBeInViewport();
    await page.screenshot({ path: `test-results/compact-${label}.png` });
  }
  expect(game.errors).toEqual([]);
});

test('wheel, drag, buttons, reset and touch pinch change only the board camera', async ({ page }) => {
  const game = await mountGame(page, richGame());
  const board = page.locator('.board-viewport'),
    svg = page.locator('.board-svg');
  const initial = await svg.getAttribute('viewBox');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(board).toHaveAttribute('data-zoom', '1.25');
  const rect = (await board.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => Number(await board.getAttribute('data-zoom'))).toBeGreaterThan(1.25);
  const zoomed = await svg.getAttribute('viewBox');
  await page.mouse.move(rect.x + 35, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + 100, rect.y + rect.height / 2 + 50, { steps: 8 });
  await page.mouse.up();
  await expect(svg).not.toHaveAttribute('viewBox', zoomed!);
  await page.getByRole('button', { name: 'Reset board view' }).click();
  await expect(svg).toHaveAttribute('viewBox', initial!);
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const y = rect.y + rect.height / 2,
    x = rect.x + rect.width / 2;
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
      { x: x - 90, y, id: 1 },
      { x: x + 90, y, id: 2 },
    ],
  });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touch.detach();
  await expect.poll(async () => Number(await board.getAttribute('data-zoom'))).toBeGreaterThan(1);
  expect(game.state().version).toBe(richGame().version);
  expect(game.errors).toEqual([]);
});

/**
 * Pinch the way a hand does: one finger lands (often on a tappable corner), the second
 * follows, then many small moves. Returns the board zoom after the fingers lift.
 * Uses Chrome's touch emulation, so it lives in the desktop (Chrome) project; WebKit has no CDP.
 */
async function pinch(page: Page, spread: number): Promise<number> {
  const board = page.locator('.board-viewport');
  const target = (await page.locator('.board-vertex-target').first().boundingBox())!;
  const x = target.x + target.width / 2,
    y = target.y + target.height / 2;
  const touch = await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', touchPoints: { x: number; y: number; id: number }[]) =>
    touch.send('Input.dispatchTouchEvent', { type, touchPoints });
  await send('touchStart', [{ x, y, id: 1 }]);
  await send('touchStart', [
    { x, y, id: 1 },
    { x: x + 60, y: y + 10, id: 2 },
  ]);
  for (let step = 1; step <= 12; step++) {
    const offset = (spread * step) / 12;
    await send('touchMove', [
      { x: x - offset / 2, y, id: 1 },
      { x: x + 60 + offset / 2, y: y + 10, id: 2 },
    ]);
  }
  await send('touchEnd', [{ x: x - spread / 2, y, id: 1 }]);
  await send('touchEnd', []);
  await touch.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await touch.detach();
  return Number(await board.getAttribute('data-zoom'));
}

test('two-finger pinch zooms the board on a phone in portrait and landscape, even starting on a target', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const game = await mountGame(page, richGame());
  const before = await page.locator('.board-svg').getAttribute('viewBox');
  // Fingers 60px apart spreading to 180px apart is a 3x pinch.
  expect(await pinch(page, 120)).toBeGreaterThan(2.5);
  await expect(page.locator('.board-svg')).not.toHaveAttribute('viewBox', before!);
  await page.getByRole('button', { name: 'Reset board view' }).click();
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await pinch(page, 60)).toBeGreaterThan(1.8);
  await expect(page.locator('.map-confirm')).toHaveCount(0);
  expect(game.state().version).toBe(richGame().version);
  expect(game.errors).toEqual([]);
});

test('map building needs confirmation, city art upgrades, and a solo room undoes at once', async ({ page }) => {
  const game = await mountGame(page, richGame());
  await page.getByLabel('Follow current turn').uncheck();
  const before = Object.keys(game.state().roads).length;
  await page
    .getByRole('button', { name: /^Build road at/ })
    .first()
    .click();
  expect(Object.keys(game.state().roads)).toHaveLength(before);
  await page.getByRole('button', { name: 'Confirm road', exact: true }).click();
  await expect.poll(() => Object.keys(game.state().roads).length).toBe(before + 1);
  // One person holds every seat in a solo room, so the undo needs no votes.
  // (Votes between real people are covered in social-server.spec.ts.)
  await page.getByRole('button', { name: 'Propose undo' }).click();
  await expect.poll(() => Object.keys(game.state().roads).length).toBe(before);
  await page
    .getByRole('button', { name: /^Upgrade to city at/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Confirm city', exact: true }).click();
  await expect.poll(() => Object.values(game.state().buildings).filter(b => b.kind === 'city').length).toBe(1);
  await page.getByRole('button', { name: 'Build settlement', exact: true }).hover();
  await expect(page.getByRole('tooltip').filter({ hasText: 'Build settlement' })).toBeVisible();
  expect(game.errors).toEqual([]);
});

test('resource click creates a compact timed offer, other seats accept, chat works and dev cards play', async ({
  page,
}) => {
  const initial = richGame();
  grant(initial, 'p1', { ore: 2 });
  initial.chat = Array.from({ length: 80 }, (_, i) => ({
    id: `history-${i}`,
    senderId: 'p1',
    name: 'Player 1',
    text: `Earlier message ${i}`,
    at: Date.now() - 90_000 + i * 1000,
    spectator: false,
  }));
  const game = await mountGame(page, initial);
  await page.getByLabel('Follow current turn').uncheck();
  await page.getByRole('button', { name: /^Trade Lumber/ }).click();
  await page.getByRole('button', { name: 'Request one more Ore' }).click();
  await page.getByRole('button', { name: 'Send offer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Play as', { exact: true }).selectOption('p1');
  const notice = page.getByRole('region', { name: 'Trade offer' });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('img', { name: 'Offer time remaining' })).toBeVisible();
  const banner = (await notice.boundingBox())!,
    board = (await page.locator('.board-viewport').boundingBox())!;
  expect(banner.y).toBeGreaterThanOrEqual(board.y);
  expect(banner.x + banner.width).toBeLessThanOrEqual(board.x + board.width + 1);
  // Offers sit in the top-right corner of the board.
  expect(board.x + board.width - (banner.x + banner.width)).toBeLessThan(24);
  const wood = game.state().players[1].resources.wood;
  await page.getByRole('button', { name: 'Accept trade', exact: true }).click();
  await expect.poll(() => game.state().tradeOffer).toBeNull();
  expect(game.state().players[1].resources.wood).toBe(wood + 1);
  await page.getByLabel('Chat message').fill('Trading works!');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Trading works!', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Chat message')).toHaveValue('');
  await page.getByRole('button', { name: 'Collapse chat panel' }).click();
  await expect(page.getByLabel('Chat message')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand chat panel' }).click();
  await page.getByLabel('Play as', { exact: true }).selectOption('p0');
  await page.getByRole('button', { name: 'Knight (1), ready to play' }).click();
  await page.getByRole('dialog', { name: 'Knight' }).getByRole('button', { name: 'Play Knight' }).click();
  await expect.poll(() => game.state().phase).toBe('robber');
  expect(game.state().players[0].knights).toBe(1);
  expect(game.errors).toEqual([]);
});

test('players can propose and unanimously confirm pause while everyone is connected', async ({ page }) => {
  const game = await mountGame(page, richGame());
  await page.getByLabel('Follow current turn').uncheck();
  await page.getByRole('button', { name: 'Propose pause', exact: true }).click();
  expect(game.state().pausedAt).toBeNull();
  expect(game.state().proposal!.required).toHaveLength(4);
  for (const id of ['p1', 'p2', 'p3']) {
    await page.getByLabel('Play as', { exact: true }).selectOption(id);
    await page.getByRole('button', { name: 'Approve proposal' }).click();
  }
  await expect.poll(() => game.state().pausedAt).not.toBeNull();
  await expect(page.getByText('Paused · clocks are stopped')).toBeVisible();
  await page.getByRole('button', { name: 'Propose resume', exact: true }).click();
  for (const id of ['p0', 'p1', 'p2']) {
    await page.getByLabel('Play as', { exact: true }).selectOption(id);
    await page.getByRole('button', { name: 'Approve proposal' }).click();
  }
  await expect.poll(() => game.state().pausedAt).toBeNull();
  expect(game.errors).toEqual([]);
});

test('discard choices leave pause controls accessible, and holding a build button shows its recipe', async ({
  page,
}) => {
  const initial = richGame();
  initial.phase = 'discard';
  initial.pendingDiscards = { p0: 14 };
  await mountGame(page, initial);
  // The discard panel sits in the board corner and blocks nothing else.
  await expect(page.getByRole('dialog', { name: 'Discard resources' })).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Propose pause', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Game proposal' })).toBeVisible();
  const recipe = page.locator('.recipe-control').first();
  await page.clock.install();
  await recipe.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1 });
  await page.clock.runFor(450);
  await expect(recipe.getByRole('tooltip')).toBeVisible();
  await recipe.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 1 });
});

test('discarding picks cards by tapping the hand and puts them back by tapping the panel', async ({ page }) => {
  const initial = richGame();
  initial.phase = 'discard';
  initial.pendingDiscards = { p0: 3 };
  const game = await mountGame(page, initial);
  const panel = page.getByRole('dialog', { name: 'Discard resources' });
  const discard = panel.getByRole('button', { name: 'Discard 3' });
  await expect(panel.locator('..')).toHaveClass(/board-corner/);
  await expect(page.locator('.stepper')).toHaveCount(0);
  for (const card of ['Trade Lumber', 'Trade Lumber', 'Trade Ore', 'Trade Ore'])
    await page.getByRole('button', { name: new RegExp(`^${card}`) }).click();
  // Only three are owed, so the fourth tap is ignored.
  await expect(panel).toContainText('3 / 3 chosen');
  await panel.getByRole('button', { name: 'Put back one Lumber' }).click();
  await expect(panel).toContainText('2 / 3 chosen');
  await expect(discard).toBeDisabled();
  await page.getByRole('button', { name: /^Trade Grain/ }).click();
  await discard.click();
  await expect.poll(() => game.state().pendingDiscards.p0 ?? 0).toBe(0);
  const p0 = game.state().players[0]!.resources;
  expect([p0.wood, p0.ore, p0.wheat]).toEqual([
    initial.players[0]!.resources.wood - 1,
    initial.players[0]!.resources.ore - 1,
    initial.players[0]!.resources.wheat - 1,
  ]);
  expect(game.errors).toEqual([]);
});
