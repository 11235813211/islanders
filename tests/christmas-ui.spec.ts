import { expect, test } from '@playwright/test';
import { applyAction } from '../shared/engine';
import type { GameState } from '../shared/types';
import { grant, makeLobby, sequence, settled, TEST_NOW } from './fixtures';
import { expectDecorClear, expectNoSpill, mountGame } from './ui-harness';

const DECORATED = '.player-panel, .table-hand';

/** A Christmas game with the North Pole, p0 having just rolled its number. */
function santaTurn(): GameState {
  const lobby = makeLobby(4);
  lobby.settings.christmas = true;
  lobby.settings.northPole = true;
  lobby.settings.pieceStyle = 'gingerbread';
  lobby.settings.diceMode = 'random';
  let g = settled(4, lobby);
  g.testMode = true;
  g.turnIndex = 0;
  g.phase = 'roll';
  g.northPole = { ...g.northPole!, number: 4 };
  grant(g, 'p0', { wood: 2, brick: 1, sheep: 3, wheat: 1, ore: 2 });
  g = applyAction(g, 'p0', { type: 'roll' }, sequence(0.01, 0.4, 0.5), TEST_NOW);
  // A spread of past rolls, so the dice chart shows bars of every height.
  g.diceCounts = { 2: 1, 3: 2, 4: 4, 5: 5, 6: 7, 7: 8, 8: 6, 9: 5, 10: 3, 11: 2, 12: 1 };
  g.turnDeadline = Date.now() + 120_000;
  g.robberDeadline = Date.now() + 120_000;
  return g;
}

test('Christmas: winter board, the North Pole, and sending Santa to a building', async ({ page }) => {
  const game = await mountGame(page, santaTurn());
  await expect(page.locator('html')).toHaveClass(/theme-christmas/);
  await expect(page.getByText('Pick a player’s network for Santa')).toBeVisible();
  await page.screenshot({ path: 'test-results/christmas-table.png' });
  await expectDecorClear(page, DECORATED);
  const size = page.viewportSize()!;
  for (const width of [1600, 1280, 1024, 820]) {
    await page.setViewportSize({ width, height: 900 });
    await expectDecorClear(page, DECORATED);
  }
  await page.setViewportSize(size);
  await page.getByRole('button', { name: 'dice', exact: true }).click();
  await page.locator('.chat-panel').screenshot({ path: 'test-results/christmas-dice.png' });
  await page.locator('.site-header').screenshot({ path: 'test-results/christmas-header.png' });
  const target = page.getByRole('button', { name: /^Send Santa to Player 2/ }).first();
  await target.locator('line.board-hit-area').first().click({ force: true });
  // A tap (here on a road) asks first; Santa goes only on the check.
  await expect(page.getByRole('button', { name: 'Confirm santa' })).toBeVisible();
  expect(game.state().phase).toBe('santa');
  await page.getByRole('button', { name: 'Confirm santa' }).click();
  await expect.poll(() => game.state().phase).toBe('build');
  // Mid-flight, then the gift card everyone sees.
  await page.waitForTimeout(1300);
  await page.screenshot({ path: 'test-results/christmas-santa-flight.png' });
  await expect(page.locator('.santa-gift-name')).toHaveText('Player 2');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'test-results/christmas-santa-gift.png' });
  expect(game.errors).toEqual([]);
});

test('Christmas fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await mountGame(page, santaTurn());
  await expectNoSpill(page.locator('.table-turn'));
  await expectDecorClear(page, DECORATED);
  await page.screenshot({ path: 'test-results/christmas-phone.png' });
});

test('after a Christmas game, the rest of the site keeps the look until switched off', async ({ page }) => {
  await mountGame(page, santaTurn());
  await expect.poll(() => page.evaluate(() => localStorage.getItem('islanders.christmasLook'))).toBe('1');
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/theme-christmas/);
  await page.evaluate(() => localStorage.setItem('islanders.christmasLook', '0'));
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/theme-christmas/);
});
