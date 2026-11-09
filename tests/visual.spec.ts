import { test } from '@playwright/test';
import { getActivePlayerId } from '../shared/engine';
import type { PieceStyle, PlayerColor } from '../shared/types';
import { richGame } from './fixtures';
import { mountGame } from './ui-harness';

// Screenshot review for art and seat colors: writes test-results/visual-*.png.
// Every seat gets a city, settlements, and roads spread across different tiles.
// The second set uses the chalet piece style, so both styles get a board screenshot.
const SEAT_SETS: [PlayerColor[], PieceStyle][] = [
  [['white', 'black', 'green', 'brown'], 'classic'],
  [['orange', 'red', 'blue', 'purple'], 'chalet'],
];

for (const [colors, pieceStyle] of SEAT_SETS) {
  test(`board pieces stay visible for ${colors.join(', ')} (${pieceStyle})`, async ({ page }) => {
    const game = richGame();
    game.settings.pieceStyle = pieceStyle;
    game.players.forEach((p, i) => {
      p.color = colors[i]!;
    });
    const owners = game.players.map(p => p.id);
    // Spread pieces: every fourth open corner and edge, cycling owners, so each color lands on varied terrain.
    game.board.vertices
      .filter((_, i) => i % 4 === 0)
      .slice(0, 12)
      .forEach((v, i) => {
        game.buildings[v.id] = { playerId: owners[i % owners.length]!, kind: i < 4 ? 'city' : 'settlement' };
      });
    game.board.edges
      .filter((_, i) => i % 3 === 1)
      .slice(0, 20)
      .forEach((e, i) => {
        game.roads[e.id] ??= owners[i % owners.length]!;
      });
    game.turnIndex = game.players.findIndex(p => p.id === getActivePlayerId(game));
    await mountGame(page, game);
    await page.locator('.board-svg').screenshot({ path: `test-results/visual-board-${colors.join('-')}.png` });
    await page.locator('.player-panel').screenshot({ path: `test-results/visual-scoreboard-${colors.join('-')}.png` });
    await page.locator('.table-hand').screenshot({ path: `test-results/visual-hand-${colors.join('-')}.png` });
    // Close-up for piece detail (outlines, shading, pulsing targets).
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.locator('.board-svg').screenshot({ path: `test-results/visual-zoom-${colors.join('-')}.png` });
    // The confirm card for the first seat's color (white in the first set): road, then city.
    await page.getByRole('button', { name: 'Reset board view' }).click();
    for (const target of [/^Build road at/, /^Upgrade to city at/]) {
      await page.getByRole('button', { name: target }).first().click();
      const card = (await page.locator('.map-confirm').boundingBox())!;
      await page.screenshot({
        path: `test-results/visual-confirm-${target.source.includes('road') ? 'road' : 'city'}-${colors[0]}.png`,
        clip: { x: card.x - 60, y: card.y - 20, width: card.width + 120, height: card.height + 90 },
      });
      await page.mouse.click(5, 5);
    }
  });
}

/** Phone screenshots of the main screens, for layout review: test-results/phone-*.png. */
const PHONES = [
  { name: 'iphone-14', width: 390, height: 844 },
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'android-small', width: 360, height: 740 },
  { name: 'landscape', width: 844, height: 390 },
];
for (const phone of PHONES) {
  test(`phone tour: ${phone.name}`, async ({ page }) => {
    await page.setViewportSize({ width: phone.width, height: phone.height });
    const game = richGame();
    await mountGame(page, game);
    await page.screenshot({ path: `test-results/phone-${phone.name}-build.png` });
    await page.getByRole('button', { name: /^Trade Lumber/ }).click();
    await page.screenshot({ path: `test-results/phone-${phone.name}-trade.png` });
    await page.getByRole('button', { name: 'Close trade' }).click();
    await page.getByRole('button', { name: 'Open chat' }).click();
    await page.screenshot({ path: `test-results/phone-${phone.name}-chat.png` });
  });
}

test('trade offers read from each side, with answers in seat colors', async ({ page }) => {
  const game = richGame();
  game.settings.showBank = true;
  const now = Date.now();
  game.tradeOffer = {
    id: 'trade-visual',
    fromId: 'p0',
    give: { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 },
    want: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 1 },
    to: ['p1', 'p2', 'p3'],
    acceptedBy: ['p1'],
    declinedBy: ['p2'],
    counters: [],
    createdAt: now - 10_000,
    expiresAt: now + 20_000,
  };
  game.players[1]!.resources.ore += 1;
  game.bank.ore -= 1;
  await mountGame(page, game);
  await page.getByLabel('Follow current turn').uncheck();
  const notice = page.getByRole('region', { name: 'Trade offer' });
  await notice.screenshot({ path: 'test-results/visual-trade-offerer.png' });
  await page.getByLabel('Play as', { exact: true }).selectOption('p3');
  await notice.screenshot({ path: 'test-results/visual-trade-recipient.png' });
  await page.getByLabel('Play as', { exact: true }).selectOption('p0');
  await page.getByRole('button', { name: 'Withdraw offer' }).click();
  await page.getByRole('button', { name: /^Trade Lumber/ }).click();
  await page.getByRole('button', { name: 'Request one more Ore' }).click();
  await page.locator('.board-viewport').screenshot({ path: 'test-results/visual-trade-composer.png' });
});
