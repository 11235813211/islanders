import { expect, test } from '@playwright/test';
import { type BoardLibrary, BUILTIN_BOARDS } from '../shared/maps';
import type { Session } from '../shared/types';
import { origin, PlayerConnection, postRoom, registerAccount, server } from './server-helpers';

// The local server runs with DEV_MODE, where every signed-in account may edit boards.
// Tests clean up after themselves because the library persists between runs.

test('anyone reads the board library; signed-in editors save, rearrange, and delete boards', async ({ request }) => {
  const read = async () => (await (await request.get(`${server}/api/boards`)).json()) as BoardLibrary;
  const before = await read();
  expect(before.boards.length).toBeGreaterThan(0);
  expect(before.categories.length).toBeGreaterThan(0);

  const id = `test-${Date.now().toString(36)}`;
  const design = { ...structuredClone(BUILTIN_BOARDS[0]!), id, name: 'Test board' };
  const anonymous = await request.put(`${server}/api/boards/${id}`, { headers: { Origin: origin }, data: design });
  expect(anonymous.status()).toBe(401);

  const headers = await registerAccount(request);
  const mismatch = await request.put(`${server}/api/boards/other`, { headers, data: design });
  expect(mismatch.status()).toBe(400);
  const invalid = await request.put(`${server}/api/boards/${id}`, { headers, data: { ...design, tiles: [] } });
  expect(invalid.status()).toBe(400);
  const saved = await request.put(`${server}/api/boards/${id}`, { headers, data: design });
  expect(saved.status(), await saved.text()).toBe(200);
  expect((await read()).boards.at(-1)?.id).toBe(id);

  // Move it to the front, into another category, and back.
  const library = await read();
  const category = { id: `cat-${id}`, name: 'Testing', color: '#123456' };
  const order = [
    { id, categoryId: category.id },
    ...library.boards.filter(b => b.id !== id).map(b => ({ id: b.id, categoryId: b.categoryId })),
  ];
  const layout = await request.put(`${server}/api/boards`, {
    headers,
    data: { categories: [...library.categories, category], order },
  });
  expect(layout.status(), await layout.text()).toBe(200);
  const moved = await read();
  expect(moved.boards[0]).toMatchObject({ id, categoryId: category.id });
  const restore = await request.put(`${server}/api/boards`, {
    headers,
    data: {
      categories: library.categories,
      order: library.boards.map(b => ({ id: b.id, categoryId: b.categoryId })),
    },
  });
  expect(restore.status(), await restore.text()).toBe(200);

  expect((await request.delete(`${server}/api/boards/${id}`, { headers })).status()).toBe(200);
  expect((await read()).boards.map(b => b.id)).toEqual(before.boards.map(b => b.id));
});

test('one editor at a time: a board held by one account cannot be saved or deleted by another', async ({ request }) => {
  const id = `lock-${Date.now().toString(36)}`;
  const design = { ...structuredClone(BUILTIN_BOARDS[0]!), id, name: 'Lock test' };
  const first = await registerAccount(request);
  const second = await registerAccount(request);
  const lock = (headers: Record<string, string>, method: 'post' | 'delete') =>
    request[method](`${server}/api/boards/${id}/lock`, { headers });
  expect((await lock(first, 'post')).status()).toBe(200);
  // Renewing your own hold is fine; someone else is told who is editing.
  expect((await lock(first, 'post')).status()).toBe(200);
  const blocked = await lock(second, 'post');
  expect(blocked.status()).toBe(409);
  expect(((await blocked.json()) as { error: string }).error).toMatch(/is editing this board/);
  expect((await request.put(`${server}/api/boards/${id}`, { headers: second, data: design })).status()).toBe(409);
  expect((await request.put(`${server}/api/boards/${id}`, { headers: first, data: design })).status()).toBe(200);
  expect((await request.delete(`${server}/api/boards/${id}`, { headers: second })).status()).toBe(409);
  expect((await lock(first, 'delete')).status()).toBe(200);
  expect((await lock(second, 'post')).status()).toBe(200);
  expect((await request.delete(`${server}/api/boards/${id}`, { headers: second })).status()).toBe(200);
});

test('a room plays a library map: choose-map loads the design on the server', async ({ request }) => {
  const created = await postRoom(request, {
    headers: { Origin: 'http://127.0.0.1:5173' },
    data: { name: 'Mapper' },
  });
  const session = (await created.json()) as Session;
  const player = new PlayerConnection(session.roomId);
  await player.authenticate(session);
  const map = BUILTIN_BOARDS[0]!;
  const next = await player.action({ type: 'choose-map', mapId: map.id });
  expect(next.map?.id).toBe(map.id);
  expect(next.seafaring).toBe(true);
  expect(next.settings.victoryPoints).toBe(map.victoryPoints);
  player.dispose();
});
