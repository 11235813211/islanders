import { expect, test } from '@playwright/test';
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
  await expect(trade.getByRole('button', { name: 'Offer to players' })).toBeInViewport();
  await trade.getByRole('button', { name: 'Close trade' }).tap();
  expect(game.errors).toEqual([]);
});

test('typing in chat does not trigger iOS zoom (fields are at least 16px)', async ({ page }) => {
  await mountGame(page, richGame());
  await page.getByRole('button', { name: 'Open chat' }).tap();
  const size = await page.getByLabel('Chat message').evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
});

test('the home screen and lobby fit a phone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create room', exact: true }).tap();
  await expect(page.getByRole('heading', { name: 'Game settings' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/iphone-lobby.png', fullPage: true });
});

test('the map picker and a map’s large view fit a phone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create room', exact: true }).tap();
  await page.getByRole('radio', { name: 'Choose map' }).tap();
  const picker = page.getByRole('dialog', { name: 'Maps' });
  await expect(picker.getByRole('heading', { name: 'Seafaring' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/phone-map-picker.png' });
  await picker.getByRole('button', { name: 'View Small Isles' }).tap();
  await expect(picker.getByRole('img', { name: 'Small Isles map' })).toBeVisible();
  await picker.getByRole('button', { name: 'Use this map' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/phone-map-detail.png' });
  await picker.getByRole('button', { name: 'Use this map' }).tap();
  await expect(page.locator('.mode-card h3')).toHaveText('Small Isles');
});

test('the board editor fits a phone, with its settings as a drawer', async ({ page }) => {
  // The #editor address opens the editor directly (local dev allows editing for everyone).
  await page.goto('/#editor');
  await page.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name: 'Edit Outer Isles' }).tap();
  await expect(page.getByRole('img', { name: 'Board being edited' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/phone-editor.png' });
  // The fills sit in the top bar; the drawer holds the land mix.
  await expect(page.getByRole('button', { name: 'Fill land', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Show settings' }).tap();
  await expect(page.getByRole('heading', { name: 'Random land mix' })).toBeInViewport();
});

test('tapping a number token in the editor raises it on a phone', async ({ page }) => {
  await page.goto('/#editor');
  await page.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name: 'Edit Fire and Ice' }).tap();
  const tokens = page.locator('.editor-token');
  await expect(tokens.first()).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).tap();
  const viewport = page.viewportSize()!;
  // A token in view and clear of the zoom buttons on the left.
  const boxes = await tokens.evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON() as DOMRect));
  const spot = boxes
    .map(b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 }))
    .find(p => p.x > 90 && p.x < viewport.width - 20 && p.y > 0 && p.y < viewport.height - 20);
  expect(spot, 'a number token is in view').toBeTruthy();
  const labels = () => tokens.evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
  const before = await labels();
  await page.touchscreen.tap(spot!.x, spot!.y);
  await expect.poll(labels, { message: 'the number changes on tap' }).not.toEqual(before);
});
