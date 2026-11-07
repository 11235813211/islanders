import { expect, test } from '@playwright/test';
import { GUEST_NAMES } from '../shared/guest-names';

test('a guest without a name gets one from the list, picks a color, and sets the points target', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByRole('heading', { name: 'Game settings' })).toBeVisible();
  const name = (await page.locator('.lobby-player strong').first().textContent())!.replace(/you$/, '');
  expect(GUEST_NAMES).toContain(name);

  const purple = page.getByRole('radio', { name: 'Purple', exact: true });
  await purple.click();
  await expect(purple).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.lobby-player span').first()).toContainText('Purple');

  await expect(page.getByLabel('Number layout', { exact: true })).toHaveValue('ordered');
  const points = page.getByRole('group', { name: 'Points to win' });
  await points.getByRole('button', { name: 'More points to win' }).click();
  await expect(points.locator('output')).toHaveText('11');
  await page.screenshot({ path: 'test-results/lobby-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/lobby-phone.png', fullPage: true });
});
