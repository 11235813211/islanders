import { expect, test } from '@playwright/test';
import { applyAction } from '../shared/engine';
import type { GameState } from '../shared/types';
import { grant, makeLobby, sequence, settled, TEST_NOW } from './fixtures';
import { expectNoSpill, mountGame } from './ui-harness';

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
  g.turnDeadline = Date.now() + 120_000;
  g.robberDeadline = Date.now() + 120_000;
  return g;
}

test('Christmas: winter board, the North Pole, and sending Santa to a building', async ({ page }) => {
  const game = await mountGame(page, santaTurn());
  await expect(page.locator('html')).toHaveClass(/theme-christmas/);
  await expect(page.getByText('Pick a building for Santa')).toBeVisible();
  await page.screenshot({ path: 'test-results/christmas-table.png' });
  const target = page.getByRole('button', { name: /^Send Santa to Player 2/ }).first();
  await target.click();
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
  await page.screenshot({ path: 'test-results/christmas-phone.png' });
});
