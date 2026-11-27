import { expect, test } from '@playwright/test';
import { candyGraph } from '../shared/maps/candy-train';
import { expectNoSpill, openCandyEditor } from './ui-harness';

test('candy routes draw, animate, pause, undo and persist through save and reopen', { tag: '@local' }, async ({
  page,
}) => {
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
  // Unset, the start sign shows the 4 or 10 each game draws; other dots show their two rolls.
  await expect(page.locator('.candy-start text')).toHaveText('4/10');
  await page.getByRole('button', { name: '4 dots (5 or 9)', exact: true }).click();
  await expect(page.locator('.candy-start text')).toHaveText('5/9');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  expect(board.saved().candyRoutes).toEqual([{ corners, side: -1, dots: 4 }]);
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

test('the candy preview fits, its look persists, and pure Christmas remains available', { tag: '@local' }, async ({
  page,
}) => {
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

test('reduced motion parks the candy train', { tag: '@local' }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCandyEditor(page);
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await page.getByRole('button', { name: 'New train route', exact: true }).click();
  await page.getByRole('button', { name: 'Start train at 0,0,0', exact: true }).click();
  await page.getByRole('button', { name: 'Train corner 0,0,1', exact: true }).click();
  await expect(page.locator('[data-train-progress]')).toHaveAttribute('data-train-progress', '0.000');
});

test('a drag lays a route along the highlighted edges in one undo step', async ({ page }) => {
  const board = await openCandyEditor(page);
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await page.getByRole('button', { name: 'New train route', exact: true }).click();
  const graph = candyGraph(board.saved().tiles);
  const keys = [0, 1, 2, 3].map(c => graph.get(`0,0,${c}`)!.key);
  const centers = [];
  for (const key of keys) {
    const box = (await page.getByRole('button', { name: `Start train at ${key}`, exact: true }).boundingBox())!;
    centers.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  }
  await page.mouse.move(centers[0]!.x, centers[0]!.y);
  await page.mouse.down();
  for (const p of centers.slice(1)) await page.mouse.move(p.x, p.y, { steps: 8 });
  // Highlights show only the edges onward from the route's end.
  await expect(page.locator('.candy-train-targets .board-road-target')).toHaveCount(2);
  await page.mouse.up();
  const tools = page.getByRole('region', { name: 'Candy train routes' });
  await expect(tools).toContainText('3 edges');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(tools).toContainText('Tap a corner to start');
});
