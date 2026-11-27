import { expect, type Page, test } from '@playwright/test';
import { knightsTable } from './fixtures';
import { expectNoSpill, mountGame } from './ui-harness';

const WIDTHS = [
  [1600, 900],
  [1280, 800],
  [1024, 768],
  [820, 1100],
  [390, 844],
] as const;

/** No two of these controls overlap. */
async function expectApart(page: Page, selector: string) {
  const overlaps = await page.locator(selector).evaluateAll(els => {
    const boxes = els.map(el => ({
      name: el.getAttribute('aria-label') ?? el.textContent,
      r: el.getBoundingClientRect(),
    }));
    const found: string[] = [];
    boxes.forEach((a, i) => {
      for (const b of boxes.slice(i + 1))
        if (
          a.r.left < b.r.right - 1 &&
          b.r.left < a.r.right - 1 &&
          a.r.top < b.r.bottom - 1 &&
          b.r.top < a.r.bottom - 1
        )
          found.push(`${a.name} / ${b.name}`);
    });
    return found;
  });
  expect(overlaps).toEqual([]);
}

async function checkAt(page: Page, selector: string, name: string) {
  for (const [width, height] of WIDTHS) {
    await page.setViewportSize({ width, height });
    const target = page.locator(selector).first();
    await expect(target).toBeVisible();
    await expectNoSpill(target);
    await expectApart(page, '.table-actions .build-compact, .table-actions .turn-action');
    await expect
      .poll(() =>
        target.evaluate(el => {
          const r = el.getBoundingClientRect();
          return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1;
        }),
      )
      .toBe(true);
    await page.screenshot({ path: `test-results/knights-${name}-${width}.png` });
  }
}

test('the Cities & Knights table fits at every width: build bar, hand, scoreboard, and barbarians', {
  tag: '@local',
}, async ({ page }) => {
  const game = await mountGame(page, knightsTable());
  for (const selector of ['.table-actions', '.player-table tbody', '.bank-counts', '.ck-barbarians'])
    await checkAt(page, selector, selector.replace(/\W/g, ''));
  // Progress card names fit their cards.
  const names = await page
    .locator('.cards-progress .cards-card-label')
    .evaluateAll(els =>
      els.filter(el => el.scrollWidth > (el.parentElement?.clientWidth ?? 0) + 1).map(el => el.textContent),
    );
  expect(names).toEqual([]);
  await expect(page.getByRole('button', { name: /^Merchant \(1\), ready to play/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buy development card' })).toHaveCount(0);
  expect(game.errors).toEqual([]);
});

test('city improvements, knights, and a progress card are played from the table', async ({ page }) => {
  const game = await mountGame(page, knightsTable());
  await page.getByRole('button', { name: /City improvements/ }).click();
  await checkAt(page, '[role="dialog"][aria-label="City improvements"]', 'city');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /Raise Politics to level 3/ }).click();
  await expect.poll(() => game.state().ck!.improvements.p0!.politics).toBe(3);

  await page.getByRole('button', { name: 'Place a basic knight beside your road' }).click();
  await page
    .getByRole('button', { name: /^Place a knight at/ })
    .first()
    .click();
  await expect.poll(() => Object.values(game.state().ck!.knights).filter(k => k.playerId === 'p0').length).toBe(3);

  await page
    .getByRole('button', { name: /inactive. Choose what it does/ })
    .first()
    .click();
  await checkAt(page, '[role="dialog"][aria-label="Basic knight"]', 'knight-menu');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^Activate/ }).click();
  await expect.poll(() => Object.values(game.state().ck!.knights).filter(k => k.active).length).toBeGreaterThan(2);

  await page.getByRole('button', { name: /Master Merchant \(1\)/ }).click();
  await checkAt(page, '[role="dialog"][aria-label="Master Merchant"]', 'card');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^Merchant \(1\), ready to play/ }).click();
  await page.getByRole('button', { name: 'Choose on the board' }).click();
  await page
    .getByRole('button', { name: /^Choose a tile for the merchant/ })
    .first()
    .click();
  await expect.poll(() => game.state().ck!.merchant?.playerId).toBe('p0');
  await page.screenshot({ path: 'test-results/knights-board.png' });
  expect(game.errors).toEqual([]);
});

test('the help dialog has the Cities & Knights rules', async ({ page }) => {
  await mountGame(page, knightsTable());
  await page
    .getByRole('button', { name: /help|How to/i })
    .first()
    .click();
  await page.getByRole('tab', { name: 'Knights' }).click();
  await expect(page.getByText('What changes')).toBeVisible();
  await expect(page.getByText(/Defender of Catan point/)).toBeVisible();
});
