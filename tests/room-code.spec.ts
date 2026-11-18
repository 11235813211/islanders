import { type Browser, expect, type Page, test } from '@playwright/test';

/** A fresh custom code, so runs never collide on the shared local server. */
const freshCode = () => `T${crypto.randomUUID().replace(/-/g, '').slice(0, 9).toUpperCase()}`;

/** A person in their own browser profile, on the home screen. */
async function visitor(browser: Browser, path = '/'): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(path);
  return page;
}

/** Create a room as host and give it `code`; returns the room's first code. */
async function hostWithCode(browser: Browser, code: string) {
  const page = await visitor(browser);
  await page.getByRole('button', { name: 'Create room' }).click();
  const box = page.locator('.room-code-box');
  const first = (await box.locator('strong').textContent())!;
  page.on('dialog', dialog => dialog.accept());
  await box.getByRole('button', { name: 'Set your own room code' }).click();
  await box.getByRole('textbox', { name: 'New room code' }).fill(code);
  await box.getByRole('button', { name: 'Set' }).click();
  await expect(box.locator('strong')).toHaveText(code);
  return { page, first };
}

/** Type a code into the home screen's join box. */
async function joinByTyping(page: Page, code: string) {
  await page.getByRole('textbox', { name: 'Room code or invite link' }).fill(code);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
}

const inRoom = (page: Page, code: string) => expect(page.locator('.page-heading h1')).toHaveText(code);

test('typing the old code after a code change puts the person in the room', async ({ browser }) => {
  const code = freshCode();
  const { page: host, first } = await hostWithCode(browser, code);
  const guest = await visitor(browser);
  await joinByTyping(guest, first);
  await inRoom(guest, code);
  await expect(guest.locator('.setup-players .subtle-badge')).toHaveText('2 / 6');
  await expect(host.locator('.setup-players .subtle-badge')).toHaveText('2 / 6');
});

test('the address follows a new code, and old links and the new code all reach the same room', async ({ browser }) => {
  const code = freshCode();
  const { page: host, first } = await hostWithCode(browser, code);
  await expect(host).toHaveURL(new RegExp(`#room=${code}$`));

  // An old link redirects, for someone new and for someone already seated.
  const linked = await visitor(browser, `/#room=${first}`);
  await inRoom(linked, code);
  await expect(linked).toHaveURL(new RegExp(`#room=${code}$`));
  await expect(host.locator('.setup-players .subtle-badge')).toHaveText('2 / 6');
  const again = await linked.context().newPage();
  await again.goto(`/#room=${first}`);
  await inRoom(again, code);
  await expect(again).toHaveURL(new RegExp(`#room=${code}$`));

  // Reloading on the new address keeps the seat instead of taking another.
  await linked.reload();
  await inRoom(linked, code);
  await expect(host.locator('.setup-players .subtle-badge')).toHaveText('2 / 6');

  const typed = await visitor(browser);
  await joinByTyping(typed, code);
  await inRoom(typed, code);
  await expect(typed).toHaveURL(new RegExp(`#room=${code}$`));
  await expect(host.locator('.setup-players .subtle-badge')).toHaveText('3 / 6');
});

test('someone in the room when the code changes moves to the new address', async ({ browser }) => {
  const host = await visitor(browser);
  await host.getByRole('button', { name: 'Create room' }).click();
  const box = host.locator('.room-code-box');
  const first = (await box.locator('strong').textContent())!;
  const guest = await visitor(browser, `/#room=${first}`);
  await inRoom(guest, first);

  const code = freshCode();
  host.on('dialog', dialog => dialog.accept());
  await box.getByRole('button', { name: 'Set your own room code' }).click();
  await box.getByRole('textbox', { name: 'New room code' }).fill(code);
  await box.getByRole('button', { name: 'Set' }).click();
  await inRoom(guest, code);
  await expect(guest).toHaveURL(new RegExp(`#room=${code}$`));
});

test('the host’s player count for maps reaches everyone, and only the host gets the control', async ({ browser }) => {
  const host = await visitor(browser);
  await host.getByRole('button', { name: 'Create room' }).click();
  const code = (await host.locator('.room-code-box strong').textContent())!;
  const guest = await visitor(browser, `/#room=${code}`);
  await inRoom(guest, code);
  await host.getByRole('button', { name: 'More players for maps' }).click();
  await expect(host.locator('.board-players output')).toHaveText('3');
  await host.getByRole('button', { name: 'More players for maps' }).click();
  await expect(host.locator('.board-players output')).toHaveText('4');
  await expect(guest.locator('.board-players')).toHaveCount(0);
  await guest.getByRole('button', { name: 'Propose map' }).click();
  await expect(guest.getByRole('radio', { name: 'Maps for 4 players' })).toHaveAttribute('aria-checked', 'true');
});
