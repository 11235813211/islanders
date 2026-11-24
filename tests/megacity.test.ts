import { describe, expect, it } from 'vitest';
import { chooseBotAction } from '../shared/bots';
import { BUILD_COSTS, getView } from '../shared/engine';
import { eruptAt, produce } from '../shared/engine/production';
import { victoryPoints } from '../shared/rules';
import { boardIndex, ERUPTION_CORNER } from '../shared/seafaring';
import type { GameState } from '../shared/types';
import { act, cartographersGame, grant, hexOf, settled } from './fixtures';

/** p0 has a city on the wood tile's corner by the lodestone tile, with megacity cards in hand. */
function withCity(numbers: number[]): { g: GameState; corner: string } {
  const g = cartographersGame();
  g.board = structuredClone(g.board);
  const [wood, moor] = [hexOf(g, 'wood'), hexOf(g, 'lodestone')];
  const corner = wood.vertexIds.find(v => moor.vertexIds.includes(v))!;
  g.buildings[corner] = { playerId: 'p0', kind: 'city' };
  wood.number = numbers[0]!;
  wood.extra = numbers.length > 1 ? numbers.slice(1) : undefined;
  grant(g, 'p0', BUILD_COSTS.megacity);
  return { g, corner };
}

describe('megacities', () => {
  it('only a city beside a tile with two or more numbers may become one', () => {
    expect(getView(withCity([6]).g, 'p0').legal.megacities).toEqual([]);
    for (const numbers of [
      [6, 2],
      [8, 12],
      [6, 5, 4],
    ]) {
      const { g, corner } = withCity(numbers);
      expect(getView(g, 'p0').legal.megacities).toEqual([corner]);
    }
    const settlement = withCity([6, 2]);
    settlement.g.buildings[settlement.corner] = { playerId: 'p0', kind: 'settlement' };
    expect(getView(settlement.g, 'p0').legal.megacities).toEqual([]);
  });

  it('costs 3 lodestone, 1 brick, 1 grain, is worth 3 points, and collects 3 cards a number', () => {
    const { g, corner } = withCity([6, 2]);
    const before = { ...g.players[0]!.resources };
    const points = victoryPoints(g, 'p0');
    const next = act(g, 'p0', { type: 'build-megacity', vertexId: corner });
    const p0 = next.players[0]!;
    expect([p0.resources.lodestone, p0.resources.brick, p0.resources.wheat]).toEqual([
      before.lodestone - 3,
      before.brick - 1,
      before.wheat - 1,
    ]);
    expect(next.megacities).toEqual([corner]);
    expect(victoryPoints(next, 'p0')).toBe(points + 1);
    expect(() => act(next, 'p0', { type: 'build-megacity', vertexId: corner })).toThrow();
    const lodestone = boardIndex(next.board).hex.get(hexOf(next, 'lodestone').id)!.number!;
    const gains = produce(next, lodestone);
    expect(gains.p0?.lodestone).toBe(3);
    expect(produce(next, 2).p0?.wood).toBe(3);
  });

  it('an eruption takes the megacity back to a city, and losing the city drops the mark', () => {
    const { g } = withCity([6, 2]);
    const volcano = hexOf(g, 'volcano');
    const hit = volcano.vertexIds[ERUPTION_CORNER[0]]!;
    g.buildings[hit] = { playerId: 'p1', kind: 'city' };
    g.megacities = [hit];
    eruptAt(g, volcano.id, 1);
    expect(g.megacities).toEqual([]);
    expect(g.buildings[hit]).toEqual({ playerId: 'p1', kind: 'city' });
    g.megacities = [hit];
    g.buildings[hit] = { playerId: 'p1', kind: 'settlement' };
    expect(act(g, 'p0', { type: 'end-turn' }).megacities).toEqual([]);
  });

  it('is only in Cartographers games, and bots build one when they can', () => {
    const plain = settled(3);
    plain.phase = 'build';
    expect(getView(plain, 'p0').legal.megacities).toEqual([]);
    const { g, corner } = withCity([6, 2]);
    for (const level of ['beginner', 'intermediate', 'advanced'] as const)
      expect(chooseBotAction(getView(g, 'p0'), { level })).toEqual({ type: 'build-megacity', vertexId: corner });
  });

  it('a bot with a city beside a one-number tile charts it toward a megacity', () => {
    const { g } = withCity([6]);
    const wood = hexOf(g, 'wood').id;
    expect(chooseBotAction(getView(g, 'p0'), { level: 'intermediate' })).toEqual({ type: 'chart-hex', hexId: wood });
  });
});
