import { expect, test } from '@playwright/test';
import { join, PlayerConnection } from './server-helpers';

test('durable turn alarms place setup pieces and complete a normal turn without client commands', async ({
  request,
}) => {
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
    await expect.poll(() => host.state.activePlayerId, { timeout: 20_000 }).toBe(f.playerId);
    expect(Object.values(host.state.buildings).filter(b => b.playerId === h.playerId)).toHaveLength(1);
    expect(Object.values(host.state.roads).filter(id => id === h.playerId)).toHaveLength(1);
    await expect.poll(() => friend.state.phase).toBe('setup-settlement');
    for (let i = 0; i < 3; i++) {
      const player = i < 2 ? friend : host;
      await expect.poll(() => player.state.legal.settlements.length).toBeGreaterThan(0);
      await player.action({ type: 'place-settlement', vertexId: player.state.legal.settlements[0] });
      await player.action({ type: 'place-road', edgeId: player.state.legal.roads[0] });
    }
    expect(host.state.turn).toBe(1);
    expect(host.state.phase).toBe('roll');
    await expect.poll(() => host.state.turn, { timeout: 20_000 }).toBe(2);
    expect(host.state.activePlayerId).toBe(f.playerId);
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
