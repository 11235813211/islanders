import { expect, test } from '@playwright/test';
import { GUEST_NAMES } from '../shared/guest-names';
import { join, origin, PlayerConnection, registerAccount, server } from './server-helpers';

test('players leave, get removed, hand over hosting, and the room closes when the last person leaves', async ({
  page,
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
    const guestName = host.state.players.find(p => p.id === guestSession.playerId)!.name;
    expect(GUEST_NAMES).toContain(guestName);
    // On another device, typing the same name (any case) takes the seat back instead of adding one.
    const again = await request.post(`${server}/api/rooms/${hostSession.roomId}/join`, {
      headers: { Origin: origin },
      data: { name: guestName.toUpperCase() },
    });
    expect(again.status()).toBe(200);
    expect((await again.json()).playerId).toBe(guestSession.playerId);

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

    // A socket to the gone room is told why instead of failing like a dropped connection.
    const stale = new PlayerConnection(hostSession.roomId);
    await expect.poll(() => stale.closeCode).toBe(4404);
    stale.dispose();
    // Refreshing a page that still has the seat saved goes home and says the room is gone.
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [`islanders:${guestSession.roomId}`, JSON.stringify(guestSession)],
    );
    await page.goto(`${origin}/#room=${guestSession.roomId}`);
    await expect(page.getByRole('status')).toHaveText('This room no longer exists.');
    await expect.poll(() => new URL(page.url()).hash).toBe('');
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
    await host.action({ type: 'add-bot', level: 'advanced' });
    await host.action({ type: 'start' });
    // Either seat may be drawn first; the host places whenever it is their turn and the bot does the rest.
    for (let placed = 0; placed < 2; placed++) {
      await expect.poll(() => host.state.activePlayerId, { timeout: 15_000 }).toBe(hostSession.playerId);
      const view = await host.action({ type: 'place-settlement', vertexId: host.state.legal.settlements[0]! });
      await host.action({ type: 'place-road', edgeId: view.legal.roads[0]! });
    }
    await expect.poll(() => Object.keys(host.state.buildings).length, { timeout: 15_000 }).toBe(4);
    await expect.poll(() => host.state.phase.startsWith('setup')).toBe(false);
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

test('hosting passes to a connected player once the host has been away a while', { tag: '@slow' }, async ({
  request,
}) => {
  const hostSession = await join(request, 'Host');
  const guestSession = await join(request, 'Guest', hostSession.roomId);
  const host = new PlayerConnection(hostSession.roomId);
  const guest = new PlayerConnection(hostSession.roomId);
  try {
    await host.authenticate(hostSession);
    await guest.authenticate(guestSession);
    host.dispose();
    // Not at once (a reload is back sooner), but within the 20 s grace and an alarm.
    await new Promise(resolve => setTimeout(resolve, 5000));
    expect(guest.state.hostId).toBe(hostSession.playerId);
    await expect.poll(() => guest.state.hostId, { timeout: 30_000, intervals: [1000] }).toBe(guestSession.playerId);
  } finally {
    host.dispose();
    guest.dispose();
  }
});

test('typing a signed-in person’s name never takes their seat', async ({ request }) => {
  const hostSession = await join(request, 'Host');
  const host = new PlayerConnection(hostSession.roomId);
  try {
    await host.authenticate(hostSession);
    const signedIn = await request.post(`${server}/api/rooms/${hostSession.roomId}/join`, {
      headers: await registerAccount(request),
      data: {},
    });
    const member = (await signedIn.json()) as { playerId: string };
    await expect.poll(() => host.state.players.some(p => p.id === member.playerId)).toBe(true);
    const name = host.state.players.find(p => p.id === member.playerId)!.name;
    const copy = await request.post(`${server}/api/rooms/${hostSession.roomId}/join`, {
      headers: { Origin: origin },
      data: { name },
    });
    expect(copy.status()).toBe(201);
    expect((await copy.json()).playerId).not.toBe(member.playerId);
  } finally {
    host.dispose();
  }
});

test('an admin host gives the room its own code once; joining with it reaches the same room', async ({ request }) => {
  // Local dev counts everyone as an admin (DEV_MODE), so a guest host may set it here.
  const code = `T${crypto.randomUUID().replace(/-/g, '').slice(0, 9).toUpperCase()}`;
  const hostSession = await join(request, 'Host');
  const guestSession = await join(request, 'Guest', hostSession.roomId);
  const otherSession = await join(request, 'Other');
  const host = new PlayerConnection(hostSession.roomId);
  const guest = new PlayerConnection(hostSession.roomId);
  const other = new PlayerConnection(otherSession.roomId);
  const setCode = (player: PlayerConnection, value: string) => {
    const after = player.messages.length;
    player.socket.send(JSON.stringify({ type: 'set-code', code: value }));
    return after;
  };
  const errorAfter = async (player: PlayerConnection, after: number) => {
    const message = await player.waitMessage(m => m.type === 'error', after);
    return message.type === 'error' ? message.message : '';
  };
  try {
    await host.authenticate(hostSession);
    await guest.authenticate(guestSession);
    await other.authenticate(otherSession);
    expect(await errorAfter(guest, setCode(guest, code))).toContain('Only an admin host');

    setCode(host, code);
    await expect.poll(() => host.state.inviteCode).toBe(code);
    await expect.poll(() => guest.state.inviteCode).toBe(code);
    // The room keeps its first code as its address; the new one leads there.
    const joined = await join(request, 'Friend', code);
    expect(joined.roomId).toBe(hostSession.roomId);
    await expect.poll(() => host.state.players.map(p => p.name)).toContain('Friend');

    expect(await errorAfter(host, setCode(host, `${code.slice(0, -1)}Z`))).toContain('already has its own code');
    expect(await errorAfter(other, setCode(other, code))).toContain('taken');
  } finally {
    host.dispose();
    guest.dispose();
    other.dispose();
  }
});
