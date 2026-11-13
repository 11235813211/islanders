import { describe, expect, it } from 'vitest';
import { chooseBotAction } from '../shared/bots';
import { choiceFits, choiceGroups, choiceLimit } from '../shared/choices';
import { advanceTime, createGame, getView, normalizeGame } from '../shared/engine';
import { hexNumbers } from '../shared/rules';
import type { GameState, Resource, ResourceBag } from '../shared/types';
import { act, cartographersGame, conserved, grant, hexOf, openSeaEdges, seeded, sequence, TEST_NOW } from './fixtures';

const bag = (cards: Partial<ResourceBag>): ResourceBag => ({
  wood: 0,
  brick: 0,
  sheep: 0,
  wheat: 0,
  ore: 0,
  lodestone: 0,
  ...cards,
});
const plenty = { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19, lodestone: 19 };
/** p0 rolls this total with random dice (each die is floor(v * 6) + 1). */
function roll(g: GameState, a: number, b: number): GameState {
  return act({ ...g, phase: 'roll' }, 'p0', { type: 'roll' }, sequence((a - 1) / 6 + 0.01, (b - 1) / 6 + 0.01));
}

describe('choices from gold and split tiles', () => {
  it('a split pick fits only its two resources; free picks fit anything', () => {
    const groups = choiceGroups(3, [{ options: ['wheat', 'ore'], count: 2 }]);
    expect(choiceFits(bag({ wheat: 1, ore: 1, wood: 1 }), groups)).toBe(true);
    expect(choiceFits(bag({ wheat: 2, wood: 1 }), groups)).toBe(true);
    expect(choiceFits(bag({ wood: 2, wheat: 1 }), groups)).toBe(false);
  });

  it('the most that can be taken counts what the bank holds of each half', () => {
    const groups = choiceGroups(3, [{ options: ['wheat', 'ore'], count: 3 }]);
    expect(choiceLimit(groups, plenty)).toBe(3);
    expect(choiceLimit(groups, { ...plenty, wheat: 1, ore: 0 })).toBe(1);
    expect(choiceLimit(choiceGroups(2), { ...plenty, wheat: 0 })).toBe(2);
  });
});

describe('charting on your turn', () => {
  it('costs 2 lodestone and steps the number toward 7; a 6 or 8 gains a 2 or 12 at random', () => {
    const g = cartographersGame();
    const lode = hexOf(g, 'lodestone');
    expect(getView(g, 'p0').legal.chartHexes).toEqual([]);
    grant(g, 'p0', { lodestone: 4 });
    expect(getView(g, 'p0').legal.chartHexes).toContain(lode.id);
    const once = act(g, 'p0', { type: 'chart-hex', hexId: lode.id });
    expect(hexNumbers(once.board.hexes.find(h => h.id === lode.id)!)).toEqual([6]);
    expect(once.players[0]!.resources.lodestone).toBe(2);
    const twice = act(once, 'p0', { type: 'chart-hex', hexId: lode.id }, sequence(0.9));
    expect(hexNumbers(twice.board.hexes.find(h => h.id === lode.id)!)).toEqual([6, 12]);
    expect(twice.log.at(-1)?.event).toMatchObject({ kind: 'chart', playerId: 'p0', numbers: [6, 12] });
    // The board isn't part of an undo, so a chart can't be taken back.
    expect(twice.undo).toBeNull();
    expect(conserved(twice)).toBe(true);
  });

  it('is only in your own build phase', () => {
    const g = cartographersGame();
    grant(g, 'p1', { lodestone: 2 });
    expect(() => act(g, 'p1', { type: 'chart-hex', hexId: hexOf(g, 'wood').id })).toThrow(/turn/);
    grant(g, 'p0', { lodestone: 2 });
    expect(() => act({ ...g, phase: 'roll' }, 'p0', { type: 'chart-hex', hexId: hexOf(g, 'wood').id })).toThrow();
  });
});

describe('split tiles', () => {
  /** p0 with a settlement on the wheat tile and the cards for a split. */
  function withSplit(resource: Resource = 'ore') {
    const g = cartographersGame();
    const wheat = hexOf(g, 'wheat');
    g.buildings[wheat.vertexIds[0]!] = { playerId: 'p0', kind: 'settlement' };
    grant(g, 'p0', { lodestone: 3, [resource]: 1 });
    return { g: act(g, 'p0', { type: 'split-hex', hexId: wheat.id, resource }), wheat };
  }

  it('cost 3 lodestone and one card of the resource added, once per tile, never its own resource', () => {
    const g = cartographersGame();
    const wheat = hexOf(g, 'wheat');
    grant(g, 'p0', { lodestone: 6, wheat: 1, ore: 2 });
    expect(getView(g, 'p0').legal.splitHexes).toContain(wheat.id);
    expect(() => act(g, 'p0', { type: 'split-hex', hexId: wheat.id, resource: 'wheat' })).toThrow(/different/);
    const next = act(g, 'p0', { type: 'split-hex', hexId: wheat.id, resource: 'ore' });
    expect(next.board.hexes.find(h => h.id === wheat.id)!.split).toBe('ore');
    expect(next.players[0]!.resources).toMatchObject({ lodestone: 3, ore: 1, wheat: 1 });
    expect(getView(next, 'p0').legal.splitHexes).not.toContain(wheat.id);
    expect(() => act(next, 'p0', { type: 'split-hex', hexId: wheat.id, resource: 'wood' })).toThrow(/isn’t split/);
    expect(conserved(next)).toBe(true);
  });

  it('pay a pick of either half, card by card, and refuse anything else', () => {
    const { g, wheat } = withSplit();
    const city = { ...g, buildings: { ...g.buildings, [wheat.vertexIds[0]!]: { playerId: 'p0', kind: 'city' } } };
    const rolled = roll(city as GameState, 4, 4);
    expect(rolled.phase).toBe('gold');
    expect(rolled.pendingGold).toEqual({ p0: 2 });
    expect(rolled.pendingSplit).toEqual({ p0: [{ options: ['wheat', 'ore'], count: 2 }] });
    expect(() => act(rolled, 'p0', { type: 'choose-gold', resources: bag({ wood: 1, ore: 1 }) })).toThrow(/split/);
    const done = act(rolled, 'p0', { type: 'choose-gold', resources: bag({ wheat: 1, ore: 1 }) });
    expect(done.phase).toBe('build');
    expect(done.pendingSplit).toEqual({});
    expect(conserved(done)).toBe(true);
  });

  it('let whoever builds there later pick too, and relay stations beside them', () => {
    const { g, wheat } = withSplit();
    g.buildings[wheat.vertexIds[3]!] = { playerId: 'p1', kind: 'settlement' };
    const rolled = roll(g, 4, 4);
    expect(Object.keys(rolled.pendingSplit).sort()).toEqual(['p0', 'p1']);
  });

  it('bots and timed-out players pick within the two halves', () => {
    const { g, wheat } = withSplit();
    g.buildings[wheat.vertexIds[3]!] = { playerId: 'p1', kind: 'settlement' };
    g.players[1]!.bot = 'advanced';
    const rolled = roll(g, 4, 4);
    const pick = chooseBotAction(getView(rolled, 'p1'));
    expect(pick.type).toBe('choose-gold');
    const picked = act(rolled, 'p1', pick);
    const timedOut = advanceTime(picked, picked.goldDeadline! + 1, seeded());
    expect(timedOut.phase).toBe('build');
    const gained = (state: GameState, id: number) =>
      state.players[id]!.resources.wheat + state.players[id]!.resources.ore;
    expect(gained(timedOut, 0) - gained(g, 0)).toBe(1);
    expect(gained(timedOut, 1) - gained(g, 1)).toBe(1);
  });
});

describe('survey targets', () => {
  /** p0 with a ship out at sea and the cards to fit it out. */
  function withShip() {
    const g = cartographersGame();
    const [edgeId] = openSeaEdges(g);
    g.ships[edgeId!] = 'p0';
    grant(g, 'p0', { lodestone: 2, ore: 1 });
    return { g, edgeId: edgeId! };
  }

  it('pay one card from the target when its number rolls; the robber blocks it', () => {
    const { g, edgeId } = withShip();
    const wheat = hexOf(g, 'wheat');
    const next = act(g, 'p0', { type: 'build-survey', edgeId, hexId: wheat.id });
    const rolled = roll(next, 4, 4);
    expect(rolled.players[0]!.resources.wheat).toBe(next.players[0]!.resources.wheat + 1);
    const robbed = roll({ ...next, robber: wheat.id }, 4, 4);
    expect(robbed.players[0]!.resources.wheat).toBe(next.players[0]!.resources.wheat);
  });

  it('may aim at a fog tile only after peeking, and what it pays from there stays private', () => {
    const { g, edgeId } = withShip();
    g.board = structuredClone(g.board);
    const fog = g.board.hexes.filter(h => h.terrain === 'sea').at(-1)!;
    fog.terrain = 'fog';
    g.fog[fog.id] = { terrain: 'brick', number: 9 };
    expect(getView(g, 'p0').legal.surveyTargets).not.toContain(fog.id);
    expect(() => act(g, 'p0', { type: 'build-survey', edgeId, hexId: fog.id })).toThrow(/peeked/);
    g.fogPeeks = { p0: [fog.id] };
    const next = act(g, 'p0', { type: 'build-survey', edgeId, hexId: fog.id });
    const rolled = roll(next, 4, 5);
    expect(rolled.players[0]!.resources.brick).toBe(next.players[0]!.resources.brick + 1);
    expect(rolled.log.at(-1)?.event).toEqual({ kind: 'survey-find', playerId: 'p0', hexId: fog.id, resource: 'brick' });
    expect(getView(rolled, 'p1').log.at(-1)?.event).toMatchObject({ kind: 'survey-find', resource: null });
    expect(JSON.stringify(getView(rolled, 'p1'))).not.toContain('"brick","number":9');
    // Bots count the card without knowing its kind.
    expect(rolled.handGuess.likely.p0!.brick).toBeLessThan(rolled.players[0]!.resources.brick);
    // Once the game ends, every fog tile shows what it hid.
    expect(getView({ ...rolled, phase: 'finished' }, 'p1').fogPeeks[fog.id]).toEqual({ terrain: 'brick', number: 9 });
    expect(conserved(rolled)).toBe(true);
  });
});

describe('older rooms', () => {
  it('a room saved mid-charting goes back to building, with no charts owed', () => {
    const old = structuredClone(createGame('old', seeded())) as unknown as Record<string, unknown> & GameState;
    old.schemaVersion = 17;
    Object.assign(old, { phase: 'charting', pendingCharts: { p0: 1 }, chartDeadline: TEST_NOW });
    for (const key of ['surveyTargets', 'pendingSplit']) delete old[key];
    const up = normalizeGame(old, TEST_NOW);
    expect(up.phase).toBe('build');
    expect(up).not.toHaveProperty('pendingCharts');
    expect(up.surveyTargets).toEqual({});
    expect(up.pendingSplit).toEqual({});
  });
});
