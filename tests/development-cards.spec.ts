import { expect, test } from '@playwright/test';
import { RESOURCES } from '../shared/types';
import { richGame } from './fixtures';
import { mountGame } from './ui-harness';

/** Player 0 holds only lumber and one of every development card (two knights, one new). */
function devGame() {
  const game = richGame();
  const p0 = game.players[0]!;
  for (const r of RESOURCES) {
    game.bank[r] += p0.resources[r];
    p0.resources[r] = 0;
  }
  p0.resources.wood = 2;
  game.bank.wood -= 2;
  p0.development = [
    { id: 'k1', kind: 'knight', boughtTurn: 0 },
    { id: 'k2', kind: 'knight', boughtTurn: game.turn },
    { id: 'rb', kind: 'road-building', boughtTurn: 0 },
    { id: 'yp', kind: 'year-of-plenty', boughtTurn: 0 },
    { id: 'mo', kind: 'monopoly', boughtTurn: 0 },
    { id: 'vp', kind: 'victory-point', boughtTurn: 0 },
  ];
  return game;
}

test('the hand shows only held cards, with development cards stacked by kind', async ({ page }) => {
  const game = await mountGame(page, devGame());
  await page.getByLabel('Follow current turn').uncheck();
  const hand = page.locator('.table-hand');
  await expect(hand.locator('.cards-resource-group:not(.cards-dev)')).toHaveCount(1);
  await expect(hand.getByRole('button', { name: 'Trade Lumber (2)' })).toBeVisible();
  await expect(hand.locator('.cards-dev')).toHaveCount(5);
  await expect(hand.getByRole('button', { name: 'Knight (2), ready to play' })).toContainText('2');
  await expect(hand.getByRole('button', { name: 'Victory Point (1)', exact: true })).toBeVisible();
  for (const [width, height] of [
    [390, 844],
    [844, 390],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(hand.locator('.cards-dev').last()).toBeInViewport();
  }
  expect(game.errors).toEqual([]);
});

test('Monopoly asks for a resource, then other cards explain why they wait', async ({ page }) => {
  const game = await mountGame(page, devGame());
  await page.getByLabel('Follow current turn').uncheck();
  await page.getByRole('button', { name: 'Monopoly (1), ready to play' }).click();
  await page.getByRole('dialog', { name: 'Monopoly' }).getByRole('button', { name: 'Ore' }).click();
  await expect.poll(() => game.state().players[0]!.development.some(c => c.id === 'mo')).toBe(false);
  await page.getByRole('button', { name: 'Knight (2)', exact: true }).click();
  const knight = page.getByRole('dialog', { name: 'Knight' });
  await expect(knight).toContainText('You already played a development card this turn.');
  await expect(knight.getByRole('button', { name: 'Play Knight' })).toBeDisabled();
  await knight.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(game.errors).toEqual([]);
});

test('Year of Plenty takes two picked resources; Road Building and Knight confirm first', async ({ page }) => {
  const game = await mountGame(page, devGame());
  await page.getByLabel('Follow current turn').uncheck();
  await page.getByRole('button', { name: 'Road Building (1), ready to play' }).click();
  await page.getByRole('dialog', { name: 'Road Building' }).getByRole('button', { name: 'Cancel' }).click();
  expect(game.state().phase).toBe('build');
  await page.getByRole('button', { name: 'Year of Plenty (1), ready to play' }).click();
  const plenty = page.getByRole('dialog', { name: 'Year of Plenty' });
  await plenty.getByRole('button', { name: 'Take one more Ore' }).click();
  await plenty.getByRole('button', { name: 'Take one more Ore' }).click();
  await expect(plenty.getByRole('button', { name: 'Take one more Grain' })).toBeDisabled();
  await plenty.getByRole('button', { name: 'Take 2 resources' }).click();
  await expect.poll(() => game.state().players[0]!.resources.ore).toBe(2);
  expect(game.errors).toEqual([]);
});

test('ending a turn can be undone from the same button spot', async ({ page }) => {
  const initial = richGame();
  for (const p of initial.players.slice(1)) p.bot = 'beginner';
  const game = await mountGame(page, initial);
  await page.getByRole('button', { name: 'End turn' }).click();
  await expect.poll(() => game.state().turnIndex).not.toBe(initial.turnIndex);
  await page.getByRole('button', { name: 'Undo end turn' }).click();
  await expect.poll(() => game.state().turnIndex).toBe(initial.turnIndex);
  await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo end turn' })).toHaveCount(0);
  expect(game.errors).toEqual([]);
});
