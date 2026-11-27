import { describe, expect, it } from 'vitest';
import { TUNING } from '../shared/default-settings';
import {
  addSpectator,
  advanceTime,
  applyAction,
  createGame,
  DEFAULT_SETTINGS,
  emptyBag,
  getView,
  nextDueAt,
  normalizeGame,
} from '../shared/engine';
import { toStep } from '../shared/replay';
import type { GameAction, GameState } from '../shared/types';
import { grant, makeLobby, seeded, sequence, settled, TEST_NOW } from './fixtures';

const act = (g: GameState, id: string, action: GameAction, now = TEST_NOW) => applyAction(g, id, action, seeded(), now);
/** Rolls a 3 and a 4. */
const rollSeven = (g: GameState) => applyAction(g, 'p0', { type: 'roll' }, sequence(0.4, 0.5), TEST_NOW);
const sixWood = { ...emptyBag(), wood: 6 };
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
  it('any other player adds time, as often as they like', () => {
    let g = act(building(), 'p1', { type: 'give-time' });
    expect(g.turnDeadline).toBe(TEST_NOW + 30_000 + given);
    g = act(g, 'p1', { type: 'give-time' });
    expect(g.turnDeadline).toBe(TEST_NOW + 30_000 + 2 * given);
    g = act(g, 'p2', { type: 'give-time' });
    expect(g.turnDeadline).toBe(TEST_NOW + 30_000 + 3 * given);
    expect(g.log.at(-1)!.text).toBe(`Player 2 gave Player 0 ${TUNING.giveTimeSeconds} seconds.`);
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

  it('extends the short clock of those discarding or picking cards, not the held turn', () => {
    const rolled = rollSeven(sevenComing());
    expect(rolled.phase).toBe('discard');
    const helped = act(rolled, 'p2', { type: 'give-time' });
    expect(helped.discardDeadline).toBe(rolled.discardDeadline! + given);
    expect(helped.turnDeadline).toBe(rolled.turnDeadline);
    expect(helped.log.at(-1)!.text).toBe(`Player 2 gave Player 1 ${TUNING.giveTimeSeconds} seconds.`);
    // The mover may help the discarder too; the discarder can't help themselves.
    expect(act(rolled, 'p0', { type: 'give-time' }).discardDeadline).toBe(rolled.discardDeadline! + given);
    expect(() => act(rolled, 'p1', { type: 'give-time' })).toThrow(/give time/);
    const gold = building();
    gold.phase = 'gold';
    gold.pendingGold = { p1: 1, p2: 2 };
    gold.goldDeadline = TEST_NOW + 10_000;
    gold.turnHeldAt = TEST_NOW;
    const goldHelped = act(gold, 'p0', { type: 'give-time' });
    expect(goldHelped.goldDeadline).toBe(TEST_NOW + 10_000 + given);
    expect(goldHelped.log.at(-1)!.text).toBe(`Player 0 gave Player 1 and Player 2 ${TUNING.giveTimeSeconds} seconds.`);
  });

  it('extends Santa’s clock', () => {
    const g = building();
    g.phase = 'santa';
    g.robberDeadline = TEST_NOW + 10_000;
    expect(act(g, 'p1', { type: 'give-time' }).robberDeadline).toBe(TEST_NOW + 10_000 + given);
  });

  it('keeps the active player’s undo', () => {
    const g = building();
    grant(g, 'p0', { wood: 4 });
    const traded = act(g, 'p0', { type: 'trade', give: 'wood', receive: 'ore' });
    expect(act(traded, 'p1', { type: 'give-time' }).undo).not.toBeNull();
  });

  it('older stored rooms drop the once-per-turn list', () => {
    const old = structuredClone(building()) as GameState & { timeGivenBy?: string[] };
    old.timeGivenBy = ['p1'];
    old.schemaVersion = 30;
    const migrated = normalizeGame(old) as GameState & { timeGivenBy?: string[] };
    expect(migrated.timeGivenBy).toBeUndefined();
    expect(migrated.turnHeldAt).toBeNull();
  });
});

/** p0 about to roll a 7 with p1 holding 12 cards, and 30 seconds on p0's clock. */
function sevenComing(): GameState {
  const g = settled();
  g.phase = 'roll';
  g.turnDeadline = TEST_NOW + 30_000;
  grant(g, 'p1', { wood: 6, brick: 6 });
  return g;
}

describe('others choosing never use up the turn clock', () => {
  it('the turn clock holds during discards and starts again with the same time left', () => {
    const rolled = rollSeven(sevenComing());
    expect(rolled.phase).toBe('discard');
    expect(rolled.turnHeldAt).toBe(TEST_NOW);
    expect(rolled.discardDeadline).toBe(TEST_NOW + rolled.settings.decisionSeconds * 1000);
    // Long past the turn clock, but it is held: nothing happens until the discard clock.
    expect(nextDueAt(rolled)).toBe(rolled.discardDeadline);
    expect(advanceTime(rolled, TEST_NOW + 29_000, seeded())).toBe(rolled);
    const later = TEST_NOW + 20_000;
    const done = act(rolled, 'p1', { type: 'discard', resources: sixWood }, later);
    expect(done.phase).toBe('robber');
    expect(done.turnHeldAt).toBeNull();
    expect(done.turnDeadline).toBe(TEST_NOW + 30_000 + 20_000);
  });

  it('a discard nobody makes is made for them when its clock runs out', () => {
    const rolled = rollSeven(sevenComing());
    const next = advanceTime(rolled, rolled.discardDeadline!, seeded());
    expect(next.phase).toBe('robber');
    expect(next.log.some(e => e.text === 'A bot discarded for Player 1.')).toBe(true);
  });

  it('a pause while held is not counted twice', () => {
    const rolled = rollSeven(sevenComing());
    const paused = { ...rolled, pausedAt: TEST_NOW + 5_000 };
    let g = act(paused, 'p0', { type: 'propose', kind: 'resume' }, TEST_NOW + 15_000);
    if (g.pausedAt !== null)
      g = act(g, 'p1', { type: 'vote', proposalId: g.proposal!.id, accept: true }, TEST_NOW + 15_000);
    expect(g.pausedAt).toBeNull();
    const done = act(g, 'p1', { type: 'discard', resources: sixWood }, TEST_NOW + 20_000);
    expect(done.turnDeadline).toBe(TEST_NOW + 30_000 + 20_000);
  });
});

describe('holding the auto-roll', () => {
  it('stops while the roller looks at a card, and restarts with what was left', () => {
    const g = settled();
    g.phase = 'roll';
    g.rollDeadline = TEST_NOW + 6_000;
    const held = act(g, 'p0', { type: 'hold-roll', held: true });
    expect(held.rollDeadline).toBeNull();
    expect(held.rollHeldMs).toBe(6_000);
    expect(advanceTime(held, TEST_NOW + 60_000 - 1, seeded()).phase).toBe('roll');
    const later = TEST_NOW + 40_000;
    const resumed = act(held, 'p0', { type: 'hold-roll', held: false }, later);
    expect(resumed.rollDeadline).toBe(later + 6_000);
    expect(resumed.rollHeldMs).toBeNull();
    expect(() => act(g, 'p1', { type: 'hold-roll', held: true })).toThrow(/turn/);
  });

  it('a hold ends with the roll phase', () => {
    const g = settled();
    g.phase = 'roll';
    g.rollDeadline = TEST_NOW + 6_000;
    const held = act(g, 'p0', { type: 'hold-roll', held: true });
    expect(act(held, 'p0', { type: 'roll' }).rollHeldMs).toBeNull();
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
