import { expect, test } from '@playwright/test';
import { type GameRecord, replayRecord } from '../shared/replay';
import { join, PlayerConnection, registerAccount, server } from './server-helpers';

interface Listed {
  id: string;
  steps: number;
}

test('a game is saved only when every person agreed, and the saved game replays', async ({ request }) => {
  test.setTimeout(120_000);
  const exporter = await registerAccount(request);
  const listed = async () =>
    (await (await request.get(`${server}/api/records`, { headers: exporter })).json()) as Listed[];
  const before = (await listed()).length;
  expect((await request.get(`${server}/api/records`)).status()).toBe(401);

  const hostSession = await join(request, 'Host Person');
  const guestSession = await join(request, 'Guest Person', hostSession.roomId);
  const host = new PlayerConnection(hostSession.roomId);
  const guest = new PlayerConnection(hostSession.roomId);
  try {
    await host.authenticate(hostSession);
    await guest.authenticate(guestSession);
    const status = (connection: PlayerConnection) => {
      const message = [...connection.messages].reverse().find(item => item.type === 'state');
      return message?.type === 'state' ? message.recording : undefined;
    };
    expect(status(host)).toEqual({ mine: false, on: false });

    host.socket.send(JSON.stringify({ type: 'consent', value: true }));
    await expect.poll(() => status(host)).toEqual({ mine: true, on: false });
    guest.socket.send(JSON.stringify({ type: 'consent', value: true }));
    await expect.poll(() => status(host)).toEqual({ mine: true, on: true });
    // Taking it back turns the note off again.
    guest.socket.send(JSON.stringify({ type: 'consent', value: false }));
    await expect.poll(() => status(host)).toEqual({ mine: true, on: false });
    guest.socket.send(JSON.stringify({ type: 'consent', value: true }));
    await expect.poll(() => status(host)).toEqual({ mine: true, on: true });

    // The shortest game: 3 points are reached right after setup.
    await host.action({
      type: 'configure',
      settings: { ...host.state.settings, victoryPoints: 3, autoRollSeconds: 0 },
    });
    // A bot wins quickly; the two people just pass their turns.
    await host.action({ type: 'add-bot', level: 'advanced' });
    host.autoPlay();
    guest.autoPlay();
    await host.action({ type: 'start' });
    await expect.poll(() => host.state.phase, { timeout: 100_000 }).toBe('finished');

    await expect.poll(async () => (await listed()).length, { timeout: 15_000 }).toBe(before + 1);
    const latest = (await listed()).at(-1)!;
    const response = await request.get(`${server}/api/records/${latest.id}`, { headers: exporter });
    const text = await response.text();
    expect(text).not.toContain('Host Person');
    expect(text).not.toContain('Guest Person');
    const record = JSON.parse(text) as GameRecord;
    const end = replayRecord(record);
    expect(end.phase).toBe('finished');
    expect(end.version).toBe(record.finalVersion);

    // An exporter can delete it; then it's gone from the list and can't be fetched.
    expect([401, 403]).toContain((await request.delete(`${server}/api/records/${latest.id}`)).status());
    expect((await request.delete(`${server}/api/records/${latest.id}`, { headers: exporter })).status()).toBe(200);
    expect((await listed()).some(item => item.id === latest.id)).toBe(false);
    expect((await request.get(`${server}/api/records/${latest.id}`, { headers: exporter })).status()).toBe(404);
    expect((await request.delete(`${server}/api/records/${latest.id}`, { headers: exporter })).status()).toBe(404);
  } finally {
    host.dispose();
    guest.dispose();
  }
});

test('a game is not saved when someone did not agree', async ({ request }) => {
  test.setTimeout(120_000);
  const exporter = await registerAccount(request);
  const count = async () =>
    ((await (await request.get(`${server}/api/records`, { headers: exporter })).json()) as Listed[]).length;
  const before = await count();
  const hostSession = await join(request, 'Host');
  const guestSession = await join(request, 'Guest', hostSession.roomId);
  const host = new PlayerConnection(hostSession.roomId);
  const guest = new PlayerConnection(hostSession.roomId);
  try {
    await host.authenticate(hostSession);
    await guest.authenticate(guestSession);
    host.socket.send(JSON.stringify({ type: 'consent', value: true }));
    await host.action({
      type: 'configure',
      settings: { ...host.state.settings, victoryPoints: 3, autoRollSeconds: 0 },
    });
    // A bot wins quickly; the two people just pass their turns.
    await host.action({ type: 'add-bot', level: 'advanced' });
    host.autoPlay();
    guest.autoPlay();
    await host.action({ type: 'start' });
    await expect.poll(() => host.state.phase, { timeout: 100_000 }).toBe('finished');
    await new Promise(resolve => setTimeout(resolve, 1500));
    expect(await count()).toBe(before);
  } finally {
    host.dispose();
    guest.dispose();
  }
});
