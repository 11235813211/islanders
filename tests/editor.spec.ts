import { expect, type Page, test } from '@playwright/test';
import { hexCenter } from '../shared/board';
import type { BoardDesign, BoardLibrary } from '../shared/maps';
import { origin, server } from './server-helpers';

/** Register an account and store it in the browser, as signing in would. */
async function signIn(page: Page) {
  const username = `editor_${Date.now().toString(36)}`;
  const response = await page.request.post(`${server}/api/accounts/register`, {
    headers: { Origin: origin },
    data: { username, password: 'Testing-only-password-492!' },
  });
  expect(response.status()).toBe(201);
  const session = await response.json();
  await page.addInitScript(value => localStorage.setItem('islanders-account', value), JSON.stringify(session));
  return { Origin: origin, Authorization: `Bearer ${username}:${session.token}` };
}

/** Screen point of the center of cell (q, r) on the editor canvas, plus an offset in board units. */
async function cellPoint(page: Page, q: number, r: number, dx = 0, dy = 0) {
  const svg = page.locator('.editor-canvas > svg');
  const [vx, vy, vw, vh] = (await svg.getAttribute('viewBox'))!.split(' ').map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const box = (await svg.boundingBox())!;
  const c = hexCenter(q, r);
  return { x: box.x + ((c.x + dx - vx) / vw) * box.width, y: box.y + ((c.y + dy - vy) / vh) * box.height };
}

async function drag(page: Page, cells: [number, number][], modifier?: 'Shift' | 'Alt' | 'Control') {
  if (modifier) await page.keyboard.down(modifier);
  const start = await cellPoint(page, ...cells[0]!);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const [q, r] of cells.slice(1)) {
    const p = await cellPoint(page, q, r);
    await page.mouse.move(p.x, p.y, { steps: 4 });
  }
  await page.mouse.up();
  if (modifier) await page.keyboard.up(modifier);
}

test('an editor draws a board with the mouse and modifier keys, fills it, and saves it', async ({ page }) => {
  const headers = await signIn(page);
  // Boards left by an interrupted earlier run (the local library persists).
  const stale = ((await (await page.request.get(`${server}/api/boards`)).json()) as BoardLibrary).boards.filter(b =>
    ['New board', 'Editor test board'].includes(b.name),
  );
  for (const board of stale) await page.request.delete(`${server}/api/boards/${board.id}`, { headers });
  await page.goto('/');
  await page.getByRole('button', { name: 'Board editor' }).click();
  const library = page.getByRole('navigation', { name: 'Board library' });
  await expect(library.getByText('Outer Isles')).toBeVisible();

  await library.getByRole('button', { name: 'Blank' }).first().click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('New board');
  await page.getByLabel('Name', { exact: true }).fill('Editor test board');

  // Drag outward from the single sea tile: more sea.
  await drag(page, [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
  ]);
  // Shift-drag: land. Ctrl-drag: the brush terrain (gold by default). Alt-drag: delete.
  await drag(
    page,
    [
      [1, 0],
      [0, 1],
    ],
    'Shift',
  );
  await drag(page, [[0, 0]], 'Control');
  await drag(page, [[2, 1]], 'Alt');
  await page.screenshot({ path: 'test-results/editor-desktop.png' });

  // Click a number token twice: random → 2 → 3. Shift-click lowers it back to 2.
  const token = await cellPoint(page, 1, 0, 0, 8);
  await page.mouse.click(token.x, token.y);
  await page.mouse.click(token.x, token.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(token.x, token.y);
  await page.keyboard.up('Shift');

  // Select a land tile and close its island to starting settlements.
  const land = await cellPoint(page, 0, 1, 0, -32);
  await page.mouse.click(land.x, land.y);
  await page.getByRole('checkbox', { name: 'No starting settlements' }).check();
  await page.getByRole('button', { name: 'Fill land' }).click();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();

  const saved = ((await (await page.request.get(`${server}/api/boards`)).json()) as BoardLibrary).boards.find(
    b => b.name === 'Editor test board',
  ) as BoardDesign;
  const at = (q: number, r: number) => saved.tiles.find(t => t.q === q && t.r === r);
  expect(at(0, 0)?.kind).toBe('gold');
  expect(at(1, 0)?.number).toBe(2);
  expect(at(1, 0)?.kind).not.toBe('land');
  expect(at(0, 1)?.noSetup).toBe(true);
  expect(at(2, 0)?.kind).toBe('sea');
  expect(at(2, 1)).toBeUndefined();

  // Undo and redo with the keyboard, then clean up.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  // Play test opens a solo test room already set to this board.
  await page.getByRole('button', { name: 'Play test' }).click();
  await expect(page.locator('.mode-card h3')).toHaveText('Editor test board');
  await expect(page.getByText('SOLO TEST ROOM')).toBeVisible();
  expect((await page.request.delete(`${server}/api/boards/${saved.id}`, { headers })).status()).toBe(200);
});

test('boards move between categories by drag and drop, and categories can be added', async ({ page }) => {
  const headers = await signIn(page);
  await page.goto('/#editor');
  const library = page.getByRole('navigation', { name: 'Board library' });
  await expect(library.getByText('Outer Isles')).toBeVisible();
  const before = (await (await page.request.get(`${server}/api/boards`)).json()) as BoardLibrary;
  await library.getByRole('button', { name: 'Add category' }).click();
  await expect(library.getByLabel('Category name')).toHaveCount(before.categories.length + 1);
  const fresh = library.locator('.library-category').last();
  await library.locator('.library-board', { hasText: 'Small Isles' }).dragTo(fresh);
  await expect(fresh.getByText('Small Isles')).toBeVisible();
  await expect
    .poll(async () => {
      const lib = (await (await page.request.get(`${server}/api/boards`)).json()) as BoardLibrary;
      return lib.boards.find(b => b.id === 'small-isles')?.categoryId;
    })
    .toMatch(/^category-/);
  // Put everything back.
  const restore = await page.request.put(`${server}/api/boards`, {
    headers,
    data: { categories: before.categories, order: before.boards.map(b => ({ id: b.id, categoryId: b.categoryId })) },
  });
  expect(restore.status()).toBe(200);
});
