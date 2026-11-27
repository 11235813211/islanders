import { expect, test } from '@playwright/test';
import { candyGraph } from '../shared/maps/candy-train';
import { expectNoSpill, openCandyEditor } from './ui-harness';

test('candy routes draw, animate, pause, undo and persist through save and reopen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const board = await openCandyEditor(page);
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await page.getByRole('button', { name: 'New train route', exact: true }).click();
  const graph = candyGraph(board.saved().tiles);
  const corners = [0, 1, 2, 3, 4].map(c => graph.get(`0,0,${c}`)!.key);
  await page.getByRole('button', { name: `Start train at ${corners[0]}`, exact: true }).click();
  for (const key of corners.slice(1))
    await page.getByRole('button', { name: `Train corner ${key}`, exact: true }).click();
  await expect(page.locator('.candy-station')).toHaveCount(2);
  await expect(page.locator('.candy-train-car')).toHaveCount(6);
  const moving = page.locator('[data-train-progress]');
  await expect.poll(() => moving.getAttribute('data-train-progress')).not.toBe('0.000');
  await page.getByRole('button', { name: 'Pause train', exact: true }).click();
  const progress = await moving.getAttribute('data-train-progress');
  await page.waitForTimeout(120);
  expect(await moving.getAttribute('data-train-progress')).toBe(progress);
  await page.getByRole('button', { name: 'Remove last', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Candy train routes' })).toContainText('3 edges');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Candy train routes' })).toContainText('4 edges');
  await page.getByRole('button', { name: 'Flip rail side', exact: true }).click();
  // Unset, the start sign shows the 4 or 10 each game draws; a chosen number replaces it.
  await expect(page.locator('.candy-start text')).toHaveText('4/10');
  await page.getByRole('combobox', { name: 'Candy train number' }).selectOption('9');
  await expect(page.locator('.candy-start text')).toHaveText('9');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  expect(board.saved().candyRoutes).toEqual([{ corners, side: -1, number: 9 }]);
  await page.reload();
  await page.getByRole('button', { name: 'Edit Candy test', exact: true }).click();
  await expect(page.locator('.candy-station')).toHaveCount(2);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Preview', exact: true }).locator('.candy-station')).toHaveCount(2);
  await page.getByRole('button', { name: 'Close preview', exact: true }).click();
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  for (const width of [1600, 1280, 1024, 820, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await expectNoSpill(page.locator('.editor-bar'));
    await expectNoSpill(page.locator('.candy-train-tools'));
    await page.screenshot({ path: `test-results/candy-train-${width}.png` });
  }
  expect(errors).toEqual([]);
});

test('the candy preview fits, its look persists, and pure Christmas remains available', async ({ page }) => {
  await openCandyEditor(page);
  await page.getByRole('button', { name: 'Candy art', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Christmas Candy art' });
  await expect(dialog.locator('[data-candy-terrain]')).toHaveCount(5);
  await dialog.getByRole('button', { name: 'Christmas', exact: true }).click();
  await expect(page.locator('.editor-canvas [data-candy-terrain]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Christmas Candy', exact: true }).click();
  await expect(page.locator('.editor-canvas [data-candy-terrain="ore"]').first()).toBeVisible();
  for (const width of [1600, 1280, 1024, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expectNoSpill(dialog);
    await dialog.screenshot({ path: `test-results/candy-options-${width}.png` });
  }
  await dialog.getByRole('button', { name: 'Close candy art' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Edit Candy test', exact: true }).click();
  await expect(page.locator('.editor-canvas [data-candy-terrain="ore"]').first()).toBeVisible();
});

test('reduced motion parks the candy train', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCandyEditor(page);
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await page.getByRole('button', { name: 'New train route', exact: true }).click();
  await page.getByRole('button', { name: 'Start train at 0,0,0', exact: true }).click();
  await page.getByRole('button', { name: 'Train corner 0,0,1', exact: true }).click();
  await expect(page.locator('[data-train-progress]')).toHaveAttribute('data-train-progress', '0.000');
});
