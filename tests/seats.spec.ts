import { expect, test } from '@playwright/test';
import { applyAction } from '../shared/engine';
import { makeLobby, seeded, settled, TEST_NOW } from './fixtures';
import { expectNoSpill, mountGame } from './ui-harness';

test('a player who is not the host steps through the drawn boards without changing the host’s', async ({ page }) => {
  let lobby = makeLobby(3);
  lobby = applyAction(lobby, 'p0', { type: 'new-board' }, seeded(1), TEST_NOW);
  lobby = applyAction(lobby, 'p0', { type: 'new-board' }, seeded(2), TEST_NOW);
  // This page plays p0; make p1 the host.
  lobby.hostId = 'p1';
  const game = await mountGame(page, lobby);
  const pick = page.getByRole('region', { name: 'Drawn boards' });
  await expect(pick.getByRole('status')).toHaveAccessibleName('Board 2 of 2');
  await expect(pick.getByRole('button', { name: 'Play' })).toHaveCount(0);
  const tiles = () => page.locator('.board-svg').first().innerHTML();
  const second = await tiles();
  await pick.getByRole('button', { name: 'Previous board' }).click();
  await expect(pick.getByRole('status')).toHaveAccessibleName('Board 1 of 2');
  await expect(pick).toContainText('The host is on board 2');
  await expect.poll(tiles).not.toBe(second);
  expect(game.state().boardShown).toBe(1);
  await pick.getByRole('button', { name: 'Next board' }).click();
  await expect(pick).toContainText('The host is choosing');
  await expect.poll(tiles).toBe(second);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expectNoSpill(pick);
  }
  expect(game.errors).toEqual([]);
});

test('the host taps a name to move that player to spectators, after confirming', async ({ page }) => {
  const g = settled(3);
  g.phase = 'build';
  const game = await mountGame(page, g);
  const name = g.players[1]!.name;
  // Only other people's names are buttons, and only for the host.
  await expect(page.locator('.player-name-button')).toHaveCount(2);
  await page.getByRole('button', { name: `${name}: move to spectators or replace with a bot` }).click();
  const choose = page.getByRole('dialog', { name });
  await expectNoSpill(choose);
  await choose.getByRole('button', { name: 'Move to spectators' }).click();
  const confirm = page.getByRole('dialog', { name: `Move ${name} to spectators?` });
  await expectNoSpill(confirm);
  await confirm.getByRole('button', { name: 'Move to spectators' }).click();
  await expect.poll(() => game.state().spectators.map(s => s.id)).toEqual(['p1']);
  expect(game.state().players[1]).toMatchObject({ id: 'p1.bot', bot: 'advanced' });
  await expect(page.locator('.player-name-button')).toHaveCount(1);
  expect(game.errors).toEqual([]);
});
