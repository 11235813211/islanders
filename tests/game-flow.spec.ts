import { expect, test } from '@playwright/test';
import { victoryPoints } from '../shared/rules';
import { grant, richGame } from './fixtures';
import { mountGame } from './ui-harness';

test('a player counters an offer and the offerer accepts the counter', async ({ page }) => {
  const initial = richGame();
  grant(initial, 'p1', { ore: 3 });
  const game = await mountGame(page, initial);
  await page.getByLabel('Follow current turn').uncheck();

  // Player 0 offers one Lumber for one Ore, only to Player 1.
  await page.getByRole('button', { name: /^Trade Lumber/ }).click();
  const composer = page.getByRole('dialog', { name: 'Trade resources' });
  await composer.getByRole('button', { name: 'Request one more Ore' }).click();
  await composer.getByRole('button', { name: 'Offer to Player 2' }).click();
  await composer.getByRole('button', { name: 'Offer to Player 3' }).click();
  await composer.getByRole('button', { name: 'Send offer' }).click();
  await expect.poll(() => game.state().tradeOffer?.to).toEqual(['p1']);

  // Player 1 asks for two Lumber instead.
  await page.getByLabel('Play as', { exact: true }).selectOption('p1');
  await page.getByRole('region', { name: 'Trade offer' }).getByRole('button', { name: 'Counter-offer' }).click();
  const counter = page.getByRole('dialog', { name: 'Trade resources' });
  await expect(counter.getByText('Counter-offer', { exact: true })).toBeVisible();
  await counter.getByRole('button', { name: 'Request one more Lumber' }).click();
  await counter.getByRole('button', { name: 'Send counter' }).click();
  await expect.poll(() => game.state().tradeOffer?.counters.length).toBe(1);

  // Player 0 accepts it: 2 Lumber for 1 Ore.
  const before = { ...game.state().players[0]!.resources };
  await page.getByLabel('Play as', { exact: true }).selectOption('p0');
  await page.getByRole('button', { name: "Accept Player 1's counter-offer" }).click();
  await expect.poll(() => game.state().tradeOffer).toBeNull();
  expect(game.state().players[0]!.resources.wood).toBe(before.wood - 2);
  expect(game.state().players[0]!.resources.ore).toBe(before.ore + 1);
  expect(game.errors).toEqual([]);
});

test('the end-of-game screen shows standings and lets the host play again', async ({ page }) => {
  const initial = richGame();
  initial.phase = 'finished';
  initial.winnerId = 'p0';
  initial.finishedAt = Date.now();
  initial.turnDeadline = null;
  const game = await mountGame(page, initial);
  const results = page.getByRole('dialog', { name: 'Game over' });
  await expect(results.getByRole('heading', { name: 'You win' })).toBeVisible();
  await expect(results.locator('tbody tr')).toHaveCount(4);
  await expect(results.locator('tbody tr').first().locator('.points')).toHaveText(String(victoryPoints(initial, 'p0')));
  await results.getByRole('button', { name: 'View board' }).click();
  await expect(results).toHaveCount(0);
  await page.getByRole('button', { name: 'Results' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/end-game-phone.png' });
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect.poll(() => game.state().phase).toBe('lobby');
  await expect(page.getByRole('heading', { name: 'Game settings' })).toBeVisible();
  expect(game.state().players).toHaveLength(4);
});

test('the turn chime can be switched off and stays off', async ({ page }) => {
  await mountGame(page, richGame());
  const chime = page.getByRole('button', { name: 'Turn chime' });
  await expect(chime).toHaveAttribute('aria-pressed', 'true');
  await chime.click();
  await expect(chime).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('islanders:sound'))).toBe('off');
});

test('the host adds a bot, changes its level, and removes it in the lobby', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create room', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Game settings' })).toBeVisible();
  await expect(page.getByLabel('New bot level')).toHaveValue('advanced');
  await page.getByRole('button', { name: 'Add bot' }).click();
  const bot = page.locator('.lobby-player').nth(1);
  await expect(bot).toContainText('Bot · Advanced');
  const name = (await bot.locator('strong').textContent())!;
  await page.getByLabel(`Bot level for ${name}`).selectOption('beginner');
  await expect(bot).toContainText('Bot · Beginner');
  await expect(page.getByText(/2 players · first to 10 points/)).toBeVisible();
  await page.getByRole('button', { name: `Remove ${name}` }).click();
  await expect(page.locator('.lobby-player')).toHaveCount(1);
});
