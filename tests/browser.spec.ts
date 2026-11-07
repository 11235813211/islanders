import { expect, type Page, test } from '@playwright/test';
import { ORDERED_NUMBERS, spiralHexes } from '../shared/board';
import type { GameView, ServerMessage } from '../shared/types';
import { RESOURCES } from '../shared/types';

function observe(page: Page) {
  let view: GameView | undefined;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', socket =>
    socket.on('framereceived', frame => {
      try {
        const message = JSON.parse(frame.payload.toString()) as ServerMessage;
        if (message.type === 'state') view = message.state;
      } catch {
        /* ping/pong */
      }
    }),
  );
  return { state: () => view, errors };
}

test('solo lobby, large board, seat switching, mobile and tablet layouts', async ({ page }) => {
  const game = observe(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Play Islanders' })).toBeVisible();
  await expect(page.locator('.board-svg')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Create solo test room' }).click();
  await expect(page.getByRole('heading', { name: 'Game settings' })).toBeVisible();
  await expect(page.locator('.board-svg')).toHaveCount(0);
  await expect(page.locator('.lobby-player')).toHaveCount(3);
  await page.getByLabel('Automatic dice roll').selectOption('0');
  await expect.poll(() => game.state()?.settings.autoRollSeconds).toBe(0);
  await page.getByLabel('Number layout', { exact: true }).selectOption('ordered');
  await expect.poll(() => game.state()?.settings.numberLayout).toBe('ordered');
  expect(
    spiralHexes(game.state()!.board)
      .filter(h => h.terrain !== 'desert')
      .map(h => h.number),
  ).toEqual(ORDERED_NUMBERS);
  await page.getByLabel('Turn time limit', { exact: true }).fill('90');
  await page.getByLabel('Turn time limit', { exact: true }).press('Tab');
  await expect.poll(() => game.state()?.settings.turnSeconds).toBe(90);
  await page.screenshot({ path: 'test-results/lobby-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  for (let turn = 0; turn < 6; turn++) {
    await page
      .getByRole('button', { name: /^Build settlement at/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Confirm settlement', exact: true }).click();
    await page
      .getByRole('button', { name: /^Build road at/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Confirm road', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: 'Roll dice' })).toBeEnabled();
  await expect
    .poll(() => page.locator('.board-svg').evaluate(el => el.getBoundingClientRect().height))
    .toBeGreaterThan(600);
  await page.screenshot({ path: 'test-results/game-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Roll dice' }).click();
  await expect.poll(() => game.state()?.phase).not.toBe('roll');
  if (game.state()?.phase === 'robber') {
    await page
      .getByRole('button', { name: /^Move robber to/ })
      .first()
      .click();
    await expect.poll(() => game.state()?.phase).not.toBe('robber');
    if (game.state()?.phase === 'steal')
      await page
        .getByRole('button', { name: /^Steal from/ })
        .first()
        .click();
  }
  await expect(page.getByRole('button', { name: 'End turn' })).toBeEnabled();
  const host = game.state()!.selfId;
  const other = game.state()!.players.find(p => p.id !== host)!;
  await page.getByLabel('Play as', { exact: true }).selectOption(other.id);
  await expect.poll(() => game.state()?.selfId).toBe(other.id);
  await expect(page.getByRole('button', { name: 'End turn' })).toHaveCount(0);
  await page.getByLabel('Play as', { exact: true }).selectOption(host);
  await expect(page.getByRole('button', { name: 'End turn' })).toBeEnabled();
  const labels = { wood: 'Lumber', brick: 'Brick', sheep: 'Wool', wheat: 'Grain', ore: 'Ore' };
  const give = RESOURCES.find(resource => game.state()!.hand[resource] > 0)!;
  const want = RESOURCES.find(resource => resource !== give)!;
  await page.getByRole('button', { name: new RegExp(`^Trade ${labels[give]}`) }).click();
  await page.getByRole('button', { name: `Request one more ${labels[want]}` }).click();
  await page.getByRole('button', { name: 'Send offer' }).click();
  await expect.poll(() => game.state()?.tradeOffer).toBeTruthy();
  await page.getByRole('button', { name: 'activity', exact: true }).click();
  await page.getByLabel('Play as', { exact: true }).selectOption(other.id);
  await expect(page.getByRole('region', { name: 'Trade offer' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Decline trade', exact: true }).click();
  await expect.poll(() => game.state()?.tradeOffer?.declinedBy.includes(other.id)).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Play as', { exact: true }).selectOption(host);
  await page.getByRole('button', { name: 'Withdraw offer' }).click();
  await expect.poll(() => game.state()?.tradeOffer).toBeNull();
  await page.getByRole('button', { name: 'dice', exact: true }).click();
  await expect(page.getByText('1 roll', { exact: true })).toBeVisible();
  for (const [width, height, label] of [
    [390, 844, 'phone'],
    [844, 390, 'phone-landscape'],
    [1024, 640, 'small-laptop'],
    [820, 1180, 'tablet'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
        ),
      )
      .toBe(true);
    await page.screenshot({ path: `test-results/game-${label}.png`, fullPage: true });
  }
  expect(game.errors).toEqual([]);
});

test('username sign-in resumes the same room on another device and signs out', async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await first.newPage();
  const phone = await second.newPage();
  const a = observe(host),
    b = observe(phone);
  const username = `ui_${Date.now().toString(36)}`;
  const password = 'Browser-test-password-492!';
  try {
    await host.goto('/');
    await host.getByRole('button', { name: 'Sign in', exact: true }).click();
    await host.getByRole('button', { name: 'Create account', exact: true }).click();
    await host.getByLabel('Username', { exact: true }).fill(username);
    await host.getByLabel('Password', { exact: true }).fill(password);
    await host.locator('form').getByRole('button', { name: 'Create account' }).click();
    // New accounts see their one-time recovery code.
    await expect(host.getByRole('dialog', { name: 'Save your recovery code' })).toBeVisible();
    await expect(host.locator('.recovery-code code')).toHaveText(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
    await host.getByRole('button', { name: 'I saved it' }).click();
    await expect(host.getByRole('dialog')).toHaveCount(0);
    await host.getByRole('button', { name: 'Create solo test room' }).click();
    await expect.poll(() => a.state()?.players.length).toBe(3);
    const roomId = a.state()!.roomId;
    await phone.goto(`/#room=${roomId}`);
    await expect.poll(() => b.state()?.role).toBe('spectator');
    await phone.getByRole('button', { name: 'Sign in', exact: true }).click();
    await phone.getByLabel('Username', { exact: true }).fill(username);
    await phone.getByLabel('Password', { exact: true }).fill(password);
    await phone.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(phone.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => b.state()?.selfId).toBe(a.state()?.selfId);
    await expect(phone.locator('.lobby-player')).toHaveCount(3);
    await phone.getByRole('button', { name: 'Sign out' }).click();
    await expect(phone.getByRole('heading', { name: 'Play Islanders' })).toBeVisible();
    await expect(host.locator('.connection-pill')).toHaveText('Connected');
    expect(a.errors.concat(b.errors)).toEqual([]);
  } finally {
    await first.close();
    await second.close();
  }
});

test('a phone can join by pasting a spectator link and chat without receiving player controls', async ({ browser }) => {
  const hostContext = await browser.newContext(),
    watcherContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostContext.newPage(),
    watcher = await watcherContext.newPage();
  const a = observe(host),
    b = observe(watcher);
  try {
    await host.goto('/');
    await host.getByRole('button', { name: 'Create solo test room' }).click();
    await expect.poll(() => a.state()?.players.length).toBe(3);
    await host.getByRole('button', { name: 'Start game', exact: true }).click();
    // Pasting a whole spectator link (as iPhone home-screen users do) fills the code and the spectator choice.
    await watcher.goto('/');
    await watcher
      .getByLabel('Room code or invite link')
      .fill(`https://play.example.dev/#room=${a.state()!.roomId.toLowerCase()}&spectate=1`);
    await expect(watcher.getByLabel('Room code or invite link')).toHaveValue(a.state()!.roomId);
    await expect(watcher.getByLabel('Join as a spectator')).toBeChecked();
    await watcher.getByRole('button', { name: 'Watch', exact: true }).click();
    await expect.poll(() => b.state()?.role).toBe('spectator');
    await expect(watcher.getByText('Watching · hands stay private')).toBeVisible();
    await expect(watcher.getByRole('button', { name: /^Build road at/ })).toHaveCount(0);
    await expect(watcher.getByRole('button', { name: 'Propose pause', exact: true })).toHaveCount(0);
    await watcher.getByRole('button', { name: 'Open chat' }).click();
    await watcher.getByLabel('Chat message').fill('Hello from my phone');
    await watcher.getByRole('button', { name: 'Send message' }).click();
    await expect.poll(() => a.state()?.chat.at(-1)?.text).toBe('Hello from my phone');
    expect(a.errors.concat(b.errors)).toEqual([]);
  } finally {
    await hostContext.close();
    await watcherContext.close();
  }
});

test('invite links enter a lobby directly once, spectator links watch, and people can switch between seat and spectator', async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext(),
    c = await browser.newContext();
  try {
    const host = await a.newPage(),
      friend = await b.newPage(),
      watcher = await c.newPage();
    const h = observe(host),
      f = observe(friend),
      w = observe(watcher);
    await host.goto('/');
    await host.getByRole('button', { name: 'Create room', exact: true }).click();
    await expect.poll(() => h.state()?.players.length).toBe(1);
    let joins = 0;
    friend.on('request', request => {
      if (request.url().endsWith('/join')) joins++;
    });
    await friend.goto(`/#room=${h.state()!.roomId}`);
    await expect.poll(() => f.state()?.role).toBe('player');
    await expect(friend.locator('.lobby-player')).toHaveCount(2);
    expect(joins).toBe(1);
    await friend.reload();
    await expect(friend.locator('.lobby-player')).toHaveCount(2);
    expect(joins).toBe(1);
    // The invite dialog labels both links and copies each one separately.
    await host.getByRole('button', { name: 'Invite friends' }).click();
    const invite = host.getByRole('dialog', { name: `Invite to ${h.state()!.roomId}` });
    const playerUrl = await invite.getByLabel('Player link URL').inputValue();
    const spectatorUrl = await invite.getByLabel('Spectator link URL').inputValue();
    expect(playerUrl).toMatch(new RegExp(`#room=${h.state()!.roomId}$`));
    expect(spectatorUrl).toBe(`${playerUrl}&spectate=1`);
    await expect(invite.getByRole('button', { name: 'Copy player link' })).toBeVisible();
    await expect(invite.getByRole('button', { name: 'Copy spectator link' })).toBeVisible();
    await invite.getByRole('button', { name: 'Close dialog' }).click();
    await watcher.goto(new URL(spectatorUrl).hash ? `/${new URL(spectatorUrl).hash}` : spectatorUrl);
    await expect.poll(() => w.state()?.role).toBe('spectator');
    await expect(watcher.locator('.lobby-player')).toHaveCount(2);
    // Spectators can take an open seat, and players can step back to watch.
    await watcher.getByRole('button', { name: 'Take a seat' }).click();
    await expect.poll(() => w.state()?.role).toBe('player');
    await expect(host.locator('.lobby-player')).toHaveCount(3);
    await friend.getByRole('button', { name: 'Watch instead' }).click();
    await expect.poll(() => f.state()?.role).toBe('spectator');
    await expect(host.locator('.lobby-player')).toHaveCount(2);
    expect(h.errors.concat(f.errors, w.errors)).toEqual([]);
  } finally {
    await a.close();
    await b.close();
    await c.close();
  }
});
