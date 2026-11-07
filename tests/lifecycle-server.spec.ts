import { expect, test } from '@playwright/test';
import { GUEST_NAMES } from '../shared/guest-names';
import { join, origin, PlayerConnection, server } from './server-helpers';

test('players leave, get removed, hand over hosting, and the room closes when the last person leaves', async ({
  request,
}) => {
  const hostSession = await join(request, 'Host');
  const guestSession = await join(request, '', hostSession.roomId);
  const host = new PlayerConnection(hostSession.roomId);
  const guest = new PlayerConnection(hostSession.roomId);
  try {
    await host.authenticate(hostSession);
    await guest.authenticate(guestSession);
    // A blank name gets a guest name from shared/guest-names.ts.
    expect(GUEST_NAMES).toContain(host.state.players.find(p => p.id === guestSession.playerId)!.name);

    let view = await host.action({ type: 'add-bot', level: 'intermediate' });
    const bot = view.players.find(p => p.bot)!;
    expect(bot.bot).toBe('intermediate');
    view = await host.action({ type: 'set-bot-level', playerId: bot.id, level: 'advanced' });
    expect(view.players.find(p => p.id === bot.id)!.bot).toBe('advanced');
    view = await host.action({ type: 'remove-player', playerId: bot.id });
    expect(view.players).toHaveLength(2);

    await host.action({ type: 'transfer-host', playerId: guestSession.playerId });
    await guest.waitState(host.state.version);
    expect(guest.state.hostId).toBe(guestSession.playerId);

    // The old host leaves: their socket closes and the guest keeps the room.
    host.send({ type: 'leave' });
    await expect.poll(() => host.closeCode).toBe(4000);
    await expect.poll(() => guest.state.players.map(p => p.id)).toEqual([guestSession.playerId]);

    // The last person leaving deletes the room.
    guest.send({ type: 'leave' });
    await expect.poll(() => guest.closeCode).toBe(4000);
    const late = await request.post(`${server}/api/rooms/${hostSession.roomId}/join`, {
      headers: { Origin: origin },
      data: { name: 'Late' },
    });
    expect(late.status()).toBe(404);
  } finally {
    host.dispose();
    guest.dispose();
  }
});

test('a bot seat takes its own setup turns on the server', async ({ request }) => {
  const hostSession = await join(request, 'Host');
  const host = new PlayerConnection(hostSession.roomId);
  try {
    await host.authenticate(hostSession);
    await host.action({ type: 'add-bot', level: 'beginner' });
    let view = await host.action({ type: 'start' });
    // Snake order: host, bot, bot, host.
    view = await host.action({ type: 'place-settlement', vertexId: view.legal.settlements[0]! });
    view = await host.action({ type: 'place-road', edgeId: view.legal.roads[0]! });
    await expect
      .poll(() => (host.state.activePlayerId === hostSession.playerId ? Object.keys(host.state.buildings).length : 0), {
        timeout: 15_000,
      })
      .toBe(3);
    expect(host.state.phase).toBe('setup-settlement');
  } finally {
    host.dispose();
  }
});

test('accounts get a recovery code, can reset the password with it, and can be deleted', async ({ request }) => {
  const username = `rec_${Date.now().toString(36)}`;
  const password = 'Testing-only-password-492!';
  const post = (path: string, data: unknown, token?: string) =>
    request.post(`${server}/api/accounts/${path}`, {
      headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${username}:${token}` } : {}) },
      data,
    });
  const signup = await post('register', { username, password });
  expect(signup.status()).toBe(201);
  const created = (await signup.json()) as { token: string; recoveryCode: string };
  expect(created.recoveryCode).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);

  expect(
    (await post('recover', { username, code: 'AAAAA-AAAAA-AAAAA-AAAAA', password: 'New-password-123456' })).status(),
  ).toBe(401);
  const recovered = await post('recover', {
    username,
    code: created.recoveryCode.toLowerCase().replaceAll('-', ' '),
    password: 'New-password-123456',
  });
  expect(recovered.status()).toBe(200);
  const fresh = (await recovered.json()) as { token: string; recoveryCode: string };
  expect(fresh.recoveryCode).not.toBe(created.recoveryCode);
  // Resetting signs out every device and the old code stops working.
  const oldMe = await request.get(`${server}/api/accounts/me`, {
    headers: { Authorization: `Bearer ${username}:${created.token}` },
  });
  expect(oldMe.status()).toBe(401);
  expect((await post('recover', { username, code: created.recoveryCode, password })).status()).toBe(401);

  const replaced = await post('recovery-code', { password: 'New-password-123456' }, fresh.token);
  expect(replaced.status()).toBe(200);
  expect((await post('delete', { password: 'wrong-password-1234' }, fresh.token)).status()).toBe(401);
  expect((await post('delete', { password: 'New-password-123456' }, fresh.token)).status()).toBe(200);
  expect((await post('login', { username, password: 'New-password-123456' })).status()).toBe(401);
});

test('client error reports are accepted', async ({ request }) => {
  const report = await request.post(`${server}/api/client-errors`, {
    headers: { Origin: origin },
    data: { message: 'Test error from the browser suite', page: '/' },
  });
  expect(report.status()).toBe(204);
});
