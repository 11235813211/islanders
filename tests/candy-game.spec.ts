import { expect, test } from '@playwright/test';
import { applyAction } from '../shared/engine';
import type { GameState } from '../shared/types';
import { candyGame, sequence, TEST_NOW } from './fixtures';
import { expectNoSpill, mountGame } from './ui-harness';

/** A Christmas Candy game where p0 rolled the train's 4 and p1 has taken the first card: p0 picks next. */
function candyTurn(): GameState {
  let g = candyGame(true);
  Object.assign(g.settings, { pieceStyle: 'gingerbread', showBank: 'always' });
  g = applyAction(g, 'p0', { type: 'roll' }, sequence(0.01, 0.4, 0.1, 0.3, 0.5, 0.7, 0.9), TEST_NOW);
  g = applyAction(g, 'p1', { type: 'take-candy', resource: g.candyLoad!.cards[0]! }, sequence(0.5), TEST_NOW);
  g.turnDeadline = Date.now() + 120_000;
  g.candyDeadline = Date.now() + 120_000;
  return g;
}

test('Christmas Candy: candy cards and names, the train with its number, picking, then Santa', async ({ page }) => {
  const game = await mountGame(page, candyTurn());
  const panel = page.getByRole('dialog', { name: 'Candy train' });
  await expect(panel).toBeVisible();
  await expect(page.locator('.candy-start')).toHaveAttribute('data-number', '4');
  await expect(page.locator('.candy-start text')).toHaveText('4');
  // Candy names, faces, and bank icons in place of the usual ones.
  await expect(panel.getByText('Gum Drop')).toBeVisible();
  for (const name of ['Candy Cane', 'Twizzler', 'Cotton', 'Kiss']) await expect(panel.getByText(name)).toBeVisible();
  await expect(page.locator('[data-candy-card]').first()).toBeVisible();
  await expect(page.getByRole('group', { name: 'Cards left in the bank' }).locator('[data-candy-icon]')).toHaveCount(5);
  await expect(page.getByText('Take a card from the candy train')).toBeVisible();
  await expectNoSpill(panel);
  await page.screenshot({ path: 'test-results/candy-game.png' });
  // p1 picked at the start station; the train has stopped at p0's city at the end of the line.
  const front = async () => Number(await page.locator('[data-train-front]').getAttribute('data-train-front'));
  const atDepot = await front();
  for (let pick = 0; pick < 2; pick++) {
    const card = game.state().candyLoad!.cards[0]!;
    await panel.locator('.trade-card:not([disabled])').first().click();
    await panel.getByRole('button', { name: /^Take / }).click();
    await expect.poll(() => game.state().candyLoad?.picks.length ?? 0).toBe(1 - pick);
    expect(card).toBeTruthy();
  }
  // Picked over, it drives back into its start station.
  await expect.poll(front).toBeLessThan(atDepot);
  const moving = await front();
  await expect.poll(front, { timeout: 5000 }).toBeLessThan(moving);
  // The North Pole has the same number: Santa comes once the train is done.
  await expect.poll(() => game.state().phase).toBe('santa');
  await expect(page.getByText('Pick a player’s network for Santa')).toBeVisible();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.locator('.candy-railway').scrollIntoViewIfNeeded();
  await page.locator('.board-svg').screenshot({ path: 'test-results/candy-train-closeup.png' });
  expect(game.errors).toEqual([]);
});

test('Christmas Candy: the train panel fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await mountGame(page, candyTurn());
  const panel = page.getByRole('dialog', { name: 'Candy train' });
  await expect(panel).toBeVisible();
  await expectNoSpill(panel);
  await expectNoSpill(page.locator('.table-turn'));
  await page.screenshot({ path: 'test-results/phone-candy-game.png' });
});
