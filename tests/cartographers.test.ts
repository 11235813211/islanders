import { describe, expect, it } from 'vitest';
import { createGame, getView, normalizeGame } from '../shared/engine';
import { pieceCounts } from '../shared/engine/core';
import { produce } from '../shared/engine/production';
import { BUILTIN_BOARDS } from '../shared/maps';
import { buildBoard } from '../shared/maps/generate';
import { chartedNumbers, longestRoad, tradeRates, victoryPoints } from '../shared/rules';
import { boardIndex } from '../shared/seafaring';
import type { GameState, Hex } from '../shared/types';
import { playBotGame } from './bot-harness';
import {
  act,
  cartographersGame,
  conserved,
  grant,
  hexOf,
  inSeatOrder,
  openSeaEdges,
  seaLobby,
  seeded,
  shipsToOpenSea,
  TEST_NOW,
} from './fixtures';

const building = cartographersGame;
const seaEdges = openSeaEdges;

/** The edge between two tiles, and its two corners. */
function between(g: GameState, a: Hex, b: Hex) {
  const index = boardIndex(g.board);
  const edge = g.board.edges.find(e => {
    const hexes = index.edgeHexes.get(e.id)!;
    return hexes.includes(a) && hexes.includes(b);
  })!;
  return edge;
}

/** p0 holds a settlement one road away from the wood–lodestone edge, so a relay station fits there. */
function withRoadToRelay() {
  const g = building();
  const index = boardIndex(g.board);
  const relay = between(g, hexOf(g, 'wood'), hexOf(g, 'lodestone'));
  const road = index.vertex.get(relay.a)!.edgeIds.find(id => id !== relay.id)!;
  const town = index.edge.get(road)!.a === relay.a ? index.edge.get(road)!.b : index.edge.get(road)!.a;
  g.buildings[town] = { playerId: 'p0', kind: 'settlement' };
  g.roads[road] = 'p0';
  return { g, relay, road, town };
}

describe('lodestone', () => {
  it('is in the bank only on Cartographers maps, and the view says so', () => {
    const plain = inSeatOrder(
      act(seaLobby(BUILTIN_BOARDS.find(b => b.id === 'outer-isles')!, 3), 'p0', { type: 'start' }),
    );
    expect(plain.bank.lodestone).toBe(0);
    expect(getView(plain, 'p0').cartographers).toBe(false);
    const g = building();
    expect(g.bank.lodestone).toBe(19);
    expect(getView(g, 'p0').cartographers).toBe(true);
    expect(conserved(g)).toBe(true);
  });

  it('a lodestone tile pays lodestone like any resource', () => {
    const g = building();
    const lode = hexOf(g, 'lodestone');
    g.buildings[lode.vertexIds[0]!] = { playerId: 'p1', kind: 'city' };
    expect(produce(g, 5).p1?.lodestone).toBe(2);
  });

  it('random harbors draw lodestone only on Cartographers maps', () => {
    const kinds = (id: string) =>
      Array.from({ length: 30 }, (_, seed) =>
        buildBoard(BUILTIN_BOARDS.find(b => b.id === id)!, seeded(seed + 1)).board.harbors.map(h => h.resource),
      ).flat();
    expect(kinds('outer-isles')).not.toContain('lodestone');
    expect(kinds('compass-sea')).toContain('lodestone');
  });

  it('rooms saved before Cartographers gain empty lodestone counts', () => {
    const g = createGame('old', seeded());
    const old = structuredClone(g) as unknown as Record<string, unknown> & GameState;
    old.schemaVersion = 14;
    delete (old.bank as Partial<GameState['bank']>).lodestone;
    for (const key of ['relays', 'surveys', 'pendingCharts', 'chartDeadline']) delete old[key];
    const up = normalizeGame(old, TEST_NOW);
    expect(up.bank.lodestone).toBe(0);
    expect(up.relays).toEqual([]);
    expect(up.surveys).toEqual([]);
    expect(up.pendingSplit).toEqual({});
    expect(up).not.toHaveProperty('pendingCharts');
    expect(up.settings.chartSpecial).toBe(false);
  });
});

describe('relay stations', () => {
  it('cost 1 lodestone, 1 grain, 1 lumber, join your road, and count toward Longest Road', () => {
    const { g, relay } = withRoadToRelay();
    expect(getView(g, 'p0').legal.relays).toEqual([]);
    grant(g, 'p0', { lodestone: 1, wood: 1, wheat: 1 });
    expect(getView(g, 'p0').legal.relays).toContain(relay.id);
    const next = act(g, 'p0', { type: 'build-relay', edgeId: relay.id });
    expect(next.relays).toEqual([relay.id]);
    expect(next.roads[relay.id]).toBe('p0');
    expect(next.players[0]!.resources).toMatchObject({ lodestone: 0, wood: 0, wheat: 0 });
    expect(longestRoad(next, 'p0')).toBe(2);
    expect(pieceCounts(next, 'p0')).toMatchObject({ roads: 1, relays: 1 });
    expect(victoryPoints(next, 'p0')).toBe(victoryPoints(g, 'p0'));
    expect(conserved(next)).toBe(true);
  });

  it('stay off corners with buildings or another relay station, and keep settlements off their ends', () => {
    const { g, relay, town } = withRoadToRelay();
    grant(g, 'p0', { lodestone: 4, wood: 3, sheep: 3, brick: 1, wheat: 1 });
    const next = act(g, 'p0', { type: 'build-relay', edgeId: relay.id });
    const legal = getView(next, 'p0').legal;
    const index = boardIndex(next.board);
    // No other relay station may share a corner with it.
    const touching = [relay.a, relay.b].flatMap(v => index.vertex.get(v)!.edgeIds);
    expect(legal.relays.filter(id => touching.includes(id))).toEqual([]);
    // Its far end is reached by your route, but no settlement may stand there.
    expect(legal.settlements).not.toContain(relay.b);
    expect(legal.settlements).not.toContain(relay.a);
    // And no relay station may touch a corner with a building.
    expect(legal.relays.some(id => [index.edge.get(id)!.a, index.edge.get(id)!.b].includes(town))).toBe(false);
  });

  it('pay one card from each tile beside them, even with the robber on it', () => {
    const { g, relay } = withRoadToRelay();
    const before = produce(structuredClone(g), 5).p0?.lodestone ?? 0;
    g.roads[relay.id] = 'p0';
    g.relays = [relay.id];
    expect((produce(structuredClone(g), 5).p0?.lodestone ?? 0) - before).toBe(1);
    const wood = produce(structuredClone(g), 6).p0?.wood ?? 0;
    g.robber = hexOf(g, 'lodestone').id;
    // The robber still keeps settlements and cities on the tile from collecting.
    expect(produce(structuredClone(g), 5).p0?.lodestone ?? 0).toBe(1);
    expect(wood).toBeGreaterThanOrEqual(1);
  });

  it('are limited to four each', () => {
    const { g, relay } = withRoadToRelay();
    grant(g, 'p0', { lodestone: 1, wood: 1, wheat: 1 });
    g.relays = ['x1', 'x2', 'x3', 'x4'];
    for (const id of g.relays) g.roads[id] = 'p0';
    expect(getView(g, 'p0').legal.relays).not.toContain(relay.id);
    expect(getView(g, 'p0').players[0]!.relaysLeft).toBe(0);
  });
});

describe('survey ships', () => {
  it('upgrade your ship out at sea for 3 lodestone and 1 ore, score a point, and stay put', () => {
    const g = building();
    const { edgeId, town, path } = shipsToOpenSea(g, 'p0');
    grant(g, 'p0', { lodestone: 2, ore: 1 });
    expect(getView(g, 'p0').legal.surveys).toEqual([]);
    grant(g, 'p0', { lodestone: 1 });
    expect(getView(g, 'p0').legal.surveys).toContain(edgeId);
    const next = act(g, 'p0', { type: 'build-survey', edgeId, vertexId: town });
    expect(next.surveys).toEqual([edgeId]);
    expect(victoryPoints(next, 'p0')).toBe(victoryPoints(g, 'p0') + 1);
    expect(pieceCounts(next, 'p0')).toMatchObject({ ships: path.length - 1, surveys: 1 });
    expect(getView(next, 'p0').legal.shipMoves[edgeId!]).toBeUndefined();
    expect(conserved(next)).toBe(true);
  });

  it('no two survey ships, anyone’s, border the same tile', () => {
    const g = building();
    const index = boardIndex(g.board);
    const { edgeId } = shipsToOpenSea(g, 'p0');
    grant(g, 'p0', { lodestone: 3, ore: 1 });
    expect(getView(g, 'p0').legal.surveys).toContain(edgeId);
    const tiles = index.edgeHexes.get(edgeId)!;
    const near = seaEdges(g).find(id => id !== edgeId && index.edgeHexes.get(id)!.some(h => tiles.includes(h)))!;
    g.ships[near] = 'p1';
    g.surveys = [near];
    expect(getView(g, 'p0').legal.surveys).not.toContain(edgeId);
  });
});

describe('charting', () => {
  it('steps toward 7; a 6 adds a 2 and an 8 a 12, stopping at 5/9 then 4/10', () => {
    expect(chartedNumbers([5])).toEqual([6]);
    expect(chartedNumbers([12])).toEqual([11]);
    expect(chartedNumbers([9])).toEqual([8]);
    expect(chartedNumbers([6])).toEqual([6, 2]);
    expect(chartedNumbers([8])).toEqual([8, 12]);
    expect(chartedNumbers([6, 2])).toEqual([6, 3]);
    expect(chartedNumbers([8, 12])).toEqual([8, 11]);
    expect(chartedNumbers([6, 4])).toEqual([6, 5]);
    expect(chartedNumbers([6, 5])).toEqual([6, 5, 2]);
    expect(chartedNumbers([8, 9])).toEqual([8, 9, 12]);
    expect(chartedNumbers([6, 5, 3])).toEqual([6, 5, 4]);
    expect(chartedNumbers([6, 5, 4])).toBeNull();
    expect(chartedNumbers([8, 9, 10])).toBeNull();
    // Charting from a 2 all the way: the tile never repeats a number.
    let tile: number[] | null = [2];
    let last: number[] = [];
    while (tile) [last, tile] = [tile, chartedNumbers(tile)];
    expect(last).toEqual([6, 5, 4]);
  });

  it('a tile pays once per matching number, so 6-6 pays twice and 6-8 pays on both', () => {
    const g = building();
    const wood = hexOf(g, 'wood');
    g.buildings[wood.vertexIds[0]!] = { playerId: 'p1', kind: 'settlement' };
    wood.extra = [6];
    expect(produce(structuredClone(g), 6).p1?.wood).toBe(2);
    wood.extra = [8];
    expect(produce(structuredClone(g), 8).p1?.wood).toBe(1);
  });

  it('a room can keep gold fields and volcanoes from being charted', () => {
    const g = building();
    grant(g, 'p0', { lodestone: 2 });
    g.settings.chartSpecial = true;
    const hexes = getView(g, 'p0').legal.chartHexes;
    expect(hexes).toContain(hexOf(g, 'gold').id);
    g.settings.chartSpecial = false;
    const plain = getView(g, 'p0').legal.chartHexes;
    expect(plain).not.toContain(hexOf(g, 'gold').id);
    expect(plain).not.toContain(hexOf(g, 'volcano').id);
    expect(plain).toContain(hexOf(g, 'wheat').id);
  });
});

describe('bots on Cartographers maps', () => {
  for (const id of ['compass-sea', 'magnetic-north']) {
    it(`${id} plays to the end with relay stations, survey ships, charts, and splits`, () => {
      const design = BUILTIN_BOARDS.find(b => b.id === id)!;
      const levels =
        id === 'magnetic-north'
          ? (['advanced', 'intermediate', 'beginner', 'advanced', 'intermediate'] as const)
          : (['advanced', 'intermediate', 'beginner'] as const);
      let built = 0;
      let tiles = 0;
      for (const seed of [1, 2, 3]) {
        const g = playBotGame([...levels], seed, 8000, design);
        expect(g.phase).toBe('finished');
        built += Object.values(g.stats).reduce((n, s) => n + (s.built.relay ?? 0) + (s.built.survey ?? 0), 0);
        tiles += g.log.filter(l => l.event?.kind === 'chart' || l.event?.kind === 'split').length;
      }
      expect(built).toBeGreaterThan(0);
      expect(tiles).toBeGreaterThan(0);
      // Three whole bot games: well under a second each alone, but slower beside the rest of the suite.
    }, 60_000);
  }
});

describe('peeking under the fog', () => {
  /** p0 to move, with one sea tile turned to fog hiding a wheat 6. */
  function foggy() {
    const g = building();
    g.board = structuredClone(g.board);
    const hex = g.board.hexes.filter(h => h.terrain === 'sea').at(-1)!;
    hex.terrain = 'fog';
    g.fog[hex.id] = { terrain: 'wheat', number: 6 };
    return { g, hexId: hex.id };
  }

  it('costs a lodestone, shows the tile only to the player who paid, and is offered once per tile', () => {
    const { g, hexId } = foggy();
    expect(getView(g, 'p0').legal.peekHexes).toEqual([]);
    grant(g, 'p0', { lodestone: 2 });
    expect(getView(g, 'p0').legal.peekHexes).toEqual([hexId]);
    const peeked = act(g, 'p0', { type: 'peek-fog', hexId });
    expect(peeked.players[0]!.resources.lodestone).toBe(1);
    expect(getView(peeked, 'p0').fogPeeks).toEqual({ [hexId]: { terrain: 'wheat', number: 6 } });
    expect(getView(peeked, 'p1').fogPeeks).toEqual({});
    expect(JSON.stringify(getView(peeked, 'p1'))).not.toContain('"wheat","number":6');
    expect(peeked.log.at(-1)!.event).toEqual({ kind: 'peek', playerId: 'p0', hexId });
    expect(getView(peeked, 'p0').legal.peekHexes).toEqual([]);
    expect(() => act(peeked, 'p0', { type: 'peek-fog', hexId })).toThrow(/peeked/);
    expect(peeked.undo).toBeNull();
    expect(conserved(peeked)).toBe(true);
  });

  it('is only during your own build phase', () => {
    const { g, hexId } = foggy();
    grant(g, 'p1', { lodestone: 1 });
    expect(() => act(g, 'p1', { type: 'peek-fog', hexId })).toThrow(/turn/);
    grant(g, 'p0', { lodestone: 1 });
    expect(() => act({ ...g, phase: 'roll' }, 'p0', { type: 'peek-fog', hexId })).toThrow();
  });
});

describe('relay stations at harbors', () => {
  it('a relay station on a harbor’s edge trades at that harbor’s rate; one beside it does not', () => {
    const g = building();
    const harbor = g.board.harbors[0]!;
    const onHarbor = g.board.edges.find(e => [e.a, e.b].sort().join() === [...harbor.vertices].sort().join())!;
    const beside = g.board.edges.find(e => e.id !== onHarbor.id && [e.a, e.b].includes(harbor.vertices[0]))!;
    const best = (game: GameState) => Math.min(...Object.values(tradeRates(game, 'p0')));
    expect(best(g)).toBe(4);
    const near = structuredClone(g);
    near.roads[beside.id] = 'p0';
    near.relays.push(beside.id);
    expect(best(near)).toBe(4);
    g.roads[onHarbor.id] = 'p0';
    g.relays.push(onHarbor.id);
    expect(best(g)).toBe(harbor.resource === 'any' ? 3 : 2);
    expect(Math.min(...Object.values(tradeRates(g, 'p1')))).toBe(4);
  });
});
