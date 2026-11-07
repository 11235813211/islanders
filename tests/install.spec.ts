import { expect, test } from '@playwright/test';

// Chrome's own installability check: the same one that decides whether Android offers "Install app".
test('Chrome reports the site as installable, with the home-screen icons loading', async ({ page }) => {
  await page.goto('/');
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  // Test browsers are private windows, which Chrome never installs from; every other check must pass.
  const problems = installabilityErrors.map(error => error.errorId).filter(id => id !== 'in-incognito');
  expect(problems).toEqual([]);
  for (const path of ['icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-maskable-512.png']) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['content-type'], path).toContain('image/png');
  }
  await cdp.detach();
});
