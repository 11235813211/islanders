import { expect, test } from '@playwright/test';
import { BUILTIN_BOARDS } from '../shared/maps';
import { grant, richGame, seaSettled } from './fixtures';
import { expectNoSpill, mountGame } from './ui-harness';

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

test('the help button opens touch-worded help that fits a phone', async ({ page }) => {
  const game = await mountGame(page, richGame());
  await page.getByRole('button', { name: 'How to play here' }).tap();
  const help = page.getByRole('dialog', { name: 'How to play here' });
  await expect(help.getByRole('heading', { name: 'Right now' })).toBeVisible();
  await expect(help).toContainText('tap a card in your hand');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/phone-help.png' });
  await help.getByRole('button', { name: 'Close dialog' }).tap();
  await expect(help).toBeHidden();
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
  // The map card's Maps button stays inside the card.
  const card = (await page.locator('.mode-card').boundingBox())!;
  const maps = (await page.locator('.mode-card').getByRole('button', { name: 'Maps' }).boundingBox())!;
  expect(maps.x + maps.width).toBeLessThanOrEqual(card.x + card.width);
  await page.locator('.mode-card').screenshot({ path: 'test-results/phone-map-card.png' });
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

test('the bank strip fits under the scoreboard on a phone, and the controls still fit', async ({ page }) => {
  const g = richGame();
  g.settings.showBank = 'always';
  await mountGame(page, g);
  await expect(page.getByRole('group', { name: 'Cards left in the bank' })).toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const end = (await page.getByRole('button', { name: 'End turn', exact: true }).boundingBox())!;
  expect(end.y + end.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.screenshot({ path: 'test-results/phone-bank.png' });
});

test('portrait phone: the turn line sits beside the hand, chat covers the scoreboard, and the scoreboard folds', async ({
  page,
}) => {
  const game = await mountGame(page, richGame());
  const hand = (await page.locator('.table-hand').boundingBox())!;
  const turn = (await page.locator('.table-turn').boundingBox())!;
  expect(turn.x).toBeGreaterThanOrEqual(hand.x + hand.width - 1);
  expect(Math.abs(turn.y - hand.y)).toBeLessThan(2);
  await page.screenshot({ path: 'test-results/phone-portrait-hand.png' });

  // Chat opens over the scoreboard, starting where it starts.
  await page.getByRole('button', { name: 'Open chat' }).tap();
  const chat = (await page.locator('.chat-panel').boundingBox())!;
  const scores = (await page.locator('.player-panel').boundingBox())!;
  expect(Math.abs(chat.y - scores.y)).toBeLessThan(2);
  await page.screenshot({ path: 'test-results/phone-portrait-chat.png' });
  await page.getByRole('button', { name: 'Open chat' }).tap();

  // Fold the scoreboard: one line of points, and the board grows into the space.
  const board = (await page.locator('.board-viewport').boundingBox())!;
  await page.getByRole('button', { name: 'Fold the scoreboard' }).tap();
  await expect(page.getByRole('list', { name: 'Points' })).toBeVisible();
  await expect(page.locator('.player-table')).toBeHidden();
  const taller = (await page.locator('.board-viewport').boundingBox())!;
  expect(taller.height).toBeGreaterThan(board.height + 60);
  await page.screenshot({ path: 'test-results/phone-portrait-folded.png' });
  // Remembered in this browser; unfolds again.
  expect(await page.evaluate(() => localStorage.getItem('islanders:scoreboard-folded'))).toBe('1');
  await page.getByRole('button', { name: 'Show the scoreboard' }).tap();
  await expect(page.locator('.player-table')).toBeVisible();
  expect(game.errors).toEqual([]);
});

test('landscape phone: chat, activity, and dice open over the right column with room to use them', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const g = richGame();
  for (let i = 4; i < 6; i++) g.players.push({ ...structuredClone(g.players[1]!), id: `p${i}`, name: `Player ${i}` });
  const game = await mountGame(page, g);
  const panel = page.getByRole('region', { name: 'Room conversation' });
  // Closed at first, so the scoreboard and hand show; opening it covers the right column.
  await expect(page.getByLabel('Chat message')).toBeHidden();
  await page.getByRole('button', { name: 'Open chat' }).tap();
  expect((await panel.boundingBox())!.height).toBeGreaterThan(250);
  await expect(page.getByLabel('Chat message')).toBeInViewport();
  await panel.getByRole('button', { name: /activity/i }).tap();
  await expect(panel.locator('.activity-list')).toBeVisible();
  await panel.getByRole('button', { name: /dice/i }).tap();
  await expect(panel.getByRole('img', { name: 'Dice results histogram' })).toBeVisible();
  await page.screenshot({ path: 'test-results/phone-landscape-chat.png' });
  expect(game.errors).toEqual([]);
});

test('the scoreboard fold button sits in the header row, clear of the first name', async ({ page }) => {
  await mountGame(page, richGame());
  const fold = (await page.getByRole('button', { name: 'Fold the scoreboard' }).boundingBox())!;
  const firstName = (await page.locator('.player-table tbody .player-name').first().boundingBox())!;
  expect(fold.y + fold.height).toBeLessThanOrEqual(firstName.y);
  await page.locator('.player-panel').screenshot({ path: 'test-results/phone-scoreboard.png' });
});

test('a Cartographers game: the build bar fits relay and survey buttons, each easy to tap', async ({ page }) => {
  const g = seaSettled(BUILTIN_BOARDS.find(b => b.id === 'compass-sea')!, 3);
  g.testMode = true;
  g.phase = 'build';
  g.rollDeadline = null;
  g.turnDeadline = Date.now() + 120_000;
  grant(g, 'p0', { lodestone: 4, wood: 2, sheep: 2, wheat: 1 });
  const room = await mountGame(page, g);
  const bar = page.locator('.table-actions');
  await expectNoSpill(bar);
  for (const name of ['Build relay station', 'Make a ship a survey ship', 'Build road', 'Buy development card']) {
    const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.width, name).toBeGreaterThanOrEqual(30);
    expect(box.height, name).toBeGreaterThanOrEqual(36);
  }
  // No button may sit on top of its neighbor (squeezed buttons overlap without spilling out).
  const boxes = await bar.locator(':scope > *').evaluateAll(items => items.map(item => item.getBoundingClientRect()));
  for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.left).toBeGreaterThanOrEqual(boxes[i - 1]!.right - 1);
  await page.screenshot({ path: 'test-results/phone-cartographers.png' });
  await bar.screenshot({ path: 'test-results/phone-cartographers-bar.png' });
  expect(room.errors).toEqual([]);
});

test('the charting panel fits a phone and its buttons are reachable', async ({ page }) => {
  const g = seaSettled(BUILTIN_BOARDS.find(b => b.id === 'compass-sea')!, 3);
  g.phase = 'charting';
  g.pendingCharts = { p0: 2 };
  g.chartDeadline = Date.now() + 30_000;
  g.turnDeadline = Date.now() + 120_000;
  const room = await mountGame(page, g);
  const panel = page.getByRole('dialog', { name: 'Chart 2 tiles' });
  await page
    .getByRole('button', { name: /^Chart .*, number / })
    .first()
    .click();
  await expectNoSpill(panel);
  await expect(panel.getByRole('button', { name: 'Chart', exact: true })).toBeInViewport();
  await expect(panel.getByRole('button', { name: 'Pass' })).toBeInViewport();
  await page.screenshot({ path: 'test-results/phone-charting.png' });
  expect(room.errors).toEqual([]);
});
