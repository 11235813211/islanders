import { test } from '@playwright/test';
import { seededRandom } from '../shared/board';
import { getActivePlayerId } from '../shared/engine';
import { autoTrain } from '../shared/maps/auto-train';
import { BUILTIN_BOARDS } from '../shared/maps/builtin';
import type { PieceStyle, PlayerColor } from '../shared/types';
import { grant, makeLobby, richGame, seaSettled } from './fixtures';
import { mountGame } from './ui-harness';

// Screenshot review for art and seat colors: writes test-results/visual-*.png.
// Every seat gets a city, settlements, and roads spread across different tiles.
// Each set uses a different piece style, so every style gets a board screenshot.
const SEAT_SETS: [PlayerColor[], PieceStyle][] = [
  [['white', 'black', 'green', 'brown'], 'classic'],
  [['orange', 'red', 'blue', 'purple'], 'chalet'],
  [['red', 'blue', 'white', 'black'], 'korean'],
];

/** A rich game with every seat's cities, settlements, and roads spread across the board. */
function spreadPieces(colors: PlayerColor[], pieceStyle: PieceStyle) {
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
  return game;
}

test('Korean pieces on a phone board', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountGame(page, spreadPieces(['red', 'blue', 'white', 'black'], 'korean'));
  await page.screenshot({ path: 'test-results/phone-korean-board.png' });
});

for (const [colors, pieceStyle] of SEAT_SETS) {
  test(`board pieces stay visible for ${colors.join(', ')} (${pieceStyle})`, async ({ page }) => {
    const game = spreadPieces(colors, pieceStyle);
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
  game.settings.showBank = 'always';
  const now = Date.now();
  game.tradeOffers = [
    {
      id: 'trade-visual',
      fromId: 'p0',
      give: { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0, lodestone: 0, paper: 0, cloth: 0, coin: 0 },
      want: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 1, lodestone: 0, paper: 0, cloth: 0, coin: 0 },
      to: ['p1', 'p2', 'p3'],
      acceptedBy: ['p1'],
      declinedBy: ['p2'],
      counters: [],
      createdAt: now - 10_000,
      expiresAt: now + 20_000,
    },
  ];
  game.players[1]!.resources.ore += 1;
  game.bank.ore -= 1;
  await mountGame(page, game);
  await page.getByLabel('Follow current turn').uncheck();
  const notice = page.getByRole('region', { name: 'Trade offer' });
  await notice.screenshot({ path: 'test-results/visual-trade-offerer.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await notice.screenshot({ path: 'test-results/phone-trade-offerer.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByLabel('Play as', { exact: true }).selectOption('p3');
  await notice.screenshot({ path: 'test-results/visual-trade-recipient.png' });
  await page.getByLabel('Play as', { exact: true }).selectOption('p0');
  await page.getByRole('button', { name: 'Withdraw offer' }).click();
  await page.getByRole('button', { name: /^Trade Lumber/ }).click();
  await page.getByRole('button', { name: 'Request one more Ore' }).click();
  await page.locator('.board-viewport').screenshot({ path: 'test-results/visual-trade-composer.png' });
});

/** A sea map with jungles at three seats on a landscape phone: bank row, build bar, and turn button. */
test('phone tour: landscape sea map', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const design = BUILTIN_BOARDS.find(board => board.id === 'jungle-coast')!;
  const game = seaSettled(design, 3);
  game.testMode = true;
  game.phase = 'build';
  game.rollDeadline = null;
  game.turnDeadline = Date.now() + 120_000;
  grant(game, getActivePlayerId(game)!, { wood: 3, brick: 2, sheep: 4, wheat: 2, ore: 1 });
  game.players.forEach(p => {
    p.discoveries = 2;
  });
  await mountGame(page, game);
  await page.screenshot({ path: 'test-results/phone-landscape-sea.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/phone-portrait-sea.png' });
});

/** New table cues: stacked offers, the short-choice timer, your-turn tint, red over-limit stacks, results, and lobby proposals. */
test('table cues and lobby map proposals', async ({ page }) => {
  const game = richGame();
  const now = Date.now();
  const bag = (wood: number, ore: number, sheep = 0) => ({
    wood,
    brick: 0,
    sheep,
    wheat: 0,
    ore,
    lodestone: 0,
    paper: 0,
    cloth: 0,
    coin: 0,
  });
  const offer = (id: string, fromId: string, give: ReturnType<typeof bag>, want: ReturnType<typeof bag>) => ({
    id,
    fromId,
    give,
    want,
    to: game.players.filter(p => p.id !== fromId).map(p => p.id),
    acceptedBy: [],
    declinedBy: [],
    counters: [],
    createdAt: now,
    expiresAt: now + 600_000,
  });
  game.tradeOffers = [offer('trade-a', 'p0', bag(1, 0), bag(0, 1)), offer('trade-b', 'p0', bag(1, 0), bag(0, 0, 1))];
  grant(game, 'p2', { wood: 9 });
  await mountGame(page, game);
  await page.screenshot({ path: 'test-results/visual-cues-offers.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/phone-cues-offers.png' });
  await page.setViewportSize({ width: 1280, height: 720 });

  const robber = richGame();
  robber.phase = 'robber';
  robber.robberDeadline = Date.now() + 12_000;
  await mountGame(page, robber);
  await page.locator('.decision-timer').waitFor();
  await page.screenshot({ path: 'test-results/visual-cues-robber.png' });

  const done = richGame();
  done.phase = 'finished';
  done.winnerId = 'p0';
  done.players.forEach((p, i) => {
    done.stats[p.id]!.produced = {
      wood: 4 + i,
      brick: 3,
      sheep: 6 - i,
      wheat: 2 * i,
      ore: 5,
      lodestone: 0,
      paper: 0,
      cloth: 0,
      coin: 0,
    };
  });
  await mountGame(page, done);
  await page.getByRole('tab', { name: 'Production' }).click();
  await page.locator('.end-game').screenshot({ path: 'test-results/visual-cues-results.png' });

  const lobby = makeLobby(3);
  lobby.mapProposals = [
    { mapId: 'base', name: 'Base game', layoutFor: null, by: ['p1', 'p2'] },
    { mapId: BUILTIN_BOARDS[1]!.id, name: BUILTIN_BOARDS[1]!.name, layoutFor: null, by: ['p0'] },
  ];
  lobby.spectators = [{ id: 'w', name: 'Watcher with a long name' }];
  await mountGame(page, lobby);
  await page.locator('.lobby-spectators').screenshot({ path: 'test-results/visual-cues-spectators.png' });
  await page.locator('.map-proposals').scrollIntoViewIfNeeded();
  await page.locator('.map-choice').screenshot({ path: 'test-results/visual-cues-proposals.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.map-choice').screenshot({ path: 'test-results/phone-cues-proposals.png' });
});

/** Christmas Candy with a generated train: one leg on the standard island, joined legs on a sea map. */
test('generated candy trains on the standard island and a sea map', async ({ page }) => {
  const plain = spreadPieces(['red', 'blue', 'white', 'orange'], 'gingerbread');
  const sea = seaSettled(BUILTIN_BOARDS.find(board => board.id === 'jungle-coast')!, 3);
  for (const [name, game] of [
    ['standard', plain],
    ['sea', sea],
  ] as const) {
    Object.assign(game.settings, { christmas: true, christmasCandy: true });
    game.board = { ...game.board, trains: autoTrain(game.board, seededRandom(4)) };
    await mountGame(page, game);
    await page.locator('.board-svg').screenshot({ path: `test-results/visual-candy-train-${name}.png` });
    // Close up on each tunnel, to check the signs stand clear of them.
    const tunnels = page.locator('.candy-tunnel');
    for (let i = 0; i < (await tunnels.count()); i++) {
      const box = (await tunnels.nth(i).boundingBox())!;
      const clip = { x: box.x - 60, y: box.y - 60, width: box.width + 120, height: box.height + 120 };
      await page.screenshot({ path: `test-results/visual-candy-tunnel-${name}-${i}.png`, clip });
    }
  }
});
