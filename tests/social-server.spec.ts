import { expect, test } from '@playwright/test';
import type { Session } from '../shared/types';
import { join, origin, PlayerConnection, server } from './server-helpers';

test('private spectators join a started room, see no hands, chat, and cannot build or control seats', async ({
  request,
}) => {
  const host = await join(request, 'Host');
  await join(request, 'Friend', host.roomId);
  const player = new PlayerConnection(host.roomId);
  let watcher: PlayerConnection | undefined;
  try {
    await player.authenticate(host);
    await player.action({ type: 'start' });
    const response = await request.post(`${server}/api/rooms/${host.roomId}/join`, {
      headers: { Origin: origin },
      data: { name: 'Watcher', spectate: true },
    });
    expect(response.status()).toBe(201);
    const session = (await response.json()) as Session;
    watcher = new PlayerConnection(host.roomId);
    await watcher.authenticate(session);
    expect(watcher.state.role).toBe('spectator');
    expect(watcher.state.players).toHaveLength(2);
    expect(Object.values(watcher.state.hand).every(n => n === 0)).toBe(true);
    expect(watcher.state.development).toEqual([]);
    expect(watcher.state.legal.settlements).toEqual([]);
    expect(watcher.state).not.toHaveProperty('developmentDeck');
    expect(watcher.state).not.toHaveProperty('undo');
    const message = 'Hello from the spectator seats';
    await watcher.action({ type: 'chat', text: message });
    await expect.poll(() => player.state.chat.at(-1)?.text).toBe(message);
    const rejected = watcher.send({ type: 'start' });
    expect((await watcher.waitMessage(m => m.type === 'error' && m.id === rejected.id, rejected.after)).type).toBe(
      'error',
    );
    const after = watcher.messages.length;
    watcher.socket.send(JSON.stringify({ type: 'view-as', playerId: host.playerId }));
    const denied = await watcher.waitMessage(m => m.type === 'error', after);
    expect(denied.type).toBe('error');
    const unknown = await request.post(`${server}/api/rooms/UNLISTED99/join`, {
      headers: { Origin: origin },
      data: { name: 'Watcher', spectate: true },
    });
    expect(unknown.status()).toBe(404);
    expect((await request.get(`${server}/api/rooms`, { headers: { Origin: origin } })).status()).toBe(404);
  } finally {
    player.dispose();
    watcher?.dispose();
  }
});

test('pause excludes disconnected seats, blocks moves, and undo votes restore a setup move', async ({ request }) => {
  const h = await join(request, 'Host');
  const f = await join(request, 'Friend', h.roomId);
  await join(request, 'Away', h.roomId);
  const host = new PlayerConnection(h.roomId),
    friend = new PlayerConnection(h.roomId);
  try {
    await host.authenticate(h);
    await friend.authenticate(f);
    await host.action({
      type: 'configure',
      settings: { autoRollSeconds: 0, trackDice: true, numberLayout: 'ordered', turnSeconds: 30 },
    });
    await host.action({ type: 'start' });
    await host.action({ type: 'propose', kind: 'pause' });
    await expect.poll(() => friend.state.proposal?.required.length).toBe(2);
    await friend.action({ type: 'vote', proposalId: friend.state.proposal!.id, accept: true });
    await expect.poll(() => host.state.pausedAt).not.toBeNull();
    const rejected = host.send({ type: 'place-settlement', vertexId: 'v1' });
    const error = await host.waitMessage(m => m.type === 'error' && m.id === rejected.id, rejected.after);
    expect(error.type === 'error' && error.message).toMatch(/paused/);
    await friend.action({ type: 'propose', kind: 'resume' });
    await expect.poll(() => host.state.proposal?.kind).toBe('resume');
    await host.action({ type: 'vote', proposalId: host.state.proposal!.id, accept: true });
    expect(host.state.pausedAt).toBeNull();
    await host.action({ type: 'place-settlement', vertexId: host.state.legal.settlements[0] });
    await host.action({ type: 'propose', kind: 'undo' });
    expect(host.state.proposal!.required).toHaveLength(3); // Undo still requires every player.
    await expect.poll(() => friend.state.proposal?.kind).toBe('undo');
    await friend.action({ type: 'vote', proposalId: friend.state.proposal!.id, accept: false });
    await expect.poll(() => host.state.proposal?.rejected).toEqual([f.playerId]);
    await host.action({ type: 'propose', kind: 'undo' });
    expect(host.state.proposal?.accepted).toEqual([h.playerId]);
    expect(host.state.phase).toBe('setup-road');
  } finally {
    host.dispose();
    friend.dispose();
  }
});
