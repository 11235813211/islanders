import { describe, expect, it } from 'vitest';
import { TUNING } from '../shared/default-settings';
import { addSpectator, applyAction, createGame, DEFAULT_SETTINGS, getView, normalizeGame } from '../shared/engine';
import { toStep } from '../shared/replay';
import type { GameAction, GameState } from '../shared/types';
import { grant, makeLobby, seeded, settled, TEST_NOW } from './fixtures';

const act = (g: GameState, id: string, action: GameAction, now = TEST_NOW) => applyAction(g, id, action, seeded(), now);
const bonus = TUNING.actionBonusSeconds * 1000;
const given = TUNING.giveTimeSeconds * 1000;

/** p0's build phase with 30 seconds left. */
function building(): GameState {
  const g = settled();
  g.phase = 'build';
  g.rollDeadline = null;
  g.turnDeadline = TEST_NOW + 30_000;
  return g;
}

describe('time for placing roads', () => {
  it('a setup settlement adds time for the road that follows', () => {
    const start = act(makeLobby(), 'p0', { type: 'start' });
    const first = start.setupOrder[0]!;
    const vertexId = getView(start, first).legal.settlements[0]!;
    const later = TEST_NOW + 60_000;
    const placed = act(start, first, { type: 'place-settlement', vertexId }, later);
    expect(placed.phase).toBe('setup-road');
    expect(placed.turnDeadline).toBe(start.turnDeadline! + bonus);
  });

  it('each road from Road Building adds time', () => {
    const g = building();
    g.phase = 'free-roads';
    g.freeRoads = 2;
    const edgeId = getView(g, 'p0').legal.roads[0]!;
    expect(act(g, 'p0', { type: 'build-road', edgeId }).turnDeadline).toBe(TEST_NOW + 30_000 + bonus);
  });

  it('a build bonus never shortens a clock that was given extra time', () => {
    const g = building();
    grant(g, 'p0', { wood: 4 });
    g.turnDeadline = TEST_NOW + g.settings.turnSeconds * 1000 + 15_000;
    expect(act(g, 'p0', { type: 'trade', give: 'wood', receive: 'ore' }).turnDeadline).toBe(g.turnDeadline);
  });
});

describe('giving time', () => {
  it('any other player adds time once per turn, and the next turn starts fresh', () => {
    let g = act(building(), 'p1', { type: 'give-time' });
    expect(g.turnDeadline).toBe(TEST_NOW + 30_000 + given);
    expect(() => act(g, 'p1', { type: 'give-time' })).toThrow(/give time/);
    g = act(g, 'p2', { type: 'give-time' });
    expect(g.turnDeadline).toBe(TEST_NOW + 30_000 + 2 * given);
    expect(g.log.at(-1)!.text).toBe(`Player 2 gave Player 0 ${TUNING.giveTimeSeconds} seconds.`);
    expect(act(g, 'p0', { type: 'end-turn' }).timeGivenBy).toEqual([]);
  });

  it('works during setup and extends the robber clock', () => {
    const start = act(makeLobby(), 'p0', { type: 'start' });
    const other = start.players.find(p => p.id !== start.setupOrder[0])!.id;
    expect(act(start, other, { type: 'give-time' }).turnDeadline).toBe(start.turnDeadline! + given);
    const g = building();
    g.phase = 'robber';
    g.robberDeadline = TEST_NOW + 10_000;
    expect(act(g, 'p1', { type: 'give-time' }).robberDeadline).toBe(TEST_NOW + 10_000 + given);
  });

  it('is refused for yourself, for a bot, while paused, and on a roll', () => {
    const g = building();
    expect(() => act(g, 'p0', { type: 'give-time' })).toThrow(/give time/);
    expect(() => act({ ...g, pausedAt: TEST_NOW }, 'p1', { type: 'give-time' })).toThrow(/paused/);
    expect(() => act({ ...g, phase: 'roll' }, 'p1', { type: 'give-time' })).toThrow(/give time/);
    const bot = structuredClone(g);
    bot.players[0]!.bot = 'beginner';
    expect(() => act(bot, 'p1', { type: 'give-time' })).toThrow(/give time/);
  });

  it('keeps the active player’s undo', () => {
    const g = building();
    grant(g, 'p0', { wood: 4 });
    const traded = act(g, 'p0', { type: 'trade', give: 'wood', receive: 'ore' });
    expect(act(traded, 'p1', { type: 'give-time' }).undo).not.toBeNull();
  });

  it('older stored rooms get the new field', () => {
    const old = structuredClone(building()) as Partial<GameState>;
    delete old.timeGivenBy;
    old.schemaVersion = 25;
    expect(normalizeGame(old as GameState).timeGivenBy).toEqual([]);
  });
});

describe('short choices', () => {
  it('new rooms give 30 seconds for the robber', () => {
    expect(DEFAULT_SETTINGS.decisionSeconds).toBe(30);
    expect(createGame('HARBOR42', seeded()).settings.decisionSeconds).toBe(30);
  });
});

describe('changing your name', () => {
  it('works for players and spectators, mid-game and while paused', () => {
    let g = addSpectator(building(), { id: 'w', name: 'Watcher' });
    g = act(g, 'p1', { type: 'set-name', name: '  New   Name ' });
    expect(g.players[1]!.name).toBe('New Name');
    g = act({ ...g, pausedAt: TEST_NOW }, 'w', { type: 'set-name', name: 'Viewer' });
    expect(g.spectators[0]!.name).toBe('Viewer');
  });

  it('refuses a name someone else has, the same name, and markup', () => {
    const g = building();
    expect(() => act(g, 'p1', { type: 'set-name', name: 'player 2' })).toThrow(/already has/);
    expect(() => act(g, 'p1', { type: 'set-name', name: 'Player 1' })).toThrow(/already your name/);
    expect(() => act(g, 'p1', { type: 'set-name', name: '<b>' })).toThrow(/1–24/);
    expect(act(g, 'p1', { type: 'set-name', name: 'PLAYER 1' }).players[1]!.name).toBe('PLAYER 1');
  });

  it('an undo keeps the new name', () => {
    const g = building();
    g.players = g.players.slice(0, 2);
    grant(g, 'p0', { wood: 4 });
    let next = act(g, 'p0', { type: 'trade', give: 'wood', receive: 'ore' });
    next = act(next, 'p1', { type: 'set-name', name: 'Renamed' });
    next = act(next, 'p0', { type: 'propose', kind: 'undo' });
    next = act(next, 'p1', { type: 'vote', proposalId: next.proposal!.id, accept: true });
    expect(next.players[0]!.resources.wood).toBe(g.players[0]!.resources.wood);
    expect(next.players[1]!.name).toBe('Renamed');
  });

  it('saved game records never hold the chosen name', () => {
    const step = {
      kind: 'action' as const,
      actor: 'p1',
      action: { type: 'set-name' as const, name: 'Real Person' },
      now: TEST_NOW,
      random: [],
    };
    const stored = toStep({ p1: 's1' }, step)!;
    expect(JSON.stringify(stored)).not.toContain('Real Person');
    expect(act(building(), 'p1', stored.action!).players[1]!.name).toBe(`s1 ${TEST_NOW}`);
  });
});
