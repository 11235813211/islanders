import { test } from '@playwright/test';
import { getActivePlayerId } from '../shared/engine';
import type { PlayerColor } from '../shared/types';
import { richGame } from './fixtures';
import { mountGame } from './ui-harness';

// Screenshot review for art and seat colors: writes test-results/visual-*.png.
// Every seat gets a city, settlements, and roads spread across different tiles.
const SEAT_SETS: PlayerColor[][] = [
  ['white', 'black', 'green', 'brown'],
  ['orange', 'red', 'blue', 'purple'],
];

for (const colors of SEAT_SETS) {
  test(`board pieces stay visible for ${colors.join(', ')}`, async ({ page }) => {
    const game = richGame();
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
