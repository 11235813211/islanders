import { expect, test } from '@playwright/test';
import { getView } from '../shared/engine';
import { BUILTIN_BOARDS } from '../shared/maps';
import { grant, seaSettled } from './fixtures';
import { mountGame } from './ui-harness';

const OUTER_ISLES = BUILTIN_BOARDS.find(b => b.id === 'outer-isles')!;

/** A sea game in the build phase with resources for ships and settlements. */
function seaGame() {
  const g = seaSettled(OUTER_ISLES, 3);
  g.testMode = true;
  g.phase = 'build';
  g.rollDeadline = null;
  g.turnDeadline = Date.now() + 120_000;
  grant(g, 'p0', { wood: 4, brick: 2, sheep: 4, wheat: 2, ore: 1 });
  return g;
}

test('a sea map shows ships, the pirate, and builds a ship from the bar', async ({ page }) => {
  const initial = seaGame();
  const game = await mountGame(page, initial);
  await expect(page.locator('.board-ship-piece')).toHaveCount(3);
  await expect(page.locator('.board-pirate')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/sea-game.png' });
  const ships = getView(initial, 'p0').legal.ships;
  expect(ships.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Build ship', exact: true }).click();
  await page.getByRole('button', { name: `Build ship at ${ships[0]}` }).click();
  await expect(page.locator('.board-ship-piece')).toHaveCount(4);
  expect(game.state().ships[ships[0]!]).toBe('p0');
  expect(game.errors).toEqual([]);
});

test('a coastal edge that takes either piece asks which to build', async ({ page }) => {
  const initial = seaGame();
  const legal = getView(initial, 'p0').legal;
  const both = legal.roads.find(id => legal.ships.includes(id));
  test.skip(!both, 'No coastal edge open to both pieces on this seed');
  const game = await mountGame(page, initial);
  await page.getByRole('button', { name: `Build road or ship at ${both}` }).click();
  await page.getByRole('button', { name: 'Confirm ship' }).click();
  await expect.poll(() => game.state().ships[both!]).toBe('p0');
  expect(game.errors).toEqual([]);
});

test('gold asks the owner to pick resources', async ({ page }) => {
  const initial = seaGame();
  initial.phase = 'gold';
  initial.pendingGold = { p0: 2 };
  const game = await mountGame(page, initial);
  const panel = page.getByRole('dialog', { name: 'Gold' });
  await panel.getByRole('button', { name: 'Take one more Ore' }).click();
  await panel.getByRole('button', { name: 'Take one more Grain' }).click();
  await panel.getByRole('button', { name: 'Take 2 resources' }).click();
  await expect.poll(() => game.state().phase).toBe('build');
  expect(game.errors).toEqual([]);
});
