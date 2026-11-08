import { expect, test } from '@playwright/test';

test('the host picks a map from the picker; it shows in the lobby with its points and a player warning', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByRole('heading', { name: 'Game settings' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Base game' })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('radio', { name: 'Choose map' }).click();
  const picker = page.getByRole('dialog', { name: 'Maps' });
  await expect(picker.getByRole('heading', { name: 'Seafaring' })).toBeVisible();
  // One person in the room: the filter starts at two players. Small Isles fits; others are grayed, not hidden.
  await expect(picker.locator('.map-card', { hasText: 'Small Isles' })).not.toHaveClass(/misfit/);
  await expect(picker.locator('.map-card', { hasText: 'Outer Isles' })).toHaveClass(/misfit/);
  await picker.getByRole('radio', { name: 'Maps for 4 players' }).click();
  await expect(picker.locator('.map-card', { hasText: 'Outer Isles' })).not.toHaveClass(/misfit/);
  await page.screenshot({ path: 'test-results/map-picker.png' });
  await picker.getByRole('button', { name: 'View Outer Isles' }).click();
  await expect(picker.getByRole('img', { name: 'Outer Isles map' })).toBeVisible();
  await expect(picker.getByRole('note')).toContainText('Made for 3–4 players. This room has 1.');
  await picker.getByRole('button', { name: 'Zoom in' }).click();
  await page.screenshot({ path: 'test-results/map-detail.png' });
  await picker.getByRole('button', { name: 'Use this map' }).click();

  await expect(picker).toBeHidden();
  await expect(page.locator('.mode-card h3')).toHaveText('Outer Isles');
  await expect(page.getByRole('radio', { name: 'Choose map' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('group', { name: 'Points to win' }).locator('output')).toHaveText('13');
  await expect(page.getByRole('note')).toContainText('made for 3–4 players');
  await expect(page.getByLabel('Number layout', { exact: true })).toBeHidden();

  // Two bots make three players: the warning goes away, and the game starts on the sea map.
  await page.getByRole('button', { name: 'Add bot' }).click();
  await page.getByRole('button', { name: 'Add bot' }).click();
  await expect(page.getByRole('note')).toBeHidden();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('.board-pirate')).toHaveCount(1);
  await expect(page.locator('.terrain-gold').first()).toBeVisible();
});

test('back to the base game resets the points target', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create room' }).click();
  await page.getByRole('radio', { name: 'Choose map' }).click();
  const picker = page.getByRole('dialog', { name: 'Maps' });
  // Use straight from the card, without opening it.
  await picker.getByRole('button', { name: 'Use Small Isles' }).click();
  await expect(page.getByRole('group', { name: 'Points to win' }).locator('output')).toHaveText('12');
  await page.getByRole('radio', { name: 'Base game' }).click();
  await expect(page.locator('.mode-card h3')).toHaveText('Standard island');
  await expect(page.getByRole('group', { name: 'Points to win' }).locator('output')).toHaveText('10');
});

test('on a sea map a real game lets a player place a ship in setup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create room' }).click();
  await page.getByRole('radio', { name: 'Choose map' }).click();
  await page.getByRole('dialog', { name: 'Maps' }).getByRole('button', { name: 'Use Small Isles' }).click();
  await page.getByRole('button', { name: 'Add bot' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  // Our first settlement goes on the first open corner; then a ship goes on a sea edge beside it.
  const corner = page.getByRole('button', { name: /^Build settlement at / }).first();
  await expect(corner).toBeVisible({ timeout: 30_000 });
  await corner.click();
  await page.getByRole('button', { name: 'Confirm settlement' }).click();
  const seaEdge = page.getByRole('button', { name: /^Build (road or ship|ship) at / }).first();
  test.skip(!(await seaEdge.isVisible()), 'The first corner on this draw is inland');
  const label = (await seaEdge.getAttribute('aria-label'))!;
  await seaEdge.click();
  if (label.includes('road or ship')) await page.getByRole('button', { name: 'Confirm ship' }).click();
  else await page.getByRole('button', { name: /Confirm/ }).click();
  await expect(page.locator('.board-ship-piece')).toHaveCount(1);
});
