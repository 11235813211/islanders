import { expect, test } from '@playwright/test';
import { GUEST_NAMES } from '../shared/guest-names';
import { seaLobby, testDesign } from './fixtures';
import { expectNoSpill, mountGame } from './ui-harness';

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
  // No Seafarers on the standard island: nothing about ships.
  await expect(page.getByLabel('Roads meet ships', { exact: true })).toBeHidden();
  const points = page.getByRole('group', { name: 'Points to win' });
  await points.getByRole('button', { name: 'More points to win' }).click();
  await expect(points.locator('output')).toHaveText('11');
  // Saving games is off until chosen; with the only person agreeing, the lobby says the game will be saved.
  const save = page.getByLabel('Save my games to improve the bots');
  await expect(save).not.toBeChecked();
  await expect(page.getByText('This game will be saved for bot training.')).toBeHidden();
  await save.click();
  await expect(save).toBeChecked();
  await expect(page.getByText('This game will be saved for bot training.')).toBeVisible();
  await page.screenshot({ path: 'test-results/lobby-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/lobby-phone.png', fullPage: true });
});

test('the copy button beside the room code copies just the code, which the join box accepts', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Create room' }).click();
  const code = (await page.locator('.room-code-box strong').textContent())!;
  await page.getByRole('button', { name: 'Copy room code' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  // A full invite link pasted into the join box becomes the code, not "HTTPSPLAY…".
  await page.getByRole('button', { name: 'Leave room' }).click();
  await page.getByLabel('Room code or invite link').fill(`https://play.islandersgame.workers.dev/#room=${code}`);
  await expect(page.getByLabel('Room code or invite link')).toHaveValue(code);
});

test('Variations group volcano and jungle settings in red and Cartographers in purple, fitting every width', async ({
  page,
}) => {
  const design = testDesign([
    '~ ~ ~ ~ ~ ~ ~',
    ' ~ w6 m5 j9 ~ ~',
    '~ s9 h8 v4 ~ ~',
    ' ~ g8 o10 b3 ~ ~',
    '~ ~ ~ ~ ~ ~ ~',
  ]);
  const room = await mountGame(page, seaLobby(design, 2));
  const variations = page.locator('.setting-group').filter({ hasText: 'Variations' });
  const tropics = variations.getByRole('group', { name: 'Volcanoes and jungles' });
  const cartographers = variations.getByRole('group', { name: 'Cartographers' });
  await expect(tropics).toContainText('Jungle discoveries');
  await expect(tropics).toContainText('Volcanoes pay');
  await expect(cartographers).toContainText('Chart gold and volcanoes');
  const tone = (group: typeof tropics) => group.evaluate(el => getComputedStyle(el).getPropertyValue('--tone').trim());
  expect(await tone(tropics)).toBe('#c2412d');
  expect(await tone(cartographers)).toBe('#7b4fb0');
  for (const width of [1600, 1280, 1024, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSpill(variations);
  }
  await variations.screenshot({ path: 'test-results/lobby-variations.png' });
  expect(room.errors).toEqual([]);
});
