import { expect, test } from '@playwright/test';
import { join, PlayerConnection } from './server-helpers';

const IPHONE_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test('an invite opened in iPhone Safari joins at once, and a pasted invite link joins from home', async ({
  browser,
  request,
}) => {
  const linked = await join(request, 'Linked host');
  const pasted = await join(request, 'Pasted host');
  const host = new PlayerConnection(linked.roomId);
  const context = await browser.newContext({ userAgent: IPHONE_AGENT, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await host.authenticate(linked);
    await page.goto(`/#room=${linked.roomId}`);
    await expect(page.getByRole('heading', { name: 'Game settings' })).toBeVisible();
    await expect.poll(() => host.state.players.length).toBe(2);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Paste (⌘V, or Paste on a phone) a whole invite link on the home screen: it joins.
    const home = await context.newPage();
    await home.goto('/');
    await home.evaluate(link => {
      const data = new DataTransfer();
      data.setData('text/plain', link);
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    }, `https://play.example.dev/#room=${pasted.roomId}`);
    await expect(home.getByRole('heading', { name: 'Game settings' })).toBeVisible();
    await expect(home.getByText(pasted.roomId).first()).toBeVisible();
  } finally {
    host.dispose();
    await context.close();
  }
});
