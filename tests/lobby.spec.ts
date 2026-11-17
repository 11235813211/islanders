import { expect, test } from '@playwright/test';
import { GUEST_NAMES } from '../shared/guest-names';
import { BUILTIN_BOARDS } from '../shared/maps/builtin';
import { makeLobby, seaLobby, testDesign } from './fixtures';
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
  // No Seafarers on the standard island: nothing about ships, and no empty Variations group.
  await expect(page.getByLabel('Roads meet ships', { exact: true })).toBeHidden();
  await expect(page.getByLabel('Ships and pirate', { exact: true })).toBeHidden();
  await expect(page.locator('.setting-group').filter({ hasText: 'Variations' })).toHaveCount(0);
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

test('Variations group Seafarers in blue, volcano and jungle settings in red, and Cartographers in purple, fitting every width', async ({
  page,
}) => {
  const design = testDesign(
    ['~ ~ ~ ~ ~ ~ ~', ' ~ w6 m5 j9 ~ ~', '~ s9 h8 v4 ~ ~', ' ~ g8 o10 b3 ~ ~', '~ ~ ~ ~ ~ ~ ~'],
    { expansions: ['seafarers'] },
  );
  const room = await mountGame(page, seaLobby(design, 2));
  const variations = page.locator('.setting-group').filter({ hasText: 'Variations' });
  const seafarers = variations.getByRole('group', { name: 'Seafarers' });
  await expect(seafarers).toContainText('Ships and pirate');
  await expect(seafarers).toContainText('Roads meet ships');
  const tropics = variations.getByRole('group', { name: 'Volcanoes and jungles' });
  const cartographers = variations.getByRole('group', { name: 'Cartographers' });
  await expect(tropics).toContainText('Jungle discoveries');
  await expect(tropics).toContainText('Volcanoes pay');
  await expect(cartographers).toContainText('Chart gold and volcanoes');
  const tone = (group: typeof tropics) => group.evaluate(el => getComputedStyle(el).getPropertyValue('--tone').trim());
  expect(await tone(seafarers)).toBe('#1d5f86');
  expect(await tone(tropics)).toBe('#c2412d');
  expect(await tone(cartographers)).toBe('#7b4fb0');
  for (const width of [1600, 1280, 1024, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSpill(variations);
  }
  await variations.screenshot({ path: 'test-results/lobby-variations.png' });
  expect(room.errors).toEqual([]);
});

/** A lobby where p0 (the viewer) may or may not be host, with two maps proposed. */
function proposalLobby(host: boolean) {
  const lobby = makeLobby(3);
  if (!host) lobby.hostId = 'p1';
  const map = BUILTIN_BOARDS[1]!;
  lobby.mapProposals = [
    { mapId: 'base', name: 'Base game', layoutFor: null, by: ['p1', 'p2'] },
    { mapId: map.id, name: map.name, layoutFor: null, by: ['p0'] },
  ];
  return { lobby, map };
}

test('a guest views each proposed map from a View button beneath it', async ({ page }) => {
  const { lobby, map } = proposalLobby(false);
  const room = await mountGame(page, lobby);
  const proposals = page.locator('.map-proposals');
  await expect(proposals.getByRole('button', { name: 'Use Base game' })).toHaveCount(0);
  await proposals.getByRole('button', { name: `View ${map.name}` }).click();
  const picker = page.getByRole('dialog', { name: 'Maps' });
  await expect(picker.getByRole('heading', { name: map.name })).toBeVisible();
  await picker.getByRole('button', { name: 'Close maps' }).click();
  await proposals.getByRole('button', { name: 'View Base game' }).click();
  await expect(picker.getByRole('heading', { name: 'Standard island' })).toBeVisible();
  await picker.getByRole('button', { name: 'Close maps' }).click();
  for (const width of [1600, 1280, 1024, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSpill(proposals);
  }
  await proposals.screenshot({ path: 'test-results/lobby-proposals-guest.png' });
  expect(room.errors).toEqual([]);
});

test('the host views, uses, or declines each proposed map, with room before the settings below', async ({ page }) => {
  const { lobby, map } = proposalLobby(true);
  const room = await mountGame(page, lobby);
  const proposals = page.locator('.map-proposals');
  // The next group starts below the proposals, not flush against them.
  const gap = await page.evaluate(() => {
    const above = document.querySelector('.map-proposals')!.getBoundingClientRect();
    const below = document.querySelector('.setting-group')!.getBoundingClientRect();
    return below.top - above.bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(12);
  await proposals.getByRole('button', { name: `View ${map.name}` }).click();
  const picker = page.getByRole('dialog', { name: 'Maps' });
  await expect(picker.getByRole('heading', { name: map.name })).toBeVisible();
  await picker.getByRole('button', { name: 'Close maps' }).click();
  for (const width of [1600, 1280, 1024, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSpill(proposals);
  }
  await proposals.screenshot({ path: 'test-results/lobby-proposals-host.png' });
  await proposals.getByRole('button', { name: 'Decline Base game' }).click();
  await expect(proposals.getByRole('button', { name: 'View Base game' })).toHaveCount(0);
  await expect(proposals.getByRole('button', { name: `Use ${map.name}` })).toBeVisible();
  expect(room.errors).toEqual([]);
});
