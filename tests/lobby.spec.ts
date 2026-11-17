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
  // Saving games is off until the host chooses it; with nobody to opt out, the lobby says the game will be saved.
  const save = page.getByLabel('Save my game to improve bots');
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
  // Guests get one yellow View button.
  await expect(proposals.getByRole('button', { name: `View ${map.name}` })).toHaveCSS(
    'background-color',
    'rgb(255, 191, 66)',
  );
  // Withdrawing a map only this person backed leaves it grayed, with Undo, for three seconds.
  const own = proposals.getByRole('button', { name: new RegExp(`^${map.name}, proposed by`) });
  const undo = proposals.getByRole('button', { name: `Undo: propose ${map.name} again` });
  await own.click();
  await expect(undo).toBeVisible();
  await proposals.screenshot({ path: 'test-results/lobby-proposals-undo.png' });
  await undo.click();
  await expect(own).toHaveAttribute('aria-pressed', 'true');
  await own.click();
  await expect(undo).toBeVisible();
  await expect(undo).toBeHidden({ timeout: 4500 });
  await expect(proposals.locator('.map-proposal')).toHaveCount(1);
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
  await expect(proposals.getByRole('button', { name: `Use ${map.name}` })).toHaveCSS(
    'background-color',
    'rgb(23, 165, 137)',
  );
  await expect(proposals.getByRole('button', { name: `Decline ${map.name}` })).toHaveCSS(
    'background-color',
    'rgb(214, 69, 69)',
  );
  await proposals.getByRole('button', { name: 'Decline Base game' }).click();
  await expect(proposals.getByRole('button', { name: 'View Base game' })).toHaveCount(0);
  await expect(proposals.getByRole('button', { name: `Use ${map.name}` })).toBeVisible();
  expect(room.errors).toEqual([]);
});

test('raising points to win adds extra pieces the host can edit, fitting every width', async ({ page }) => {
  await mountGame(page, makeLobby(2));
  const points = page.getByRole('group', { name: 'Points to win' });
  const rules = page.locator('.setting-group').filter({ hasText: 'Points to win' });
  await expect(rules.getByText('Extra pieces')).toBeHidden();
  for (let n = 11; n <= 17; n++) {
    await points.getByRole('button', { name: 'More points to win' }).click();
    await expect(points.locator('output')).toHaveText(String(n));
  }
  // 17 points: pieces at 10 and 13.
  const rewards = rules.locator('.room-reward');
  await expect(rewards).toHaveCount(2);
  await expect(rewards.nth(1).getByRole('group', { name: 'points', exact: true }).locator('output')).toHaveText('13');
  await expect(rewards.nth(0).getByRole('group', { name: 'roads at 10 points' }).locator('output')).toHaveText('3');
  await rewards.nth(0).getByRole('button', { name: 'More cities at 10 points' }).click();
  await expect(rewards.nth(0).getByRole('group', { name: 'cities at 10 points' }).locator('output')).toHaveText('2');
  await rules.getByRole('button', { name: 'Add extra pieces' }).click();
  await expect(rewards).toHaveCount(3);
  for (const width of [1600, 1280, 1024, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSpill(rules);
  }
  await rules.screenshot({ path: 'test-results/lobby-rewards-phone.png' });
  await rewards
    .nth(2)
    .getByRole('button', { name: /^Remove the extra pieces/ })
    .click();
  await expect(rewards).toHaveCount(2);
});

test('the host proposes maps too; ten proposals sit in an even grid at every width', async ({ page }) => {
  const lobby = makeLobby(6);
  const seats = lobby.players.map(p => p.id);
  // Ten maps, each from one or two of the six seats, no seat past three.
  const maps = [{ id: 'base', name: 'Base game' }, ...BUILTIN_BOARDS.slice(1)];
  lobby.mapProposals = maps.map((map, i) => ({
    mapId: map.id,
    name: map.name,
    layoutFor: null,
    by: i < 3 ? [seats[1 + (i % 5)]!, seats[2 + (i % 4)]!] : [seats[1 + (i % 5)]!],
  }));
  const room = await mountGame(page, lobby);
  const proposals = page.locator('.map-proposals');
  await expect(proposals.locator('.map-proposal')).toHaveCount(10);
  await expect(proposals.getByText('Yours: 0 of 3')).toBeVisible();
  for (const width of [1600, 1280, 1024, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSpill(proposals);
    // Rows line up: every card in a row starts at the same top.
    const tops = await proposals
      .locator('.map-proposal')
      .evaluateAll(els => els.map(e => e.getBoundingClientRect().top));
    expect(new Set(tops.map(Math.round)).size).toBeLessThanOrEqual(Math.ceil(10 / 2));
    if (width === 1280 || width === 390)
      await proposals.screenshot({ path: `test-results/lobby-proposals-${width}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  // The host proposes from the maps browser, which offers both Propose and Use.
  const unproposed = BUILTIN_BOARDS[0]!;
  await page.locator('.mode-card').getByRole('button', { name: 'Choose map' }).click();
  const picker = page.getByRole('dialog', { name: 'Maps' });
  await expect(picker.getByRole('button', { name: `Use ${unproposed.name}` })).toBeVisible();
  await picker.getByRole('button', { name: `Propose ${unproposed.name}` }).click();
  // Proposed: green and bold, and pressing it again takes it back.
  const proposed = picker.getByRole('button', { name: `Unpropose ${unproposed.name}` });
  await expect(proposed).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(0, 0);
  await expect(proposed).toHaveCSS('background-color', 'rgb(23, 165, 137)');
  await picker.getByRole('button', { name: 'Close maps' }).click();
  await expect(proposals.locator('.map-proposal')).toHaveCount(11);
  await expect(proposals.getByText('Yours: 1 of 3')).toBeVisible();
  // Two more by backing proposals; then the rest are closed to the host until one is taken back.
  const pick = (name: string) => proposals.getByRole('button', { name: new RegExp(`^${name}, proposed by`) });
  await pick(BUILTIN_BOARDS[1]!.name).click();
  await pick(BUILTIN_BOARDS[2]!.name).click();
  await expect(proposals.getByText('Yours: 3 of 3')).toBeVisible();
  await expect(pick(BUILTIN_BOARDS[3]!.name)).toBeDisabled();
  await pick(BUILTIN_BOARDS[2]!.name).click();
  await expect(pick(BUILTIN_BOARDS[3]!.name)).toBeEnabled();
  expect(room.errors).toEqual([]);
});

test('an admin host sets the room code once, in a box that fits every width', async ({ page }) => {
  const room = await mountGame(page, makeLobby(2));
  const box = page.locator('.room-code-box');
  page.on('dialog', dialog => dialog.accept());
  await box.getByRole('button', { name: 'Set your own room code' }).click();
  const field = box.getByRole('textbox', { name: 'New room code' });
  await field.fill('island night!');
  await expect(field).toHaveValue('ISLANDNIGHT');
  for (const width of [1600, 1280, 1024, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSpill(box);
  }
  await box.screenshot({ path: 'test-results/lobby-room-code-edit.png' });
  await box.getByRole('button', { name: 'Set' }).click();
  await expect(page.locator('.page-heading h1')).toHaveText('ISLANDNIGHT');
  await expect(box).toContainText('ISLANDNIGHT');
  // Set once: no way to change it again.
  await expect(box.getByRole('button', { name: 'Set your own room code' })).toHaveCount(0);
  expect(room.errors).toEqual([]);
});

test('on a Seafarers map extra pieces give roads and ships, shown with the seat color pieces', async ({ page }) => {
  const sea = BUILTIN_BOARDS.find(b => b.id === 'outer-isles')!;
  const lobby = seaLobby(sea, 2);
  lobby.settings.victoryPoints = 13;
  await mountGame(page, lobby);
  const points = page.getByRole('group', { name: 'Points to win' });
  await points.getByRole('button', { name: 'More points to win' }).click();
  const rules = page.locator('.setting-group').filter({ hasText: 'Points to win' });
  const reward = rules.locator('.room-reward').first();
  await expect(reward.getByRole('group', { name: 'roads at 10 points' }).locator('output')).toHaveText('2');
  await expect(reward.getByRole('group', { name: 'ships at 10 points' }).locator('output')).toHaveText('2');
  await expect(reward.locator('.piece-icon')).toHaveCount(4);
  // When the pieces come is in the roll button's yellow.
  await expect(reward.locator('.room-reward-points .count-stepper')).toHaveCSS('background-color', 'rgb(255, 191, 66)');
  for (const width of [1600, 1280, 1024, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSpill(rules);
  }
  await rules.screenshot({ path: 'test-results/lobby-rewards-sea.png' });
});
