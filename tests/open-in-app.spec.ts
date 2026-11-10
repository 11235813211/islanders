import { type Browser, expect, test } from '@playwright/test';
import { join, PlayerConnection } from './server-helpers';

const IPHONE_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** A phone browser (iPhone Safari's user agent) that may copy and paste. */
async function iPhone(browser: Browser) {
  const context = await browser.newContext({ userAgent: IPHONE_AGENT, viewport: { width: 390, height: 844 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  return context;
}

test('an invite opened in iPhone Safari asks "Open in the Islanders app?" before joining; the app choice takes no seat', async ({
  browser,
  request,
}) => {
  const session = await join(request, 'Inviting host');
  const host = new PlayerConnection(session.roomId);
  const context = await iPhone(browser);
  const page = await context.newPage();
  try {
    await host.authenticate(session);
    await page.goto(`/#room=${session.roomId}`);
    const prompt = page.getByRole('dialog', { name: 'Open in the Islanders app?' });
    await expect(prompt).toBeVisible();
    await page.screenshot({ path: 'test-results/open-in-app.png' });
    await prompt.getByRole('button', { name: 'Open in app' }).click();
    await expect(page.getByRole('status')).toContainText('Invite copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`#room=${session.roomId}`);
    // Nothing was joined in the browser.
    await page.waitForTimeout(500);
    expect(host.state.players).toHaveLength(1);
  } finally {
    host.dispose();
    await context.close();
  }
});

test('"Continue here" joins in the browser; "Don\'t ask again" joins and stops asking', async ({
  browser,
  request,
}) => {
  const first = await join(request, 'First host');
  const second = await join(request, 'Second host');
  const host = new PlayerConnection(first.roomId);
  const context = await iPhone(browser);
  const page = await context.newPage();
  try {
    await host.authenticate(first);
    await page.goto(`/#room=${first.roomId}`);
    await page
      .getByRole('dialog', { name: 'Open in the Islanders app?' })
      .getByRole('button', { name: 'Continue here' })
      .click();
    await expect.poll(() => host.state.players.length).toBe(2);
    await expect(page.getByRole('heading', { name: 'Game settings' })).toBeVisible();

    const next = await context.newPage();
    await next.goto(`/#room=${second.roomId}`);
    await next.getByRole('button', { name: "Don't ask again" }).click();
    await expect(next.getByRole('heading', { name: 'Game settings' })).toBeVisible();
    const later = await context.newPage();
    const third = await join(request, 'Third host');
    await later.goto(`/#room=${third.roomId}`);
    await expect(later.getByRole('heading', { name: 'Game settings' })).toBeVisible();
    await expect(later.getByRole('dialog', { name: 'Open in the Islanders app?' })).toHaveCount(0);
  } finally {
    host.dispose();
    await context.close();
  }
});

test('inside the home-screen app an invite joins without asking, and a pasted invite link joins at once', async ({
  browser,
  request,
}) => {
  const linked = await join(request, 'Linked host');
  const pasted = await join(request, 'Pasted host');
  const context = await iPhone(browser);
  await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  const page = await context.newPage();
  try {
    await page.goto(`/#room=${linked.roomId}`);
    await expect(page.getByRole('heading', { name: 'Game settings' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Open in the Islanders app?' })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('islanders:has-app'))).toBe('1');

    // Paste (⌘V, or Paste on a phone) a whole invite link on the home screen: it joins.
    const app = await context.newPage();
    await app.goto('/');
    await app.evaluate(link => {
      const data = new DataTransfer();
      data.setData('text/plain', link);
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    }, `https://play.example.dev/#room=${pasted.roomId}`);
    await expect(app.getByRole('heading', { name: 'Game settings' })).toBeVisible();
    await expect(app.getByText(pasted.roomId).first()).toBeVisible();
  } finally {
    await context.close();
  }
});
