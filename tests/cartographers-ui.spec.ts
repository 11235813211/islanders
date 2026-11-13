import { expect, test } from '@playwright/test';
import { getView } from '../shared/engine';
import { BUILTIN_BOARDS } from '../shared/maps';
import { hexNumbers } from '../shared/rules';
import type { GameState } from '../shared/types';
import { grant, seaSettled, shipsToOpenSea } from './fixtures';
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

test('a survey ship is picked from the ship itself, and its panel shows the charts it makes', async ({ page }) => {
  const initial = game();
  const { edgeId } = shipsToOpenSea(initial, 'p0');
  const room = await mountGame(page, initial);
  await page.getByRole('button', { name: 'Make a ship a survey ship', exact: true }).click();
  // The ship glows on the piece, not with an edge marker.
  await expect(page.locator('.board-ship-glow')).toHaveCount(1);
  await expect(page.locator('.board-road-target')).toHaveCount(0);
  await page.getByRole('button', { name: `Make the ship at ${edgeId} a survey ship` }).click();
  const panel = page.getByRole('dialog', { name: 'Survey ship' });
  await expect(panel).toContainText('3 lodestone + 1 ore');
  await expect(panel).toContainText(/Settlement by/);
  await expect(panel.locator('.tile-pick-change').filter({ hasText: '→' }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/cartographers-survey.png' });
  for (const width of [1600, 1280, 1024, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSpill(panel);
    await panel.screenshot({ path: `test-results/cartographers-survey-panel-${width}.png` });
  }
  await panel.getByRole('button', { name: 'Fit out' }).click();
  await expect(page.locator('.board-survey')).toHaveCount(1);
  expect(room.state().surveys).toEqual([edgeId]);
  expect(room.state().log.some(e => e.event?.kind === 'chart')).toBe(true);
  expect(room.errors).toEqual([]);
});

test('charting a 6 from the build bar adds a second number beside the token', async ({ page }) => {
  const room = await mountGame(page, game());
  await page.getByRole('button', { name: /^Chart a tile/ }).click();
  await page
    .getByRole('button', { name: /^Chart a tile: .* 6$/ })
    .first()
    .click();
  // The confirm card sits above the tile, not in a corner panel.
  const card = page.locator('.map-confirm');
  await expect(card).toContainText('6 → 6, 2');
  await expect(page.getByRole('dialog', { name: 'Chart a tile' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirm chart' }).click();
  await expect.poll(() => room.state().board.hexes.filter(h => hexNumbers(h).length === 2)).toHaveLength(1);
  await expect(page.locator('.board-charts')).toHaveCount(1);
  expect(room.errors).toEqual([]);
});

test('with lodestone in hand, a tap on a tile opens a chart card above it', async ({ page }) => {
  const initial = game();
  const hexId = getView(initial, 'p0').legal.chartHexes[0]!;
  const before = hexNumbers(initial.board.hexes.find(h => h.id === hexId)!);
  const room = await mountGame(page, initial);
  // A real tap in the middle of the tile, where its number token is drawn.
  const box = (await page.getByRole('button', { name: `Chart the tile ${hexId}` }).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const card = page.locator('.map-confirm');
  await expect(card).toContainText(`${before.join(', ')} →`);
  const above = (await card.boundingBox())!;
  expect(above.y + above.height).toBeLessThan(box.y + box.height / 2 + 4);
  expect(Math.abs(above.x + above.width / 2 - (box.x + box.width / 2))).toBeLessThan(box.width);
  await page.screenshot({ path: 'test-results/cartographers-chart-card.png' });
  await page.getByRole('button', { name: 'Confirm chart' }).click();
  await expect.poll(() => hexNumbers(room.state().board.hexes.find(h => h.id === hexId)!)).not.toEqual(before);
  // Without lodestone, tiles take no taps.
  room.update(g => {
    g.players[0]!.resources.lodestone = 0;
  });
  await expect(page.locator('.board-chart-tap')).toHaveCount(0);
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
  // Nor lodestone, on any tile.
  await expect(panel.getByRole('button', { name: 'Add Lodestone' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Add Ore' }).click();
  await expect(panel).toContainText('1 lodestone + 1 ore');
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
  initial.board = structuredClone(initial.board);
  const fogHex = initial.board.hexes.find(h => h.terrain === 'sea' && h.vertexIds.some(v => initial.buildings[v]))!;
  fogHex.terrain = 'fog';
  initial.fog[fogHex.id] = { terrain: 'wheat', number: 9 };
  const { edgeId } = shipsToOpenSea(initial, 'p0');
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
  room.update(g => grant(g, 'p0', { lodestone: 3, ore: 1 }));
  await page.getByRole('button', { name: `Make the ship at ${edgeId} a survey ship` }).click();
  await page.getByRole('dialog', { name: 'Survey ship' }).getByRole('button', { name: 'Fit out' }).click();
  await expect.poll(() => room.state().surveys).toEqual([edgeId]);
  expect(room.errors).toEqual([]);
});
