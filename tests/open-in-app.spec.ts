import { expect, test } from '@playwright/test';
import { join, PlayerConnection } from './server-helpers';

const IPHONE_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test('an invite opened in an iPhone browser offers the home-screen app: the seat is given up and the invite copied', async ({
  browser,
  request,
}) => {
  const session = await join(request, 'Inviting host');
  const host = new PlayerConnection(session.roomId);
  const context = await browser.newContext({ userAgent: IPHONE_AGENT, viewport: { width: 390, height: 844 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  try {
    await host.authenticate(session);
    await page.goto(`/#room=${session.roomId}`);
    await expect.poll(() => host.state.players.length).toBe(2);
    const banner = page.getByRole('region', { name: 'Open in the app' });
    await expect(banner).toBeVisible();
    await page.screenshot({ path: 'test-results/open-in-app.png' });
    await banner.getByRole('button', { name: 'Open there' }).click();
    // Back home, the seat freed, and the invite link ready to paste into the app.
    await expect(page.getByRole('status')).toContainText('Invite copied');
    await expect.poll(() => host.state.players.length).toBe(1);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`#room=${session.roomId}`);
  } finally {
    host.dispose();
    await context.close();
  }
});

test('"Don\'t ask again" stops the offer; inside the app there is no offer, and the join box can paste', async ({
  browser,
  request,
}) => {
  const session = await join(request, 'Second host');
  const context = await browser.newContext({ userAgent: IPHONE_AGENT, viewport: { width: 390, height: 844 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  try {
    await page.goto(`/#room=${session.roomId}`);
    await page
      .getByRole('region', { name: 'Open in the app' })
      .getByRole('button', { name: "Don't ask again" })
      .click();
    await expect(page.getByRole('region', { name: 'Open in the app' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Game settings' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Open in the app' })).toHaveCount(0);

    // The home-screen app: never offers itself, and pastes an invite into the join box.
    const app = await context.newPage();
    await app.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    await app.goto('/');
    await app.evaluate(link => navigator.clipboard.writeText(link), `https://play.example.dev/#room=${session.roomId}`);
    await app.getByRole('button', { name: 'Paste' }).click();
    await expect(app.getByLabel('Room code or invite link')).toHaveValue(session.roomId);
    expect(await app.evaluate(() => localStorage.getItem('islanders:has-app'))).toBe('1');
  } finally {
    await context.close();
  }
});
