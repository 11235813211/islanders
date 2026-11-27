import { describe, expect, it } from 'vitest';
import { CHOICE_SECONDS } from '../shared/default-settings';
import {
  advanceTime,
  applyAction,
  BOT_THINK_MS,
  botDueAt,
  emptyBag,
  getActivePlayerId,
  getView,
  UNDO_GRACE_MS,
} from '../shared/engine';
import { choiceMs } from '../shared/rules';
import type { GameAction, GameState } from '../shared/types';
import { grant, inSeatOrder, makeLobby, seeded, settled, TEST_NOW } from './fixtures';

const act = (g: GameState, id: string, action: GameAction, at = TEST_NOW) => applyAction(g, id, action, seeded(), at);

/** `id` asks to undo their latest move and `voter` (one other person) agrees. */
function undoWith(g: GameState, id: string, voter: string): GameState {
  const asked = act(g, id, { type: 'propose', kind: 'undo' });
  expect(asked.proposal).not.toBeNull();
  return act(asked, voter, { type: 'vote', proposalId: asked.proposal!.id, accept: true });
}

describe('undo', () => {
  it('takes back a starting settlement once one other player agrees', () => {
    const start = inSeatOrder(act(makeLobby(3), 'p0', { type: 'start' }));
    const id = getActivePlayerId(start)!;
    const vertexId = getView(start, id).legal.settlements[0]!;
    const placed = act(start, id, { type: 'place-settlement', vertexId });
    expect(placed.phase).toBe('setup-road');
    const other = start.players.find(p => p.id !== id)!.id;
    const undone = undoWith(placed, id, other);
    expect(undone.phase).toBe('setup-settlement');
    expect(undone.buildings[vertexId]).toBeUndefined();
    expect(getActivePlayerId(undone)).toBe(id);
  });

  it('takes back a bank trade', () => {
    const g = settled();
    g.phase = 'build';
    grant(g, 'p0', { wood: 4 });
    const before = { ...g.players[0]!.resources };
    const traded = act(g, 'p0', {
      type: 'bank-trade',
      give: { ...emptyBag(), wood: 4 },
      receive: { ...emptyBag(), ore: 1 },
    });
    expect(traded.players[0]!.resources.ore).toBe(before.ore + 1);
    expect(undoWith(traded, 'p0', 'p2').players[0]!.resources).toEqual(before);
  });

  it('takes back ending your part of the special build early', () => {
    let g = settled(5);
    g.phase = 'build';
    g = act(g, 'p1', { type: 'request-special-build' });
    g = act(g, 'p0', { type: 'end-turn' });
    expect(g.phase).toBe('special-build');
    expect(g.specialBuilder).toBe('p1');
    const ended = act(g, 'p1', { type: 'end-turn' });
    expect(ended.phase).toBe('roll');
    const undone = undoWith(ended, 'p1', 'p3');
    expect(undone.phase).toBe('special-build');
    expect(undone.specialBuilder).toBe('p1');
  });

  it('needs only one other person to agree, even at a big table', () => {
    const g = settled(5);
    g.phase = 'build';
    grant(g, 'p0', { wood: 4 });
    const traded = act(g, 'p0', {
      type: 'bank-trade',
      give: { ...emptyBag(), wood: 4 },
      receive: { ...emptyBag(), ore: 1 },
    });
    const asked = act(traded, 'p0', { type: 'propose', kind: 'undo' });
    expect(asked.proposal?.required).toHaveLength(5);
    const voted = act(asked, 'p4', { type: 'vote', proposalId: asked.proposal!.id, accept: true });
    expect(voted.proposal).toBeNull();
    expect(voted.players[0]!.resources.wood).toBe(g.players[0]!.resources.wood);
  });
});

describe('short-choice clocks', () => {
  it('gives choosing whom to steal from its own clock, and a bot steals when it runs out', () => {
    const g = settled();
    g.phase = 'robber';
    for (const p of g.players) grant(g, p.id, { wood: 2 });
    // A tile with two other players' buildings on it, so moving there asks whom to rob.
    const owners = (hexId: string) =>
      new Set(
        g.board.vertices
          .filter(v => v.hexIds.includes(hexId) && g.buildings[v.id] && g.buildings[v.id]!.playerId !== 'p0')
          .map(v => g.buildings[v.id]!.playerId),
      );
    const hex = g.board.hexes.find(h => h.id !== g.robber && owners(h.id).size >= 2)!;
    const moved = act(g, 'p0', { type: 'move-robber', hexId: hex.id });
    expect(moved.phase).toBe('steal');
    expect(moved.robberDeadline).toBe(TEST_NOW + choiceMs(moved.settings, 'steal'));
    expect(choiceMs(moved.settings, 'steal')).toBe(CHOICE_SECONDS.steal * 1000);
    const late = advanceTime(moved, moved.robberDeadline!, seeded());
    expect(late.phase).not.toBe('steal');
  });

  it('scales every choice with the room’s short-choice time', () => {
    expect(choiceMs({ decisionSeconds: 15 }, 'robber')).toBe(CHOICE_SECONDS.robber * 500);
  });
});

describe('undo after a setup step', () => {
  it('holds the next bot a moment so the person can take back their starting road', () => {
    let g = inSeatOrder(act(makeLobby(2), 'p0', { type: 'start' }));
    g.players[1]!.bot = 'beginner';
    const id = getActivePlayerId(g)!;
    g = act(g, id, { type: 'place-settlement', vertexId: getView(g, id).legal.settlements[0]! });
    g = act(g, id, { type: 'place-road', edgeId: getView(g, id).legal.roads[0]! });
    expect(getActivePlayerId(g)).not.toBe(id);
    expect(botDueAt(g)).toBe(g.updatedAt + BOT_THINK_MS + UNDO_GRACE_MS);
    expect(getView(g, id).undoAvailable?.endsTurn).toBe(true);
  });
});
