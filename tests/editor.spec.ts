import { expect, type Page, test } from '@playwright/test';
import { hexCenter } from '../shared/board';
import { type BoardDesign, type BoardLibrary, BUILTIN_BOARDS } from '../shared/maps';
import { server, signIn } from './server-helpers';
import { expectNoSpill } from './ui-harness';

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
  // A corner closed to starting settlements, a link rule, and gold numbers made richer.
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
  const numbers = page.getByRole('region', { name: 'Random numbers' });
  const island = await cellPoint(page, 0, 1, 0, 32);
  await page.mouse.click(island.x, island.y);
  // Only the gold tile takes a random number here (the linked land has a 12).
  await numbers.getByRole('button', { name: 'Gold richer' }).click();
  await numbers.getByRole('button', { name: 'Gold richer' }).click();
  await expect(numbers.getByRole('group', { name: 'Gold' })).toContainText('Richer');
  await expect(page.locator('.island-leaning')).toHaveText('Richer');
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
  expect(at(0, 1)?.numberLevels).toEqual({ gold: 2 });
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

test('fog takes number levels and its own mix like an island: select it, set them, copy to all fog, and save', async ({
  page,
}) => {
  const headers = await signIn(page);
  const stale = ((await (await page.request.get(`${server}/api/boards`)).json()) as BoardLibrary).boards.filter(
    b => b.name === 'Fog numbers board',
  );
  for (const board of stale) await page.request.delete(`${server}/api/boards/${board.id}`, { headers });
  await page.goto('/');
  await page.getByRole('button', { name: 'Board editor' }).click();
  await page.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name: 'New blank board' }).first().click();
  await page.getByLabel('Board name').fill('Fog numbers board');
  // Two fog patches apart from each other, and a land tile.
  await drag(page, [[0, 0]], 'Shift');
  await page.getByRole('button', { name: /^Brush:/ }).click();
  await page.getByRole('menuitemradio', { name: 'Fog' }).click();
  await drag(
    page,
    [
      [2, 0],
      [3, 0],
    ],
    'Control',
  );
  await drag(page, [[-1, 0]], 'Control');
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  const fog = await cellPoint(page, 2, 0);
  await page.mouse.click(fog.x, fog.y);
  const numbers = page.getByRole('region', { name: 'Random numbers' });
  await expect(numbers.getByText('This fog')).toBeVisible();
  await expect(numbers.getByText('2 fog tiles')).toBeVisible();
  await numbers.getByRole('button', { name: 'Fields richer' }).click();
  await expect(numbers.getByRole('group', { name: 'Fields' })).toContainText('Rich');
  await numbers.getByRole('button', { name: 'Fog', exact: true }).click();
  await expect(numbers.getByRole('button', { name: 'Fog', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.island-leaning')).toHaveCount(2);
  await expectNoSpill(numbers);
  await numbers.screenshot({ path: 'test-results/editor-fog-numbers.png' });
  // Each fog island has its own mix: this one never hides sea, then the other fog island copies it.
  const under = page.getByRole('region', { name: 'Under the fog' });
  await under.getByLabel('Use Sea').uncheck();
  const copy = under.getByRole('button', { name: 'Other fog islands (1)' });
  await expect(copy).toHaveAttribute('aria-pressed', 'false');
  await copy.click();
  await expect(copy).toHaveAttribute('aria-pressed', 'true');
  await expectNoSpill(under);
  await under.screenshot({ path: 'test-results/editor-fog-mix.png' });
  // A share can be cleared and retyped without snapping to 0, and steps by halves.
  const forest = page.getByRole('region', { name: 'Random land mix' }).getByLabel('Forest share').first();
  await forest.selectText();
  await page.keyboard.press('Backspace');
  await expect(forest).toHaveValue('');
  await page.keyboard.type('2.5');
  await page.keyboard.press('ArrowUp');
  await expect(forest).toHaveValue('3');
  await forest.blur();
  await expect(forest).toHaveValue('3');
  // The preview can show what the fog hides, drawn as at the end of a game.
  await page.getByRole('button', { name: 'Preview' }).click();
  const preview = page.getByRole('dialog', { name: 'Preview' });
  await expect(preview.locator('.peeked-fog')).toHaveCount(0);
  await preview.getByRole('button', { name: 'Show fog' }).click();
  await expect(preview.getByRole('button', { name: 'Show fog' })).toHaveAttribute('aria-pressed', 'true');
  await expect(preview.locator('.peeked-fog')).toHaveCount(3);
  await expectNoSpill(preview.locator('.map-preview-actions'));
  await preview.screenshot({ path: 'test-results/editor-fog-preview.png' });
  await preview.getByRole('button', { name: 'Close preview' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  const saved = ((await (await page.request.get(`${server}/api/boards`)).json()) as BoardLibrary).boards.find(
    b => b.name === 'Fog numbers board',
  ) as BoardDesign;
  const fogTiles = saved.tiles.filter(t => t.kind === 'fog');
  expect(fogTiles).toHaveLength(3);
  for (const tile of fogTiles) expect(tile.numberLevels).toEqual({ wheat: 1 });
  for (const tile of fogTiles) expect(tile.fogMix?.pool.sea).toBeUndefined();
  // The map's details say what each fog island holds.
  await page.goto('/');
  await page.getByRole('button', { name: 'Create room' }).click();
  await page.getByRole('radio', { name: 'Choose map' }).click();
  const picker = page.getByRole('dialog', { name: 'Maps' });
  await picker.getByRole('button', { name: 'View Fog numbers board' }).click();
  const summary = picker.getByRole('region', { name: 'Under the fog' });
  await expect(summary).toContainText('A fog island of 2 tiles, each tile drawn at random');
  await expect(summary).toContainText('A fog island of 1 tile');
  await expect(summary).not.toContainText('Sea');
  await expectNoSpill(summary);
  await summary.screenshot({ path: 'test-results/map-fog-summary.png' });
  expect(saved.tiles.find(t => t.kind !== 'fog' && t.kind !== 'sea')?.numberLevels).toBeUndefined();
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
  // The last built-in board sits just above the new category, so both stay on screen while dragging.
  await library.locator('.map-card', { hasText: 'Magnetic North' }).dragTo(fresh);
  await expect(fresh.getByText('Magnetic North')).toBeVisible();
  await expect
    .poll(async () => {
      const lib = (await (await page.request.get(`${server}/api/boards`)).json()) as BoardLibrary;
      return lib.boards.find(b => b.id === 'magnetic-north')?.categoryId;
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
  // Random numbers: All numbers sets every terrain, one terrain is tuned from there, and the
  // levels are copied to every island. Islands off the usual mix get a label that hides under the pointer.
  const numbers = panel.getByRole('region', { name: 'Random numbers' });
  const all = numbers.getByRole('group', { name: 'All numbers' });
  await expect(all).toContainText('Normal');
  await expect(page.locator('.island-leaning')).toHaveCount(0);
  await numbers.getByRole('button', { name: 'All numbers richer' }).click();
  await expect(all).toContainText('Rich');
  await expect(numbers.getByRole('group', { name: 'Mountains' })).toContainText('Rich');
  await expect(page.locator('.island-leaning')).toHaveText('Rich');
  await numbers.getByRole('button', { name: 'Mountains poorer' }).click();
  await numbers.getByRole('button', { name: 'Mountains poorer' }).click();
  await expect(numbers.getByRole('group', { name: 'Mountains' })).toContainText('Poor');
  await expect(all).toContainText('Mixed');
  const label = page.locator('.island-leaning');
  await expect(label).toContainText('Poor');
  await expect(label.locator('svg')).not.toHaveCount(0);
  const copy = numbers.getByRole('button', { name: 'All islands' });
  await copy.click();
  await expect(copy).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.island-leaning').count()).toBeGreaterThan(1);
  await page.screenshot({ path: 'test-results/editor-leanings.png' });
  await page.locator('.island-leaning').first().hover();
  await expect(page.locator('.island-leaning').first()).toHaveCSS('opacity', '0');
  await all.getByRole('button', { name: 'All numbers poorer' }).click();
  await expect(all).toContainText('Normal');
  await all.getByRole('button', { name: 'All numbers poorer' }).click();
  await all.getByRole('button', { name: 'All numbers poorer' }).click();
  await all.getByRole('button', { name: 'All numbers poorer' }).click();
  await expect(all).toContainText('2/3/11/12');
  await expect(all.getByRole('button', { name: 'All numbers poorer' })).toBeDisabled();
  const noEnds = numbers.getByRole('button', { name: 'No 2s or 12s anywhere' });
  await noEnds.click();
  await expect(noEnds).toHaveAttribute('aria-pressed', 'true');
  await expect(all).toContainText('3/11');
  await expectNoSpill(panel);
  await numbers.screenshot({ path: 'test-results/editor-numbers.png' });
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
  // Home leaves the editor (and lets the board go), after confirming the number changes above are dropped.
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Board editor' })).toBeVisible();
});

test('tapping a number on a volcano, an iceberg, or any tile raises it', async ({ page }) => {
  await signIn(page);
  await page.goto('/#editor');
  await page.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name: 'Edit Fire and Ice' }).click();
  const board = BUILTIN_BOARDS.find(b => b.id === 'fire-and-ice')!;
  for (const kind of ['volcano', 'iceberg', 'land'] as const) {
    const tile = board.tiles.find(t => t.kind === kind)!;
    // Number tokens sit just below each tile's center.
    const token = await cellPoint(page, tile.q, tile.r, 0, 8);
    const before = await page.locator('.editor-token').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
    await page.mouse.click(token.x, token.y);
    const after = await page.locator('.editor-token').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
    expect(after, `${kind} number changes on tap`).not.toEqual(before);
  }
});

test('numbers on tiles painted in the editor can be tapped too', async ({ page }) => {
  const headers = await signIn(page);
  const stale = ((await (await page.request.get(`${server}/api/boards`)).json()) as BoardLibrary).boards.filter(
    b => b.name === 'New board',
  );
  for (const board of stale) await page.request.delete(`${server}/api/boards/${board.id}`, { headers });
  await page.goto('/#editor');
  await page.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name: 'New blank board' }).first().click();
  await expect(page.getByLabel('Board name')).toHaveValue('New board');
  await drag(
    page,
    [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    'Shift',
  );
  for (const [i, kind] of (['Volcano', 'Iceberg', 'Gold'] as const).entries()) {
    const center = await cellPoint(page, i, 0, 0, -32);
    await page.mouse.click(center.x, center.y);
    await page
      .getByRole('complementary', { name: 'Settings' })
      .getByRole('button', { name: kind, exact: true })
      .click();
    const token = await cellPoint(page, i, 0, 0, 8);
    const labels = () => page.locator('.editor-token').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
    const before = await labels();
    await page.mouse.click(token.x, token.y);
    await expect.poll(labels, { message: `${kind} number changes on tap` }).not.toEqual(before);
  }
  // The zoom buttons' box stays small, so it never covers tiles along the bottom of the canvas.
  const zoom = (await page.locator('.editor-canvas .zoom-controls').boundingBox())!;
  expect(zoom.width).toBeLessThan(80);
  await page.screenshot({ path: 'test-results/editor-painted-numbers.png' });
});

test('the top bar keeps the name and save on one row (phones: two), and nothing spills sideways', async ({ page }) => {
  await signIn(page);
  await page.goto('/#editor');
  await page.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name: 'Edit Outer Isles' }).click();
  for (const [width, height] of [
    [1600, 900],
    [1280, 800],
    [1024, 768],
    [820, 1000],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    const bar = page.locator('.editor-bar');
    await expect(bar.getByLabel('Board name')).toBeVisible();
    await expectNoSpill(bar);
    const name = (await bar.getByLabel('Board name').boundingBox())!;
    const save = (await bar.getByRole('button', { name: /^Save/ }).boundingBox())!;
    const apart = Math.abs(name.y + name.height / 2 - (save.y + save.height / 2));
    if (width > 600) expect(apart).toBeLessThan(4);
    else expect(save.y).toBeGreaterThan(name.y + name.height - 1);
    await page.screenshot({ path: `test-results/editor-bar-${width}.png`, clip: { x: 0, y: 0, width, height: 260 } });
  }
});

test('the (i) help teaches the editor by topic, and every tab fits', async ({ page }) => {
  await signIn(page);
  await page.goto('/#editor');
  await page.getByRole('dialog', { name: 'Boards' }).getByRole('button', { name: 'Edit Outer Isles' }).click();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: 'How to use the board editor' }).click();
    const help = page.getByRole('dialog', { name: 'Board editor' });
    const tabs = help.getByRole('tab');
    await expect(tabs).toHaveCount(7);
    for (let i = 0; i < 7; i++) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
      await expect(help.locator('.editor-help-row').first()).toBeVisible();
      await expectNoSpill(help);
      await help.screenshot({ path: `test-results/editor-help-${width}-${i}.png` });
    }
    await help.getByRole('button', { name: 'Close dialog' }).click();
  }
});
