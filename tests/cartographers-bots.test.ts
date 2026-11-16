import { describe, expect, it } from 'vitest';
import { BOTS } from '../shared/bots';
import { chartMove, splitMove } from '../shared/bots/charting';
import { getView } from '../shared/engine';
import { chartHexes } from '../shared/engine/legal';
import { BUILTIN_BOARDS } from '../shared/maps';
import { boardIndex } from '../shared/seafaring';
import { RESOURCES, type Resource, type ResourceBag } from '../shared/types';
import { playBotGame } from './bot-harness';
import { act, cartographersGame } from './fixtures';

const compass = BUILTIN_BOARDS.find(b => b.id === 'compass-sea')!;

describe('Advanced bots on Cartographers maps', () => {
  // Before the planner knew lodestone, four Advanced bots fit out about one survey ship in 25 games.
  it('save lodestone for survey ships and fit them out', () => {
    let surveys = 0;
    for (const seed of [1, 2, 3, 4]) {
      const end = playBotGame(['advanced', 'advanced', 'advanced', 'advanced'], seed, 9000, compass);
      expect(end.phase).toBe('finished');
      surveys += end.surveys.length;
    }
    expect(surveys).toBeGreaterThanOrEqual(4);
  }, 60_000);
});

/** A Cartographers game with the board cleared and p0 to build, holding `hand`. */
function emptyBoard(hand: Partial<ResourceBag>) {
  const g = cartographersGame();
  g.buildings = {};
  g.roads = {};
  g.ships = {};
  for (const r of RESOURCES) {
    g.bank[r] += g.players[0]!.resources[r] - (hand[r] ?? 0);
    g.players[0]!.resources[r] = hand[r] ?? 0;
  }
  const index = boardIndex(g.board);
  // A chartable land tile away from the robber, with every corner on land.
  const hex = g.board.hexes.find(
    h =>
      h.terrain === 'wheat' &&
      h.id !== g.robber &&
      chartHexes(g).includes(h.id) &&
      h.vertexIds.every(v => index.vertex.get(v)!.hexIds.length === 3),
  )!;
  return { g, hex, index };
}

const advancedTiles = BOTS.advanced.brain.tiles!;

describe('Cartographers tiles for the Advanced bot', () => {
  it('splits a tile into a resource it earns none of, trading for the card first', () => {
    const { g, hex } = emptyBoard({ lodestone: 1, brick: 4 });
    g.buildings[hex.vertexIds[0]!] = { playerId: 'p0', kind: 'city' };
    // The simple bots split into what they hold.
    expect(splitMove(getView(g, 'p0'))).toMatchObject({ type: 'split-hex', resource: 'brick' });
    const trade = splitMove(getView(g, 'p0'), advancedTiles);
    expect(trade).toMatchObject({ type: 'trade', give: 'brick' });
    const want = (trade as { receive: Resource }).receive;
    const traded = act(g, 'p0', trade!);
    expect(splitMove(getView(traded, 'p0'), advancedTiles)).toEqual({
      type: 'split-hex',
      hexId: hex.id,
      resource: want,
    });
  });

  it("doesn't chart a tile a rival's road is about to reach", () => {
    const { g, hex, index } = emptyBoard({ lodestone: 1 });
    g.buildings[hex.vertexIds[0]!] = { playerId: 'p0', kind: 'city' };
    // p1's road ends at the far corner of the tile, from a settlement just off it.
    const far = hex.vertexIds[3]!;
    const edge = index.vertex
      .get(far)!
      .edgeIds.map(id => index.edge.get(id)!)
      .find(e => {
        const other = e.a === far ? e.b : e.a;
        return !hex.vertexIds.includes(other);
      })!;
    g.roads[edge.id] = 'p1';
    g.buildings[edge.a === far ? edge.b : edge.a] = { playerId: 'p1', kind: 'settlement' };
    expect(chartMove(getView(g, 'p0'))).toEqual({ type: 'chart-hex', hexId: hex.id });
    expect(chartMove(getView(g, 'p0'), advancedTiles)).toBeNull();
  });
});
