import { describe, expect, it } from 'vitest';
import { chooseBotAction } from '../shared/bots';
import { applyAction, getActivePlayerId, getView } from '../shared/engine';
import type { GameState } from '../shared/types';
import { act, hexOf, inSeatOrder, seaLobby, testDesign } from './fixtures';

/**
 * A last setup piece beside gold, a volcano, or a split tile picks what that tile pays, before its
 * road. Ore 10 sits between the gold field and the volcano; wheat 6 below can be split.
 */
const PICKS = testDesign(['~ ~ ~ ~ ~ ~ ~', ' ~ g8 o10 v4 ~ ~', '~ w5 h6 s9 b3 ~', ' ~ ~ ~ ~ ~ ~ ~']);

/** A two-seat game on PICKS at its last setup settlement (p0), the first three already placed far away. */
function lastPlacement(volcanoGold = true): GameState {
  let g = seaLobby(PICKS, 2);
  g = act(g, 'p0', { type: 'configure', settings: { ...g.settings, volcanoGold } });
  g = inSeatOrder(act(g, 'p0', { type: 'start' }));
  // p0, p1, p1 settle around the far tiles (sheep and brick), each with a road or ship.
  const far = [...hexOf(g, 'brick').vertexIds, ...hexOf(g, 'sheep').vertexIds];
  for (let i = 0; i < 3; i++) {
    const id = getActivePlayerId(g)!;
    const legal = getView(g, id).legal.settlements;
    const placed = far
      .filter(v => legal.includes(v))
      .map(vertexId => act(g, id, { type: 'place-settlement', vertexId }))
      .find(next => getView(next, id).legal.roads.length)!;
    g = act(placed, id, { type: 'place-road', edgeId: getView(placed, id).legal.roads[0]! });
  }
  expect(getActivePlayerId(g)).toBe('p0');
  return g;
}

/** The corner shared by the gold field, the ore tile, and the wheat tile. */
function goldCorner(g: GameState): string {
  const [gold, ore, wheat] = [hexOf(g, 'gold'), hexOf(g, 'ore'), hexOf(g, 'wheat')];
  return gold.vertexIds.find(id => ore.vertexIds.includes(id) && wheat.vertexIds.includes(id))!;
}

describe('starting picks', () => {
  it('a gold field beside the last setup piece leaves a pick before the road', () => {
    let g = lastPlacement();
    const before = { ...g.players[0]!.resources };
    g = act(g, 'p0', { type: 'place-settlement', vertexId: goldCorner(g) });
    const p0 = g.players[0]!;
    expect(p0.resources.ore - before.ore).toBe(1);
    expect(p0.resources.wheat - before.wheat).toBe(1);
    expect(g.pendingGold).toEqual({ p0: 1 });
    expect(getView(g, 'p0').legal.roads).toEqual([]);
    const edge = g.board.edges.find(e => e.a === goldCorner(g) || e.b === goldCorner(g))!.id;
    expect(() => act(g, 'p0', { type: 'place-road', edgeId: edge })).toThrow(/starting resources/);
    const brick = { wood: 0, brick: 1, sheep: 0, wheat: 0, ore: 0, lodestone: 0, paper: 0, cloth: 0, coin: 0 };
    g = act(g, 'p0', { type: 'choose-gold', resources: brick });
    expect(g.players[0]!.resources.brick - before.brick).toBe(1);
    expect(g.phase).toBe('setup-road');
    expect(g.pendingGold).toEqual({});
    expect(g.undo).not.toBeNull();
    expect(getView(g, 'p0').legal.roads.length).toBeGreaterThan(0);
  });

  it('a split tile picks one of its two; a volcano picks only when volcanoes pay', () => {
    const plain = lastPlacement();
    const hexes = plain.board.hexes.map(h => (h.terrain === 'wheat' ? { ...h, split: 'sheep' as const } : h));
    let g: GameState = { ...plain, board: { ...plain.board, hexes } };
    g = act(g, 'p0', { type: 'place-settlement', vertexId: goldCorner(g) });
    expect(g.pendingGold).toEqual({ p0: 2 });
    expect(g.pendingSplit.p0).toEqual([{ options: ['wheat', 'sheep'], count: 1 }]);
    const ore2 = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 2, lodestone: 0, paper: 0, cloth: 0, coin: 0 };
    expect(() => act(g, 'p0', { type: 'choose-gold', resources: ore2 })).toThrow(/split tile/);

    const quiet = lastPlacement(false);
    const [ore, volcano] = [hexOf(quiet, 'ore'), hexOf(quiet, 'volcano')];
    const spot = ore.vertexIds.find(
      id => volcano.vertexIds.includes(id) && getView(quiet, 'p0').legal.settlements.includes(id),
    )!;
    expect(act(quiet, 'p0', { type: 'place-settlement', vertexId: spot }).pendingGold).toEqual({});
    const paying = lastPlacement(true);
    expect(act(paying, 'p0', { type: 'place-settlement', vertexId: spot }).pendingGold).toEqual({ p0: 1 });
  });

  it('a bot picks, then places its road', () => {
    let g = lastPlacement();
    g = act(g, 'p0', { type: 'place-settlement', vertexId: goldCorner(g) });
    for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
      const pick = chooseBotAction(getView(g, 'p0'), { level });
      expect(pick.type).toBe('choose-gold');
      const next = applyAction(g, 'p0', pick, Math.random, 0);
      expect(chooseBotAction(getView(next, 'p0'), { level }).type).toMatch(/place-(road|ship)/);
    }
  });
});
