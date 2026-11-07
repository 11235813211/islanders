import { expect, type Page, test } from '@playwright/test';
import { richGame } from './fixtures';
import { mountGame } from './ui-harness';

// Runs in the "iphone" project (WebKit, touch, 390×664 viewport). See playwright.config.ts.

test('the game screen fits a phone: no sideways scroll, header hidden, controls reachable by touch', async ({
  page,
}) => {
  const game = await mountGame(page, richGame());
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
  for (const name of ['Build road', 'Build settlement', 'Build city', 'End turn']) {
    const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.height, `${name} is tall enough to tap`).toBeGreaterThanOrEqual(36);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  // Tap a card to start a trade, then tap a resource to request.
  await page.getByRole('button', { name: /^Trade Lumber/ }).tap();
  const trade = page.getByRole('dialog', { name: 'Trade resources' });
  await trade.getByRole('button', { name: 'Request one more Ore' }).tap();
  await expect(trade.getByRole('button', { name: 'Send offer' })).toBeInViewport();
  await trade.getByRole('button', { name: 'Close trade' }).tap();
  expect(game.errors).toEqual([]);
});

test('typing in chat does not trigger iOS zoom (fields are at least 16px)', async ({ page }) => {
  await mountGame(page, richGame());
  await page.getByRole('button', { name: 'Open chat' }).tap();
  const size = await page.getByLabel('Chat message').evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
});

/**
 * Pinch the way a hand does: one finger lands (often on a tappable corner), the second
 * follows, then many small moves. Returns the board zoom after the fingers lift.
 */
async function pinch(page: Page, spread: number): Promise<number> {
  const board = page.locator('.board-viewport');
  const target = (await page.locator('.board-vertex-target').first().boundingBox())!;
  const x = target.x + target.width / 2,
    y = target.y + target.height / 2;
  const touch = await page.context().newCDPSession(page);
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
  await touch.detach();
  return Number(await board.getAttribute('data-zoom'));
}

test('two-finger pinch zooms the board in portrait and landscape, even starting on a target', async ({ page }) => {
  const game = await mountGame(page, richGame());
  const before = await page.locator('.board-svg').getAttribute('viewBox');
  // Fingers 60px apart spreading to 180px apart is a 3x pinch.
  expect(await pinch(page, 120)).toBeGreaterThan(2.5);
  await expect(page.locator('.board-svg')).not.toHaveAttribute('viewBox', before!);
  await page.getByRole('button', { name: 'Reset board view' }).tap();
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await pinch(page, 60)).toBeGreaterThan(1.8);
  await expect(page.locator('.map-confirm')).toHaveCount(0);
  expect(game.state().version).toBe(richGame().version);
  expect(game.errors).toEqual([]);
});

test('the home screen and lobby fit a phone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create room', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'Game settings' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/iphone-lobby.png', fullPage: true });
});
