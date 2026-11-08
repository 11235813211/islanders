import { expect, test } from '@playwright/test';
import { applyAction } from '../shared/engine';
import { grant, seeded, settled, TEST_NOW } from './fixtures';
import { mountGame } from './ui-harness';

/** Six players, just after p0 ended a turn: p2 has a road's worth of cards and builds. */
function specialBuild() {
  let g = settled(6);
  g.testMode = true;
  g.phase = 'build';
  g.rollDeadline = null;
  for (const p of g.players) p.resources = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  g.bank = { wood: 24, brick: 24, sheep: 24, wheat: 24, ore: 24 };
  grant(g, 'p2', { wood: 1, brick: 1, sheep: 2 });
  g = applyAction(g, 'p0', { type: 'end-turn' }, seeded(), TEST_NOW);
  g.turnDeadline = Date.now() + 60_000;
  return g;
}

test('six players: the large island, and a special build with no trading', async ({ page }) => {
  const game = await mountGame(page, specialBuild());
  // The large island gets a wider frame than the standard 670 × 600.
  const frame = (await page.locator('[data-frame]').getAttribute('data-frame'))!.split(' ').map(Number);
  expect(frame[2]).toBeGreaterThan(670);
  await expect(page.getByText('Special build: no trading')).toBeVisible();
  await page.screenshot({ path: 'test-results/six-players.png' });
  // Only building: the trade composer stays shut.
  await page.getByRole('button', { name: /^Trade Wool/ }).click();
  await expect(page.getByRole('dialog', { name: 'Trade resources' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Build road', exact: true }).click();
  await page
    .getByRole('button', { name: /^Build road at / })
    .first()
    .click();
  await expect.poll(() => Object.values(game.state().roads).filter(o => o === 'p2').length).toBe(3);
  await page.getByRole('button', { name: 'Done building' }).click();
  await expect.poll(() => game.state().phase).toBe('roll');
  expect(game.errors).toEqual([]);
});
