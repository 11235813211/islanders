import { expect, test } from '@playwright/test';
import { getView } from '../shared/engine';
import { BUILTIN_BOARDS } from '../shared/maps';
import { hexNumbers } from '../shared/rules';
import { boardIndex } from '../shared/seafaring';
import type { GameState } from '../shared/types';
import { grant, seaSettled } from './fixtures';
import { expectNoSpill, mountGame } from './ui-harness';

const COMPASS_SEA = BUILTIN_BOARDS.find(b => b.id === 'compass-sea')!;

/** A Cartographers game in p0's build phase, with cards for every Cartographers piece. */
function game(): GameState {
  const g = seaSettled(COMPASS_SEA, 3);
  g.testMode = true;
  g.phase = 'build';
  g.rollDeadline = null;
  g.turnDeadline = Date.now() + 120_000;
  grant(g, 'p0', { lodestone: 6, wood: 2, sheep: 2, wheat: 1, ore: 2 });
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

test('a survey ship is picked from the ship itself, then aimed at a tile in the corner panel', async ({ page }) => {
  const initial = game();
  const [edgeId] = seaEdges(initial);
  initial.ships[edgeId!] = 'p0';
  const room = await mountGame(page, initial);
  await page.getByRole('button', { name: 'Make a ship a survey ship', exact: true }).click();
  // The ship glows on the piece, not with an edge marker.
  await expect(page.locator('.board-ship-glow')).toHaveCount(1);
  await expect(page.locator('.board-road-target')).toHaveCount(0);
  await page.getByRole('button', { name: `Make the ship at ${edgeId} a survey ship` }).click();
  await page
    .getByRole('button', { name: /^Survey ship: Fields/ })
    .first()
    .click();
  const panel = page.getByRole('dialog', { name: 'Survey ship' });
  await expect(panel).toContainText('2 lodestone + 1 ore');
  await panel.getByRole('button', { name: 'Fit out' }).click();
  await expect(page.locator('.board-survey')).toHaveCount(1);
  await expect(page.locator('.board-survey-target')).toHaveCount(1);
  expect(room.state().surveys).toEqual([edgeId]);
  expect(Object.values(room.state().surveyTargets)).toHaveLength(1);
  await page.screenshot({ path: 'test-results/cartographers-survey.png' });
  expect(room.errors).toEqual([]);
});

test('charting a 6 from the build bar adds a second number beside the token', async ({ page }) => {
  const room = await mountGame(page, game());
  await page.getByRole('button', { name: /^Chart a tile/ }).click();
  await page
    .getByRole('button', { name: /^Chart a tile: .* 6$/ })
    .first()
    .click();
  const panel = page.getByRole('dialog', { name: 'Chart a tile' });
  await expect(panel).toContainText('6 → 6, 2 or 6, 12');
  await panel.getByRole('button', { name: 'Chart', exact: true }).click();
  await expect.poll(() => room.state().board.hexes.filter(h => hexNumbers(h).length === 2)).toHaveLength(1);
  await expect(page.locator('.board-charts')).toHaveCount(1);
  expect(room.errors).toEqual([]);
});

test('splitting a tile draws both halves, and its rolls ask for one of the two', async ({ page }) => {
  const initial = game();
  const room = await mountGame(page, initial);
  await page.getByRole('button', { name: /^Split a tile/ }).click();
  await page
    .getByRole('button', { name: /^Split a tile: Fields/ })
    .first()
    .click();
  const panel = page.getByRole('dialog', { name: 'Split a tile' });
  await expect(panel.getByRole('button', { name: 'Split', exact: true })).toBeDisabled();
  // A grain tile can't add grain.
  await expect(panel.getByRole('button', { name: 'Add Grain' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Add Ore' }).click();
  await expect(panel).toContainText('3 lodestone + 1 ore');
  await page.screenshot({ path: 'test-results/cartographers-split-panel.png' });
  await panel.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.locator('.board-split-seam')).toHaveCount(1);
  const split = room.state().board.hexes.find(h => h.split)!;
  expect(split.split).toBe('ore');
  await page.screenshot({ path: 'test-results/cartographers-split.png' });
  // A roll on it: the gold panel offers only grain or ore.
  room.update(g => {
    g.phase = 'gold';
    g.pendingGold = { p0: 1 };
    g.pendingSplit = { p0: [{ options: ['wheat', 'ore'], count: 1 }] };
    g.goldDeadline = Date.now() + 30_000;
  });
  const gold = page.getByRole('dialog', { name: 'Choose resources' });
  await expect(gold).toContainText('Split tile: Grain or Ore × 1');
  await expect(gold.getByRole('button', { name: 'Take one more Lumber' })).toBeDisabled();
  await gold.getByRole('button', { name: 'Take one more Ore' }).click();
  await gold.getByRole('button', { name: /^Take 1 resource/ }).click();
  await expect.poll(() => room.state().phase).toBe('build');
  expect(room.errors).toEqual([]);
});

test('the tile panel never spills at any width', async ({ page }) => {
  await mountGame(page, game());
  await page.getByRole('button', { name: /^Split a tile/ }).click();
  await page
    .getByRole('button', { name: /^Split a tile: / })
    .first()
    .click();
  const panel = page.getByRole('dialog', { name: 'Split a tile' });
  for (const width of [1600, 1280, 1024, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSpill(panel);
    await panel.screenshot({ path: `test-results/cartographers-tile-panel-${width}.png` });
  }
});

test('relay, survey and peek start from a tap on the board, with no button first', async ({ page }) => {
  const initial = game();
  const [edgeId] = seaEdges(initial);
  initial.ships[edgeId!] = 'p0';
  initial.board = structuredClone(initial.board);
  const fogHex = initial.board.hexes.find(h => h.terrain === 'sea' && h.vertexIds.some(v => initial.buildings[v]))!;
  fogHex.terrain = 'fog';
  initial.fog[fogHex.id] = { terrain: 'wheat', number: 9 };
  const legal = getView(initial, 'p0').legal;
  test.skip(!legal.relays.length || !legal.peekHexes.includes(fogHex.id), 'No relay or peek spot on this seed');
  const room = await mountGame(page, initial);
  // A real tap in the middle of the tile (whatever is drawn on top there gets it), then confirm.
  const fogBox = (await page.getByRole('button', { name: `Peek at the fog tile ${fogHex.id}` }).boundingBox())!;
  await page.mouse.click(fogBox.x + fogBox.width / 2, fogBox.y + fogBox.height / 2);
  await page.getByRole('button', { name: 'Confirm peek' }).click();
  await expect.poll(() => room.state().fogPeeks.p0?.length).toBe(1);
  await expect(page.locator('.peek-veil')).toHaveCount(1);
  await page.locator('.peeked-fog').screenshot({ path: 'test-results/cartographers-peek.png' });
  await page.getByRole('button', { name: `Build relay station at ${legal.relays[0]}` }).click();
  await page.getByRole('button', { name: 'Confirm relay' }).click();
  await expect.poll(() => room.state().relays).toEqual([legal.relays[0]]);
  room.update(g => grant(g, 'p0', { lodestone: 2, ore: 1 }));
  await page.getByRole('button', { name: `Make the ship at ${edgeId} a survey ship` }).click();
  // The peeked fog tile can be its target: only p0 knows it hides wheat 9.
  await page.getByRole('button', { name: 'Survey ship: Fog: Fields 9' }).click();
  await page.getByRole('dialog', { name: 'Survey ship' }).getByRole('button', { name: 'Fit out' }).click();
  await expect.poll(() => room.state().surveyTargets).toEqual({ [edgeId!]: fogHex.id });
  expect(room.errors).toEqual([]);
});
