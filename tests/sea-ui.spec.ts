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

const FIRE = BUILTIN_BOARDS.find(b => b.id === 'fire-and-ice')!;

test('an eruption: the volcano shakes under a banner on the board, then the roller rolls the volcano dice', async ({
  page,
}) => {
  const g = seaSettled(FIRE, 3);
  g.testMode = true;
  g.rollDeadline = null;
  g.turnDeadline = Date.now() + 120_000;
  const volcano = g.board.hexes.find(h => h.terrain === 'volcano')!;
  // A settlement on every corner a die can name, so the eruption hits something.
  for (const v of volcano.vertexIds) if (!g.buildings[v]) g.buildings[v] = { playerId: 'p1', kind: 'city' };
  Object.assign(g, { phase: 'eruption', eruption: [volcano.id], robber: '' });
  const game = await mountGame(page, g);
  const banner = page.getByRole('alert').filter({ hasText: 'Volcano eruption' });
  await expect(banner).toBeVisible();
  // The banner belongs to the board, not the whole window.
  const inside = (await banner.boundingBox())!;
  const board = (await page.locator('.board-viewport').boundingBox())!;
  expect(inside.y).toBeGreaterThanOrEqual(board.y);
  expect(inside.x).toBeGreaterThanOrEqual(board.x);
  expect(inside.x + inside.width).toBeLessThanOrEqual(board.x + board.width);
  // The tile and its rim shake together (two shaking groups), drawn before any building.
  await expect(page.locator('.volcano-rumble')).toHaveCount(2);
  await expect(page.locator('.volcano-rumble .terrain-art')).toHaveCount(1);
  const underRoads = await page.evaluate(() => {
    const rim = document.querySelector('.volcano-rim');
    const road = document.querySelector('.board-road');
    return !!rim && !!road && !!(rim.compareDocumentPosition(road) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(underRoads).toBe(true);
  await page.screenshot({ path: 'test-results/eruption-waiting.png' });
  await page.getByRole('button', { name: 'Roll volcanoes' }).click();
  await expect.poll(() => game.state().phase).toBe('build');
  await expect(page.locator('.eruption-die')).toHaveCount(1);
  // Every corner had a city, so the eruption wrecked one: the volcano quakes again.
  await expect(page.locator('.volcano-rumble')).toHaveCount(0);
  await expect(page.locator('.volcano-quake')).toHaveCount(2);
  await page.waitForTimeout(1300);
  await page.screenshot({ path: 'test-results/eruption-roll.png' });
  expect(game.errors).toEqual([]);
});

test('a roll tumbles the dice into the middle, then they rest in the corner showing the roll', async ({ page }) => {
  const g = seaGame();
  Object.assign(g, { phase: 'roll' });
  const game = await mountGame(page, g);
  await page.getByRole('button', { name: 'Roll dice' }).click();
  const dice = page.locator('.board-dice');
  await expect(dice).toHaveClass(/rolling/);
  await page.waitForTimeout(1300);
  await page.screenshot({ path: 'test-results/dice-roll.png' });
  await page.waitForTimeout(1600);
  const [a, b] = game.state().dice!;
  await expect(dice).toHaveAttribute('aria-label', `Dice: ${a} and ${b}, total ${a + b}`);
  const box = (await dice.boundingBox())!;
  const board = (await page.locator('.board-frame').boundingBox())!;
  expect(box.x + box.width).toBeGreaterThan(board.x + board.width - 40);
  expect(box.y + box.height).toBeGreaterThan(board.y + board.height - 40);
  await page.screenshot({ path: 'test-results/dice-rest.png' });
  expect(game.errors).toEqual([]);
});

test('a movable ship is picked up by tapping it; trade offers show every answer by name', async ({ page }) => {
  const g = seaGame();
  const ships = getView(g, 'p0').legal.ships;
  g.ships[ships[0]!] = 'p0';
  g.shipsBuilt = [];
  const game = await mountGame(page, g);
  const movable = Object.keys(getView(game.state(), 'p0').legal.shipMoves);
  test.skip(!movable.length, 'No ship can move on this seed');
  await page
    .getByRole('button', { name: `Move the ship at ${movable[0]}` })
    .first()
    .click();
  await expect(page.getByText('Choose where the ship goes')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /^Trade Lumber/ }).click();
  const composer = page.getByRole('dialog', { name: 'Trade resources' });
  await composer.getByRole('button', { name: 'Request one more Ore' }).click();
  await composer.getByRole('button', { name: 'Offer to players' }).click();
  await expect(page.locator('.offer-answer')).toHaveCount(2);
  await expect(page.locator('.offer-answer').first()).toContainText('Player 1');
  await expect(page.getByText('You give')).toHaveCount(0);
  await page.locator('.trade-notice').screenshot({ path: 'test-results/trade-notice.png' });
  expect(game.errors).toEqual([]);
});

test('the robber previews where it was put; cancel puts it back, confirm moves it', async ({ page }) => {
  const g = seaGame();
  g.phase = 'robber';
  g.robberDeadline = Date.now() + 15_000;
  const game = await mountGame(page, g);
  const before = game.state().robber;
  await expect(page.getByText(/Move the robber or pirate · \d+s/)).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Choose a tile for the robber or the pirate' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: /^Move robber to/ })
    .first()
    .click();
  await page.screenshot({ path: 'test-results/robber-confirm.png' });
  await page.getByRole('button', { name: 'Cancel robber' }).click();
  await expect(page.getByRole('button', { name: 'Confirm robber' })).toHaveCount(0);
  expect(game.state().robber).toBe(before);
  await page
    .getByRole('button', { name: /^Move robber to/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Confirm robber' }).click();
  await expect.poll(() => game.state().robber).not.toBe(before);
  expect(game.errors).toEqual([]);
});
