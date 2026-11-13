import { describe, expect, it } from 'vitest';
import { chooseBotAction } from '../shared/bots';
import { choiceFits, choiceGroups, choiceLimit } from '../shared/choices';
import { advanceTime, createGame, getView, normalizeGame } from '../shared/engine';
import { chartHexes } from '../shared/engine/legal';
import { chartedNumbers, hexNumbers } from '../shared/rules';
import { boardIndex } from '../shared/seafaring';
import type { GameState, Resource, ResourceBag } from '../shared/types';
import {
  act,
  cartographersGame,
  conserved,
  grant,
  hexOf,
  seeded,
  sequence,
  shipsToOpenSea,
  TEST_NOW,
} from './fixtures';

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
  it('costs 1 lodestone and steps the number toward 7; a 6 then gains a 2', () => {
    const g = cartographersGame();
    const lode = hexOf(g, 'lodestone');
    expect(getView(g, 'p0').legal.chartHexes).toEqual([]);
    grant(g, 'p0', { lodestone: 4 });
    expect(getView(g, 'p0').legal.chartHexes).toContain(lode.id);
    const once = act(g, 'p0', { type: 'chart-hex', hexId: lode.id });
    expect(hexNumbers(once.board.hexes.find(h => h.id === lode.id)!)).toEqual([6]);
    expect(once.players[0]!.resources.lodestone).toBe(3);
    const twice = act(once, 'p0', { type: 'chart-hex', hexId: lode.id });
    expect(hexNumbers(twice.board.hexes.find(h => h.id === lode.id)!)).toEqual([6, 2]);
    expect(twice.log.at(-1)?.event).toMatchObject({ kind: 'chart', playerId: 'p0', numbers: [6, 2] });
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
    grant(g, 'p0', { lodestone: 1, [resource]: 1 });
    return { g: act(g, 'p0', { type: 'split-hex', hexId: wheat.id, resource }), wheat };
  }

  it('cost 1 lodestone and one card of the resource added, once per tile, never its own or lodestone', () => {
    const g = cartographersGame();
    const wheat = hexOf(g, 'wheat');
    grant(g, 'p0', { lodestone: 4, wheat: 1, ore: 2 });
    expect(getView(g, 'p0').legal.splitHexes).toContain(wheat.id);
    expect(() => act(g, 'p0', { type: 'split-hex', hexId: wheat.id, resource: 'wheat' })).toThrow(/different/);
    expect(() => act(g, 'p0', { type: 'split-hex', hexId: wheat.id, resource: 'lodestone' })).toThrow(/lodestone/);
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

describe('survey ships chart', () => {
  /** p0 with a settlement, ships out to open sea, and the cards to fit the last one out. */
  function withShip(length = 1) {
    const g = cartographersGame();
    const route = shipsToOpenSea(g, 'p0', length);
    grant(g, 'p0', { lodestone: 3, ore: 1 });
    return { g, ...route };
  }
  const numbers = (g: GameState, id: string) => hexNumbers(g.board.hexes.find(h => h.id === id)!);

  it('every tile around the nearest town, once, when fitted out', () => {
    const { g, town, edgeId } = withShip();
    expect(getView(g, 'p0').legal.surveyTowns).toEqual({ [edgeId]: [town] });
    const chartable = new Set(chartHexes(g));
    const around = boardIndex(g.board)
      .vertex.get(town)!
      .hexIds.filter(id => chartable.has(id));
    expect(around.length).toBeGreaterThan(0);
    const next = act(g, 'p0', { type: 'build-survey', edgeId, vertexId: town });
    for (const id of around) expect(numbers(next, id)).toEqual(chartedNumbers(numbers(g, id)));
    const charts = next.log.filter(e => e.event?.kind === 'chart');
    expect(charts).toHaveLength(around.length);
    expect(next.players[0]!.resources).toMatchObject({ lodestone: 0, ore: 0 });
    expect(conserved(next)).toBe(true);
  });

  it('only the nearest town counts, and someone else’s building cuts the route', () => {
    const { g, town, edgeId, path } = withShip(2);
    expect(path.length).toBeGreaterThan(1);
    // A second town of p0's one ship closer: it alone is nearest.
    const first = boardIndex(g.board).edge.get(path[0]!)!;
    const closer = first.a === town ? first.b : first.a;
    g.buildings[closer] = { playerId: 'p0', kind: 'settlement' };
    expect(getView(g, 'p0').legal.surveyTowns[edgeId]).toEqual([closer]);
    expect(() => act(g, 'p0', { type: 'build-survey', edgeId, vertexId: town })).toThrow(/nearest/);
    // With p1's settlement there instead, no town of p0's is reached, so the ship can't be fitted out.
    g.buildings[closer] = { playerId: 'p1', kind: 'settlement' };
    expect(getView(g, 'p0').legal.surveys).not.toContain(edgeId);
  });

  it('lets you pick between towns equally near', () => {
    const { g, edgeId } = withShip();
    const ship = boardIndex(g.board).edge.get(edgeId)!;
    for (const v of [ship.a, ship.b]) g.buildings[v] = { playerId: 'p0', kind: 'settlement' };
    expect([...getView(g, 'p0').legal.surveyTowns[edgeId]!].sort()).toEqual([ship.a, ship.b].sort());
    expect(act(g, 'p0', { type: 'build-survey', edgeId, vertexId: ship.b }).surveys).toContain(edgeId);
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
    expect(up.pendingSplit).toEqual({});
  });

  it('survey ship targets stop paying, and their private fog finds leave the log', () => {
    const old = structuredClone(createGame('old', seeded())) as unknown as Record<string, unknown> & GameState;
    old.schemaVersion = 18;
    old.surveyTargets = { e1: 'h1' } as never;
    old.log = [
      { id: 1, text: 'p0’s survey ship brought in a card.', event: { kind: 'survey-find', resource: 'ore' } },
    ] as never;
    const up = normalizeGame(old, TEST_NOW);
    expect(up).not.toHaveProperty('surveyTargets');
    expect(up.log.find(e => e.id === 1)?.event).toBeUndefined();
  });
});
