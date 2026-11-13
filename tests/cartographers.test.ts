import { describe, expect, it } from 'vitest';
import { advanceTime, applyAction, createGame, getView, normalizeGame } from '../shared/engine';
import { pieceCounts } from '../shared/engine/core';
import { produce } from '../shared/engine/production';
import { BUILTIN_BOARDS } from '../shared/maps';
import { buildBoard } from '../shared/maps/generate';
import { chartedNumbers, hexNumbers, longestRoad, tradeRates, victoryPoints } from '../shared/rules';
import { boardIndex } from '../shared/seafaring';
import type { GameAction, GameState, Hex, Terrain } from '../shared/types';
import { playBotGame } from './bot-harness';
import { conserved, grant, inSeatOrder, seaLobby, seeded, TEST_NOW, testDesign } from './fixtures';

/**
 * Home island: wood 6 beside lodestone 5, then sheep 9 and wheat 8, then gold 8, ore 10, and a
 * volcano 4. Open sea to the east for ships and survey ships. Lodestone makes it a Cartographers map.
 */
const DESIGN = testDesign([
  '~ ~ ~ ~ ~ ~ ~ ~',
  ' ~ w6 m5 ~ ~ ~ ~ ~',
  '~ s9 h8 ~ ~ ~ ~ ~',
  ' ~ g8 o10 v4 ~ ~ ~@ ~',
  '~ ~ ~ ~ ~ ~ ~ ~',
]);

const act = (g: GameState, id: string, action: GameAction, random = seeded()) =>
  applyAction(g, id, action, random, TEST_NOW);
const hexOf = (g: GameState, terrain: Terrain): Hex => g.board.hexes.find(h => h.terrain === terrain)!;
/** Random source returning these values in turn (random dice use floor(v * 6) + 1). */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

/** Started game in the build phase with p0 to move. Pieces are placed directly. */
function building(): GameState {
  const g = inSeatOrder(act(seaLobby(DESIGN, 2), 'p0', { type: 'start' }));
  Object.assign(g, { phase: 'build', turn: 3, turnIndex: 0, setupIndex: 4, rollDeadline: null });
  g.settings.diceMode = 'random';
  return g;
}

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

/** Open sea edges (sea on both sides), the first `count` of them along the map. */
function seaEdges(g: GameState): string[] {
  const index = boardIndex(g.board);
  return g.board.edges
    .filter(e => {
      const hexes = index.edgeHexes.get(e.id)!;
      return hexes.length === 2 && hexes.every(h => h.terrain === 'sea' && h.id !== g.pirate);
    })
    .map(e => e.id);
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
    expect(up.pendingCharts).toEqual({});
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

  it('pay one card from each tile beside them, and the robber blocks its tile', () => {
    const { g, relay } = withRoadToRelay();
    const before = produce(structuredClone(g), 5).p0?.lodestone ?? 0;
    g.roads[relay.id] = 'p0';
    g.relays = [relay.id];
    expect((produce(structuredClone(g), 5).p0?.lodestone ?? 0) - before).toBe(1);
    const wood = produce(structuredClone(g), 6).p0?.wood ?? 0;
    g.robber = hexOf(g, 'lodestone').id;
    expect(produce(structuredClone(g), 5).p0?.lodestone ?? 0).toBe(0);
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
  it('upgrade your ship out at sea for 2 lodestone and 1 ore, score a point, and stay put', () => {
    const g = building();
    const [edgeId] = seaEdges(g);
    g.ships[edgeId!] = 'p0';
    grant(g, 'p0', { lodestone: 2, ore: 1 });
    expect(getView(g, 'p0').legal.surveys).toEqual([edgeId]);
    const next = act(g, 'p0', { type: 'build-survey', edgeId: edgeId! });
    expect(next.surveys).toEqual([edgeId]);
    expect(victoryPoints(next, 'p0')).toBe(victoryPoints(g, 'p0') + 1);
    expect(pieceCounts(next, 'p0')).toMatchObject({ ships: 0, surveys: 1 });
    expect(getView(next, 'p0').legal.shipMoves[edgeId!]).toBeUndefined();
    expect(conserved(next)).toBe(true);
  });

  it('no two survey ships, anyone’s, border the same tile', () => {
    const g = building();
    const index = boardIndex(g.board);
    const [first, ...rest] = seaEdges(g);
    const tiles = index.edgeHexes.get(first!)!;
    const near = rest.find(id => index.edgeHexes.get(id)!.some(h => tiles.includes(h)))!;
    const far = rest.find(id => !index.edgeHexes.get(id)!.some(h => tiles.includes(h)))!;
    g.ships[first!] = 'p1';
    g.surveys = [first!];
    g.ships[near] = 'p0';
    g.ships[far] = 'p0';
    grant(g, 'p0', { lodestone: 2, ore: 1 });
    expect(getView(g, 'p0').legal.surveys).toEqual([far]);
  });
});

describe('charting', () => {
  it('steps one number at a time toward 7, then adds a 2 or 12, up to three numbers', () => {
    expect(chartedNumbers([5], true)).toEqual([6]);
    expect(chartedNumbers([12], true)).toEqual([11]);
    expect(chartedNumbers([9], false)).toEqual([8]);
    expect(chartedNumbers([6], true)).toEqual([6, 2]);
    expect(chartedNumbers([6], false)).toEqual([6, 12]);
    expect(chartedNumbers([6, 2], true)).toEqual([6, 3]);
    expect(chartedNumbers([8, 12], true)).toEqual([8, 11]);
    expect(chartedNumbers([6, 5], true)).toEqual([6, 6]);
    expect(chartedNumbers([6, 8], false)).toEqual([6, 8, 12]);
    expect(chartedNumbers([6, 6, 8], true)).toBeNull();
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

  it('after a 7 and the robber, everyone with survey ships charts, one tile per ship', () => {
    let g = building();
    const [a, b] = seaEdges(g).filter((id, i, all) => {
      const index = boardIndex(g.board);
      return i === 0 || !index.edgeHexes.get(id)!.some(h => index.edgeHexes.get(all[0]!)!.includes(h));
    });
    g.ships[a!] = 'p1';
    g.ships[b!] = 'p1';
    g.surveys = [a!, b!];
    g.phase = 'roll';
    const lode = hexOf(g, 'lodestone');
    // Random dice: 0.4 → 3 and 0.55 → 4.
    g = act(g, 'p0', { type: 'roll' }, sequence(0.4, 0.55));
    expect(g.dice).toEqual([3, 4]);
    expect(g.pendingCharts).toEqual({ p1: 2 });
    // Tiles show during the robber, so a choice can be lined up; it's sent once charting opens.
    expect(getView(g, 'p1').legal.chartHexes).toContain(lode.id);
    expect(() => act(g, 'p1', { type: 'chart-hexes', hexIds: [lode.id] })).toThrow(/not available/);
    g = act(g, 'p0', { type: 'move-robber', hexId: hexOf(g, 'ore').id });
    expect(g.phase).toBe('charting');
    expect(g.chartDeadline).toBe(TEST_NOW + 30_000);
    expect(() => act(g, 'p1', { type: 'chart-hexes', hexIds: [lode.id, lode.id, lode.id] })).toThrow(/up to 2/);
    g = act(g, 'p1', { type: 'chart-hexes', hexIds: [lode.id, lode.id] }, sequence(0.2));
    expect(hexNumbers(g.board.hexes.find(h => h.id === lode.id)!)).toEqual([6, 2]);
    expect(g.phase).toBe('build');
    expect(g.log.filter(l => l.event?.kind === 'chart')).toHaveLength(2);
  });

  it('a room can keep gold fields and volcanoes from being charted', () => {
    const g = building();
    g.pendingCharts = { p1: 1 };
    g.settings.chartSpecial = true;
    const hexes = getView(g, 'p1').legal.chartHexes;
    expect(hexes).toContain(hexOf(g, 'gold').id);
    g.settings.chartSpecial = false;
    const plain = getView(g, 'p1').legal.chartHexes;
    expect(plain).not.toContain(hexOf(g, 'gold').id);
    expect(plain).not.toContain(hexOf(g, 'volcano').id);
    expect(plain).toContain(hexOf(g, 'wheat').id);
  });

  it('when charting time runs out, people who have not charted pass', () => {
    let g = building();
    g.phase = 'charting';
    g.pendingCharts = { p0: 1, p1: 1 };
    g.chartDeadline = TEST_NOW + 1000;
    const numbers = g.board.hexes.map(hexNumbers);
    g = advanceTime(g, TEST_NOW + 1000, seeded());
    expect(g.phase).toBe('build');
    expect(g.board.hexes.map(hexNumbers)).toEqual(numbers);
  });

  it('bots chart a tile they earn from', () => {
    let g = building();
    g.players[1]!.bot = 'beginner';
    const lode = hexOf(g, 'lodestone');
    g.buildings[lode.vertexIds[0]!] = { playerId: 'p1', kind: 'settlement' };
    g.phase = 'charting';
    g.pendingCharts = { p1: 1 };
    g.chartDeadline = TEST_NOW + 30_000;
    g.updatedAt = TEST_NOW;
    g = advanceTime(g, TEST_NOW + 5000, seeded());
    expect(g.phase).toBe('build');
    expect(g.log.at(-1)?.event).toMatchObject({ kind: 'chart', playerId: 'p1' });
  });
});

describe('bots on Cartographers maps', () => {
  for (const id of ['compass-sea', 'magnetic-north']) {
    it(`${id} plays to the end with relay stations and survey ships`, () => {
      const design = BUILTIN_BOARDS.find(b => b.id === id)!;
      const levels =
        id === 'magnetic-north'
          ? (['advanced', 'intermediate', 'beginner', 'advanced', 'intermediate'] as const)
          : (['advanced', 'intermediate', 'beginner'] as const);
      let built = 0;
      for (const seed of [1, 2, 3]) {
        const g = playBotGame([...levels], seed, 8000, design);
        expect(g.phase).toBe('finished');
        built += Object.values(g.stats).reduce((n, s) => n + (s.built.relay ?? 0) + (s.built.survey ?? 0), 0);
      }
      expect(built).toBeGreaterThan(0);
    });
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
