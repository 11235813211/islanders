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
  await picker.getByRole('button', { name: /^Small Isles/ }).tap();
  await expect(picker.getByRole('img', { name: 'Small Isles map' })).toBeVisible();
  await picker.getByRole('button', { name: 'Use this map' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/phone-map-detail.png' });
  await picker.getByRole('button', { name: 'Use this map' }).tap();
  await expect(page.locator('.mode-card h3')).toHaveText('Small Isles');
});

test('the board editor fits a phone, with its library and settings as drawers', async ({ page }) => {
  // The #editor address opens the editor directly (local dev allows editing for everyone).
  await page.goto('/#editor');
  await expect(page.getByRole('img', { name: 'Board being edited' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/phone-editor.png' });
  await page.getByRole('button', { name: 'Show library' }).tap();
  await expect(page.getByRole('navigation', { name: 'Board library' }).getByText('Outer Isles')).toBeInViewport();
  await page.getByRole('button', { name: 'Show settings' }).tap();
  await expect(page.getByLabel('Name', { exact: true })).toBeInViewport();
});
