import { describe, expect, it } from 'vitest';
import { BOTS } from '../shared/bots';
import { Economy } from '../shared/bots/advanced/economy';
import { TRAINED } from '../shared/bots/advanced/params';
import { pips } from '../shared/bots/analysis';
import { chartMove, splitMove } from '../shared/bots/charting';
import { getView } from '../shared/engine';
import { chartHexes } from '../shared/engine/legal';
import { produce } from '../shared/engine/production';
import { boardIndex } from '../shared/seafaring';
import { type GameState, RESOURCES, type Resource, type ResourceBag } from '../shared/types';
import { act, cartographersGame } from './fixtures';

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

/** What the engine pays p0 per 36 rolls, by resource (choices and discoveries left out). */
function enginePayout(g: GameState): ResourceBag {
  const out = Object.fromEntries(RESOURCES.map(r => [r, 0])) as ResourceBag;
  for (let total = 2; total <= 12; total++) {
    if (total === 7) continue;
    const paid = produce(structuredClone(g), total).p0;
    for (const r of RESOURCES) out[r] += (paid?.[r] ?? 0) * pips(total);
  }
  return out;
}

describe('Advanced income on Cartographers maps', () => {
  /** p0: a city on a tile charted to 6 and 5 (split into `split`), and a relay station on one of its sides. */
  function chartedCity(split?: Resource) {
    const { g, hex, index } = emptyBoard({});
    g.board = structuredClone(g.board);
    const tile = g.board.hexes.find(h => h.id === hex.id)!;
    tile.number = 6;
    tile.extra = [5];
    if (split) tile.split = split;
    g.buildings[tile.vertexIds[0]!] = { playerId: 'p0', kind: 'city' };
    const relay = tile.vertexIds
      .flatMap(v => index.vertex.get(v)!.edgeIds)
      .find(e => index.edgeHexes.get(e)!.length === 2)!;
    g.roads[relay] = 'p0';
    g.relays = [relay];
    return { g, tile };
  }
  const income = (g: GameState) => new Economy(getView(g, 'p0'), TRAINED.knobs).production;

  it('counts charted numbers and relay stations as the engine pays them', () => {
    const { g, tile } = chartedCity();
    expect(income(g)).toEqual(enginePayout(g));
    // Under the robber only the relay station still collects.
    g.robber = tile.id;
    expect(income(g)).toEqual(enginePayout(g));
    expect(income(g).wheat).toBeGreaterThan(0);
  });

  it('counts a split tile as half of each resource', () => {
    const before = income(chartedCity().g);
    const after = income(chartedCity('ore').g);
    const moved = before.wheat - after.wheat;
    expect(moved).toBeGreaterThan(0);
    expect(after.ore - before.ore).toBeCloseTo(moved);
  });
});
