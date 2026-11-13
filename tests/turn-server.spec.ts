import { expect, test } from '@playwright/test';
import { join, PlayerConnection } from './server-helpers';

test('durable turn alarms place setup pieces and complete a normal turn without client commands', {
  tag: '@slow',
}, async ({ request }) => {
  test.setTimeout(100_000);
  const h = await join(request, 'Timer host'),
    f = await join(request, 'Timer friend', h.roomId);
  const host = new PlayerConnection(h.roomId),
    friend = new PlayerConnection(h.roomId);
  try {
    await host.authenticate(h);
    await friend.authenticate(f);
    await host.action({ type: 'configure', settings: { autoRollSeconds: 0, trackDice: true, turnSeconds: 15 } });
    await host.action({ type: 'start' });
    // Seats are drawn at random on start: the first seat's setup times out and is placed for it.
    const [first, second] = host.state.players.map(p => p.id) as [string, string];
    const seat = (id: string) => (id === h.playerId ? host : friend);
    await expect.poll(() => host.state.activePlayerId, { timeout: 20_000 }).toBe(second);
    expect(Object.values(host.state.buildings).filter(b => b.playerId === first)).toHaveLength(1);
    expect(Object.values(host.state.roads).filter(id => id === first)).toHaveLength(1);
    await expect.poll(() => seat(second).state.phase).toBe('setup-settlement');
    for (let i = 0; i < 3; i++) {
      const player = seat(i < 2 ? second : first);
      await expect.poll(() => player.state.legal.settlements.length).toBeGreaterThan(0);
      await player.action({ type: 'place-settlement', vertexId: player.state.legal.settlements[0] });
      await player.action({ type: 'place-road', edgeId: player.state.legal.roads[0] });
    }
    expect(host.state.turn).toBe(1);
    expect(host.state.phase).toBe('roll');
    await expect.poll(() => host.state.turn, { timeout: 20_000 }).toBe(2);
    expect(host.state.activePlayerId).toBe(second);
    expect(host.state.phase).toBe('roll');
    expect(Object.values(host.state.diceCounts).reduce((n, x) => n + x, 0)).toBe(1);
    expect(host.state.turnDeadline! - Date.now()).toBeGreaterThan(10_000);
    expect(host.state).not.toHaveProperty('undoHistory');
  } finally {
    host.dispose();
    friend.dispose();
  }
});

test("a move sent after another player's move still counts", async ({ request }) => {
  const h = await join(request, 'Stale host'),
    f = await join(request, 'Stale friend', h.roomId);
  const host = new PlayerConnection(h.roomId),
    friend = new PlayerConnection(h.roomId);
  try {
    await host.authenticate(h);
    await friend.authenticate(f);
    const seen = host.state.version;
    // The friend acts first (as a bot picking gold would), so the host's move carries an old version.
    await friend.action({ type: 'chat', text: 'hello' });
    await host.waitState(seen + 1);
    const { id, after } = host.send(
      { type: 'configure', settings: { autoRollSeconds: 0, trackDice: true, turnSeconds: 15 } },
      seen,
    );
    const reply = await host.waitMessage(
      item => item.type === 'error' || (item.type === 'state' && item.acknowledgedId === id),
      after,
    );
    expect(reply.type === 'error' ? reply.message : 'accepted').toBe('accepted');
    expect(host.state.settings.autoRollSeconds).toBe(0);
  } finally {
    host.dispose();
    friend.dispose();
  }
});
