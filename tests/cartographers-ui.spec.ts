import { expect, test } from '@playwright/test';
import { getView } from '../shared/engine';
import { BUILTIN_BOARDS } from '../shared/maps';
import { hexNumbers } from '../shared/rules';
import { boardIndex } from '../shared/seafaring';
import type { GameState } from '../shared/types';
import { grant, seaSettled } from './fixtures';
import { mountGame } from './ui-harness';

const COMPASS_SEA = BUILTIN_BOARDS.find(b => b.id === 'compass-sea')!;

/** A Cartographers game in p0's build phase, with cards for every Cartographers piece. */
function game(): GameState {
  const g = seaSettled(COMPASS_SEA, 3);
  g.testMode = true;
  g.phase = 'build';
  g.rollDeadline = null;
  g.turnDeadline = Date.now() + 120_000;
  grant(g, 'p0', { lodestone: 4, wood: 2, sheep: 2, wheat: 1 });
  return g;
}

/** Open sea edges (sea on both sides, away from the pirate). */
function seaEdges(g: GameState): string[] {
  const index = boardIndex(g.board);
  return g.board.edges
    .filter(e => {
      const hexes = index.edgeHexes.get(e.id)!;
      return hexes.length === 2 && hexes.every(h => h.terrain === 'sea' && h.id !== g.pirate);
    })
    .map(e => e.id);
}

test('a relay station is built from the bar and drawn on its road', async ({ page }) => {
  const initial = game();
  const relays = getView(initial, 'p0').legal.relays;
  test.skip(!relays.length, 'No relay station spot on this seed');
  const room = await mountGame(page, initial);
  await expect(page.getByRole('button', { name: 'Lodestone' }).or(page.locator('.cards-lodestone'))).toBeVisible();
  await page.getByRole('button', { name: 'Build relay station', exact: true }).click();
  await page.getByRole('button', { name: `Build relay station at ${relays[0]}` }).click();
  await expect(page.locator('.board-relay')).toHaveCount(1);
  expect(room.state().relays).toEqual([relays[0]]);
  await page.screenshot({ path: 'test-results/cartographers-relay.png' });
  expect(room.errors).toEqual([]);
});

test('a ship out at sea becomes a survey ship, worth a point', async ({ page }) => {
  const initial = game();
  const [edgeId] = seaEdges(initial);
  initial.ships[edgeId!] = 'p0';
  const room = await mountGame(page, initial);
  await page.getByRole('button', { name: 'Make a ship a survey ship', exact: true }).click();
  await page.getByRole('button', { name: `Make the ship at ${edgeId} a survey ship` }).click();
  await expect(page.locator('.board-survey')).toHaveCount(1);
  expect(room.state().surveys).toEqual([edgeId]);
  expect(room.errors).toEqual([]);
});

test('during the robber a tile can be picked to chart; it is confirmed once charting opens', async ({ page }) => {
  const initial = game();
  // p1 rolled the 7 and is moving the robber; p0 has a survey ship and is owed a chart.
  initial.testMode = false;
  initial.turnIndex = 1;
  initial.phase = 'robber';
  initial.pendingCharts = { p0: 1 };
  const room = await mountGame(page, initial);
  const panel = page.getByRole('dialog', { name: 'Chart a tile' });
  await expect(panel).toContainText('Pick now, confirm after the robber');
  await page
    .getByRole('button', { name: /^Chart .*, number 6$/ })
    .first()
    .click();
  await expect(panel).toContainText('6 → 6, 2 or 6, 12');
  await expect(panel.getByRole('button', { name: 'Chart' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/cartographers-chart-pick.png' });
  expect(room.errors).toEqual([]);
});

test('charting a 6 adds a second number, shown beside the token', async ({ page }) => {
  const initial = game();
  initial.phase = 'charting';
  initial.pendingCharts = { p0: 1 };
  initial.chartDeadline = Date.now() + 30_000;
  const room = await mountGame(page, initial);
  await page
    .getByRole('button', { name: /^Chart .*, number 6$/ })
    .first()
    .click();
  await page.getByRole('dialog', { name: 'Chart a tile' }).getByRole('button', { name: 'Chart' }).click();
  await expect.poll(() => room.state().phase).toBe('build');
  expect(room.state().board.hexes.filter(h => hexNumbers(h).length === 2)).toHaveLength(1);
  await expect(page.locator('.board-charts')).toHaveCount(1);
  expect(room.errors).toEqual([]);
});
