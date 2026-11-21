import { expect, test } from '@playwright/test';
import { TUNING } from '../shared/default-settings';
import type { GameState, TradeBag } from '../shared/types';
import { makeLobby, settled } from './fixtures';
import { expectNoSpill, mountGame } from './ui-harness';

/** p1's build phase, seen by p0. */
function othersTurn(): GameState {
  const g = settled();
  g.phase = 'build';
  g.turnIndex = 1;
  g.rollDeadline = null;
  g.turnDeadline = Date.now() + 60_000;
  return g;
}

const bag = (cards: Partial<TradeBag>): TradeBag => ({
  wood: 0,
  brick: 0,
  sheep: 0,
  wheat: 0,
  ore: 0,
  lodestone: 0,
  ...cards,
});

test('another player can give the person moving more time, again and again', async ({ page }) => {
  const g = othersTurn();
  const game = await mountGame(page, g);
  const give = page.getByRole('button', { name: `Give Player 1 ${TUNING.giveTimeSeconds} seconds` });
  for (const [width, height] of [
    [1600, 900],
    [1280, 800],
    [1024, 768],
    [820, 1100],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(give).toBeVisible();
    await expectNoSpill(page.locator('.table-turn'));
  }
  await give.click();
  await expect.poll(() => game.state().turnDeadline).toBe(g.turnDeadline! + TUNING.giveTimeSeconds * 1000);
  await give.click();
  await expect.poll(() => game.state().turnDeadline).toBe(g.turnDeadline! + 2 * TUNING.giveTimeSeconds * 1000);
  expect(game.errors).toEqual([]);
});

test('your name on the scoreboard opens a dialog that changes it', async ({ page }) => {
  const game = await mountGame(page, othersTurn());
  await page.getByRole('button', { name: 'Change your name' }).click();
  const dialog = page.getByRole('dialog', { name: 'Change your name' });
  await dialog.getByLabel('Your name').fill('player 2');
  await expect(dialog.getByRole('alert')).toHaveText('Someone in this room already has that name.');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await dialog.getByLabel('Your name').fill('Sandy');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => game.state().players[0]!.name).toBe('Sandy');
  await expect(page.locator('tr[data-player-id="p0"]')).toContainText('Sandy');
  expect(game.errors).toEqual([]);
});

test('the name can be changed from the lobby too', async ({ page }) => {
  const game = await mountGame(page, makeLobby(2));
  await page.getByRole('button', { name: 'Change your name' }).click();
  const dialog = page.getByRole('dialog', { name: 'Change your name' });
  await dialog.getByLabel('Your name').fill('Sandy');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => game.state().players[0]!.name).toBe('Sandy');
  expect(game.errors).toEqual([]);
});

test('chat messages show the time they were sent', async ({ page }) => {
  const at = new Date(2026, 10, 17, 19, 42).getTime();
  const game = await mountGame(page, othersTurn());
  game.update(g => {
    g.chat.push({ id: 'chat-1', senderId: 'p1', name: 'Player 1', text: 'Hello', at, spectator: false });
  });
  const stamp = page.locator('.chat-messages time');
  await expect(stamp).toHaveText(/7:42/);
  const size = await stamp.evaluate(e => parseFloat(getComputedStyle(e).fontSize));
  expect(size).toBeLessThan(12);
  expect(game.errors).toEqual([]);
});

test('a finished trade sends cards both ways between the two players', async ({ page }) => {
  const game = await mountGame(page, othersTurn());
  game.update(g => {
    g.log.push({
      id: (g.log.at(-1)?.id ?? 0) + 1,
      text: 'Player 1 traded with Player 0.',
      event: { kind: 'player-trade', fromId: 'p1', toId: 'p0', give: bag({ wood: 2 }), get: bag({ ore: 1 }) },
    });
  });
  const flights = page.locator('.card-flights .resource-flight');
  await expect(flights).toHaveCount(3);
  const heading = await flights.evaluateAll(cards =>
    cards.map(card => Math.sign(parseFloat(getComputedStyle(card).getPropertyValue('--fy')))),
  );
  // The hand (p0) is below the scoreboard (p1): wood flies down to it, ore flies back up.
  expect(heading).toEqual([1, 1, -1]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/trade-flights.png' });
  await expect(page.locator('.card-flights')).toHaveCount(0, { timeout: 6000 });
  expect(game.errors).toEqual([]);
});
