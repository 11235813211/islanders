import { expect, type Page, test } from '@playwright/test';
import { hexCenter } from '../shared/board';
import { type BoardDesign, type BoardLibrary, BUILTIN_BOARDS } from '../shared/maps';
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

async function drag(page: Page, cells: [number, number][], modifier?: 'Shift' | 'Alt' | 'Control' | 'Space') {
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
  const library = page.getByRole('dialog', { name: 'Boards' });
  await expect(library.getByText('Outer Isles')).toBeVisible();
  await page.screenshot({ path: 'test-results/editor-browser.png' });

  await library.getByRole('button', { name: 'New blank board' }).first().click();
  await expect(page.getByLabel('Board name')).toHaveValue('New board');
  await page.getByLabel('Board name').fill('Editor test board');

  // A plain drag moves the view (nothing is painted). Space-drag paints sea.
  await drag(page, [
    [0, 0],
    [1, 0],
  ]);
  await expect(page.locator('.editor-ghost')).toHaveCount(6);
  await drag(
    page,
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ],
    'Space',
  );
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
  // Space-drag paints sea over land too.
  await drag(page, [[0, 1]], 'Shift');
  await drag(page, [[0, 1]], 'Space');
  await drag(page, [[0, 1]], 'Shift');
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
  await page.getByRole('button', { name: 'Fill land', exact: true }).click();
  // The Link tool makes a filled tile random land again, linked to A.
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  const linked = await cellPoint(page, 0, 1, 0, -32);
  await page.mouse.click(linked.x, linked.y);
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  // Numbers swap with their equal-odds partner each game; harbors can't be 2:1 lumber.
  await page.getByRole('button', { name: /^Swap equal-odds numbers/ }).click();
  await page.getByRole('button', { name: /^Random harbors can give/ }).click();
  await page.getByRole('checkbox', { name: '2:1 Lumber' }).uncheck();
  await page.screenshot({ path: 'test-results/editor-fills.png' });
  await page.keyboard.press('Escape');
  // A corner closed to starting settlements, a link rule, and wood numbers made richer.
  await page.getByRole('button', { name: 'No start', exact: true }).click();
  const corner = await cellPoint(page, 1, 0, 0, -60);
  await page.mouse.click(corner.x, corner.y);
  await expect(page.locator('.editor-nostart')).toHaveCount(1);
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  const rules = page.getByRole('region', { name: 'Link rules' });
  await rules.getByRole('radio', { name: 'In terrains' }).click();
  await rules.getByRole('group', { name: 'Letters' }).getByRole('button', { name: 'A' }).click();
  await rules.getByRole('button', { name: 'Mountains' }).click();
  await rules.getByRole('button', { name: 'Add rule' }).click();
  await expect(rules.getByText('in Mountains')).toBeVisible();
  await page.getByRole('button', { name: /^Numbers by terrain/ }).click();
  await page.getByLabel('Forest numbers').selectOption('2');
  await page.keyboard.press('Escape');
  // A version of the board for five and six players.
  await page.getByRole('button', { name: 'Add a version for other player counts' }).click();
  await expect(page.getByRole('tab', { name: '5–6' })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: 'test-results/editor-rules.png' });
  await page.getByRole('tab', { name: '3–4' }).click();

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
  expect(at(0, 1)).toMatchObject({ kind: 'land', link: 'A' });
  expect(saved.swapNumbers).toBe(true);
  expect(saved.harborExclude).toEqual(['wood']);
  expect(saved.noStart).toHaveLength(1);
  expect(saved.linkRules).toEqual([{ kind: 'in', links: ['A'], terrains: ['ore'] }]);
  expect(saved.numberBias).toEqual({ wood: 2 });
  expect(saved.versions?.[0]?.players).toEqual({ min: 5, max: 6 });
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
  // Empty categories left by an interrupted earlier run (the local library persists).
  const stale = (await (await page.request.get(`${server}/api/boards`)).json()) as BoardLibrary;
  const used = new Set(stale.boards.map(b => b.categoryId));
  const kept = stale.categories.filter(c => c.name !== 'New category' || used.has(c.id));
  if (kept.length < stale.categories.length)
    await page.request.put(`${server}/api/boards`, {
      headers,
      data: { categories: kept, order: stale.boards.map(b => ({ id: b.id, categoryId: b.categoryId })) },
    });
  await page.goto('/#editor');
  const library = page.getByRole('dialog', { name: 'Boards' });
  await expect(library.getByText('Outer Isles')).toBeVisible();
  const before = (await (await page.request.get(`${server}/api/boards`)).json()) as BoardLibrary;
  await library.getByRole('button', { name: 'Add category' }).click();
  await expect(library.getByLabel('Category name')).toHaveCount(before.categories.length + 1);
  const fresh = library.locator('.map-category').last();
  await library.locator('.map-card', { hasText: 'Small Isles' }).dragTo(fresh);
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

test('the settings panel fits without sideways scrolling, folds away, and a board open elsewhere is read-only', async ({
  page,
  browser,
}) => {
  await signIn(page);
  await page.goto('/#editor');
  const library = page.getByRole('dialog', { name: 'Boards' });
  await expect(library.getByRole('button', { name: 'Home' })).toBeVisible();
  await library.getByRole('button', { name: 'Edit Outer Isles' }).click();
  const panel = page.getByRole('complementary', { name: 'Settings' });
  await expect(panel.getByText('Random land mix')).toBeVisible();
  // Select a random land tile so the tile panel (with its dot limits) shows too.
  const land = BUILTIN_BOARDS.find(b => b.id === 'outer-isles')!.tiles.find(t => t.kind === 'land')!;
  // Below the number token: clicking the token itself raises the number.
  const point = await cellPoint(page, land.q, land.r, 0, 32);
  await page.mouse.click(point.x, point.y);
  await expect(panel.getByRole('group', { name: 'Random number may have' })).toBeVisible();
  const overflow = await panel.evaluate(el => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/editor-panel.png' });
  await page.getByRole('button', { name: 'Hide settings panel' }).click();
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: 'Show settings panel' }).click();
  await expect(panel).toBeVisible();

  // A second editor opening the same board can look but not save.
  const other = await browser.newPage();
  await signIn(other);
  await other.goto('/#editor');
  await other.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name: 'Edit Outer Isles' }).click();
  await expect(other.getByText(/is editing this board/)).toBeVisible();
  await other.close();
  // Home leaves the editor (and lets the board go).
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Board editor' })).toBeVisible();
});
