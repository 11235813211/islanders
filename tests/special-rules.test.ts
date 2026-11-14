import { describe, expect, it } from 'vitest';
import { applyAction, getActivePlayerId, getView, normalizeGame } from '../shared/engine';
import { resourceCount } from '../shared/engine/core';
import { type BoardDesign, parseDesign, roundForward, setupSequence, specialRules, tileKey } from '../shared/maps';
import { routeFinished } from '../shared/maps/special';
import {
  inRouteZone,
  paintRoute,
  removeRoute,
  routeWarnings,
  setRouteGoal,
  setSetupPieces,
} from '../shared/maps/special-edit';
import type { GameAction, GameState } from '../shared/types';
import { playBotGame } from './bot-harness';
import { grant, inSeatOrder, seaLobby, seeded, TEST_NOW, testDesign } from './fixtures';

/** Map special rules: setup pieces and order, piece rewards, and routes. */

/** One island of fixed land, three rows: the left tile of the top row, its row, and the far right tile. */
function island(extra: Partial<BoardDesign> = {}): BoardDesign {
  return testDesign(
    ['~ ~ ~ ~ ~ ~ ~', ' ~ w6 s5 h4 o3 ~ ~', '~ b8 w9 s10 h11 o2 ~', ' ~ b6 w5 s4 h3 ~ ~', '~ ~ ~ ~ ~ ~ ~'],
    extra,
  );
}
const land = (design: BoardDesign) => design.tiles.filter(t => t.kind !== 'sea');
const keyOf = (t: { q: number; r: number }) => tileKey(t.q, t.r);

/** Start a game on `design` with seats p0, p1, … in order. */
function started(design: BoardDesign, players = 2): GameState {
  return inSeatOrder(applyAction(seaLobby(design, players), 'p0', { type: 'start' }, seeded(), TEST_NOW));
}

/** Play out setup, each seat taking `pick` of its legal corners and the first road. */
function finishSetup(game: GameState, pick: (sites: string[], id: string) => string = s => s[0]!): GameState {
  while (game.phase.startsWith('setup')) {
    const id = getActivePlayerId(game)!;
    const legal = getView(game, id).legal;
    const action: GameAction =
      game.phase === 'setup-settlement'
        ? { type: 'place-settlement', vertexId: pick(legal.settlements, id) }
        : { type: 'place-road', edgeId: legal.roads[0]! };
    game = applyAction(game, id, action, seeded(), TEST_NOW);
  }
  return game;
}

/** Tile keys a corner touches. */
function cornerTiles(game: GameState, vertexId: string): string[] {
  const v = game.board.vertices.find(x => x.id === vertexId)!;
  return v.hexIds.map(id => keyOf(game.board.hexes.find(h => h.id === id)!));
}

describe('setup order', () => {
  it('follows forward, back, back, forward rounds', () => {
    expect([0, 1, 2, 3].map(roundForward)).toEqual([true, false, false, true]);
    expect(setupSequence(['a', 'b', 'c'], 2)).toEqual(['a', 'b', 'c', 'c', 'b', 'a']);
    expect(setupSequence(['a', 'b', 'c'], 3)).toEqual(['a', 'b', 'c', 'c', 'b', 'a', 'c', 'b', 'a']);
  });

  it('gives every seat the same total of pick positions over four rounds', () => {
    for (const seats of [2, 3, 4, 5, 6]) {
      const ids = Array.from({ length: seats }, (_, i) => `p${i}`);
      const order = setupSequence(ids, 4);
      const totals = ids.map(id => order.reduce((n, who, i) => n + (who === id ? i : 0), 0));
      expect(new Set(totals).size).toBe(1);
    }
  });
});

describe('setup pieces', () => {
  it('places a city in the round that asks for one; only the last round collects cards', () => {
    const game = finishSetup(started(island({ setupPieces: ['settlement', 'city'] })));
    expect(game.phase).toBe('roll');
    for (const id of ['p0', 'p1']) {
      const kinds = Object.values(game.buildings)
        .filter(b => b.playerId === id)
        .map(b => b.kind)
        .sort();
      expect(kinds).toEqual(['city', 'settlement']);
      expect(getView(game, id).players.find(p => p.id === id)!.points).toBe(3);
    }
    // The city came second, and it alone collected: at most three tiles, one card each.
    for (const p of game.players) expect(resourceCount(p.resources)).toBeLessThanOrEqual(3);
  });

  it('three rounds place three pieces each, in the fair order, and only the third collects', () => {
    let game = started(island({ setupPieces: ['settlement', 'settlement', 'settlement'] }), 3);
    expect(game.setupOrder).toEqual(setupSequence(['p0', 'p1', 'p2'], 3));
    expect(getView(game, 'p1').setupOrder).toEqual(game.setupOrder);
    let collected = 0;
    while (game.phase.startsWith('setup')) {
      const id = getActivePlayerId(game)!;
      const before = resourceCount(game.players.find(p => p.id === id)!.resources);
      const legal = getView(game, id).legal;
      const round = Math.floor(game.setupIndex / 3);
      game = applyAction(
        game,
        id,
        game.phase === 'setup-settlement'
          ? { type: 'place-settlement', vertexId: legal.settlements[0]! }
          : { type: 'place-road', edgeId: legal.roads[0]! },
        seeded(),
        TEST_NOW,
      );
      const gained = resourceCount(game.players.find(p => p.id === id)!.resources) - before;
      if (round < 2) expect(gained).toBe(0);
      collected += gained;
    }
    expect(collected).toBeGreaterThan(0);
    for (const id of ['p0', 'p1', 'p2'])
      expect(Object.values(game.buildings).filter(b => b.playerId === id)).toHaveLength(3);
  });
});

describe('piece rewards', () => {
  it('adds pieces at the set points, logs them, and keeps them after points drop', () => {
    const reward = { points: 3, settlements: 1, cities: 2, roads: 3 };
    let game = finishSetup(started(island({ pieceRewards: [reward] })));
    const before = getView(game, 'p0').players.find(p => p.id === 'p0')!;
    expect(before.citiesLeft).toBe(4);
    game.phase = 'build';
    grant(game, 'p0', { wheat: 2, ore: 3 });
    const site = Object.entries(game.buildings).find(([, b]) => b.playerId === 'p0')![0];
    game = applyAction(game, 'p0', { type: 'build-city', vertexId: site }, seeded(), TEST_NOW);
    const after = getView(game, 'p0').players.find(p => p.id === 'p0')!;
    expect(after.peakPoints).toBe(3);
    expect(after.citiesLeft).toBe(4 - 1 + 2);
    expect(after.settlementsLeft).toBe(5 - 1 + 1);
    expect(after.roadsLeft).toBe(15 - 2 + 3);
    expect(after.shipsLeft).toBe(15 + 3);
    expect(game.log.some(l => l.text.includes('reached 3 points: +1 settlement, +2 cities, +3 roads'))).toBe(true);
    // Losing the city (an eruption, say) does not take the reward back.
    game.buildings[site] = { playerId: 'p0', kind: 'settlement' };
    game = applyAction(game, 'p0', { type: 'end-turn' }, seeded(), TEST_NOW);
    expect(getView(game, 'p0').players.find(p => p.id === 'p0')!.citiesLeft).toBe(4 + 2);
  });

  it('lets a board play to more points than the usual pieces allow', () => {
    const rewards = [{ points: 10, settlements: 3, cities: 3, roads: 5 }];
    const design = island({ victoryPoints: 30, pieceRewards: rewards });
    expect(parseDesign(design, ['seafaring']).pieceRewards).toEqual(rewards);
    expect(parseDesign(design, ['seafaring']).victoryPoints).toBe(30);
  });
});

/** A route on the island: start at the top-left tile, second anywhere on the top row, finish at the bottom right. */
function routeDesign(goal: BoardDesign['routeGoal']): BoardDesign {
  const base = island();
  const tiles = land(base);
  const top = tiles.filter(t => t.r === Math.min(...tiles.map(x => x.r)));
  const bottom = tiles.filter(t => t.r === Math.max(...tiles.map(x => x.r)));
  const finish = bottom.sort((a, b) => b.q - a.q)[0]!;
  const start = top.sort((a, b) => a.q - b.q)[0]!;
  return {
    ...base,
    routes: [{ start: [keyOf(start)], next: top.map(keyOf), finish: [keyOf(finish)] }],
    routeGoal: goal,
  };
}

describe('routes', () => {
  it('keeps starting settlements to the route: one in its start, another in its second area', () => {
    const design = routeDesign({ required: true, points: 0 });
    const route = design.routes![0]!;
    const zone = new Set([...route.start, ...route.next]);
    let game = started(design);
    const first = getView(game, 'p0').legal.settlements;
    expect(first.length).toBeGreaterThan(0);
    for (const v of first) expect(cornerTiles(game, v).some(k => zone.has(k))).toBe(true);
    // p0 takes a second-area corner off the start tile, so its next must touch the start tile.
    const off = first.find(v => !cornerTiles(game, v).some(k => route.start.includes(k)))!;
    game = applyAction(game, 'p0', { type: 'place-settlement', vertexId: off }, seeded(), TEST_NOW);
    game = applyAction(
      game,
      'p0',
      { type: 'place-road', edgeId: getView(game, 'p0').legal.roads[0]! },
      seeded(),
      TEST_NOW,
    );
    game = finishSetup(game, (sites, id) => {
      if (id !== 'p0') return sites[sites.length - 1]!;
      for (const v of sites) expect(cornerTiles(game, v).some(k => route.start.includes(k))).toBe(true);
      return sites[0]!;
    });
    expect(game.routeOf.p0).toBe(0);
    const me = getView(game, 'p0').players.find(p => p.id === 'p0')!;
    expect(me.route).toBe(0);
    expect(me.routeDone).toBe(false);
  });

  it('a required route blocks the win until the player builds in the finish area', () => {
    let game = finishSetup(started(routeDesign({ required: true, points: 0 })));
    game.settings.victoryPoints = 3;
    game.phase = 'build';
    grant(game, 'p0', { wheat: 4, ore: 6 });
    const own = Object.entries(game.buildings).filter(([, b]) => b.playerId === 'p0');
    game = applyAction(game, 'p0', { type: 'build-city', vertexId: own[0]![0] }, seeded(), TEST_NOW);
    expect(game.phase).toBe('build');
    // A settlement in the finish area (placed directly; reaching it by road is ordinary building).
    const finish = game.board.rules!.routes![0]!.finish[0]!;
    const hex = game.board.hexes.find(h => keyOf(h) === finish)!;
    const free = hex.vertexIds.find(v => !game.buildings[v])!;
    game.buildings[free] = { playerId: 'p0', kind: 'settlement' };
    expect(getView(game, 'p0').players.find(p => p.id === 'p0')!.routeDone).toBe(true);
    game = applyAction(game, 'p0', { type: 'build-city', vertexId: own[1]![0] }, seeded(), TEST_NOW);
    expect(game.phase).toBe('finished');
    expect(game.winnerId).toBe('p0');
  });

  it('an optional route scores its points once the finish area is reached', () => {
    const game = finishSetup(started(routeDesign({ required: false, points: 3 })));
    const points = () => getView(game, 'p0').players.find(p => p.id === 'p0')!.publicPoints;
    const before = points();
    const finish = game.board.rules!.routes![0]!.finish[0]!;
    const hex = game.board.hexes.find(h => keyOf(h) === finish)!;
    game.buildings[hex.vertexIds.find(v => !game.buildings[v])!] = { playerId: 'p0', kind: 'settlement' };
    expect(points()).toBe(before + 1 + 3);
  });

  it('opens every corner when the route areas are full, so nobody is stuck', () => {
    const design = routeDesign({ required: false, points: 1 });
    let game = started(design);
    const route = design.routes![0]!;
    const zone = new Set([...route.start, ...route.next]);
    // Fill the route's corners with someone else's settlements.
    for (const v of game.board.vertices)
      if (cornerTiles(game, v.id).some(k => zone.has(k))) game.buildings[v.id] = { playerId: 'p1', kind: 'settlement' };
    const sites = getView(game, 'p0').legal.settlements;
    expect(sites.length).toBeGreaterThan(0);
    game = applyAction(game, 'p0', { type: 'place-settlement', vertexId: sites[0]! }, seeded(), TEST_NOW);
    expect(game.phase).toBe('setup-road');
  });

  it('validates and explains route rules', () => {
    const design = routeDesign({ required: true, points: 2 });
    const parsed = parseDesign(design, ['seafaring']);
    expect(parsed.routes).toEqual(design.routes);
    expect(parsed.routeGoal).toEqual({ required: true, points: 2 });
    expect(() => parseDesign({ ...design, routeGoal: { required: true, points: 9 } }, ['seafaring'])).toThrow();
    expect(() => parseDesign({ ...design, setupPieces: ['city'] }, ['seafaring'])).toThrow();
    const game = started(design);
    const titles = specialRules(game.board.rules).map(r => r.title);
    expect(titles).toEqual(['Route to finish']);
  });

  it('older stored rooms gain empty route and peak records', () => {
    const game = started(island()) as Partial<GameState>;
    delete game.routeOf;
    delete game.peakPoints;
    const upgraded = normalizeGame({ ...(game as GameState), schemaVersion: 20 }, TEST_NOW);
    expect(upgraded.routeOf).toEqual({});
    expect(upgraded.peakPoints).toEqual({});
  });
});

describe('editing special rules', () => {
  it('paints route areas on land only, toggles them off, and keeps an empty list when routes go', () => {
    const design = island();
    const [a, b] = land(design);
    const sea = design.tiles.find(t => t.kind === 'sea')!;
    const target = { route: 0, zone: 'finish' as const };
    let edited = paintRoute(design, target, [a!, b!, sea], true);
    expect(edited.routes![0]!.finish).toEqual([keyOf(a!), keyOf(b!)]);
    expect(inRouteZone(edited, target, a!.q, a!.r)).toBe(true);
    edited = paintRoute(edited, target, [a!], false);
    expect(edited.routes![0]!.finish).toEqual([keyOf(b!)]);
    expect(routeWarnings(edited)).toEqual(['The route needs Start, Second tiles. Until then it is left out.']);
    expect(removeRoute(edited, 0).routes).toEqual([]);
  });

  it('stores the usual two settlements as no setup rule', () => {
    const design = setSetupPieces(island(), ['settlement', 'city']);
    expect(design.setupPieces).toEqual(['settlement', 'city']);
    expect(setSetupPieces(design, ['settlement', 'settlement']).setupPieces).toBeUndefined();
    expect(setRouteGoal(design, { required: false, points: 0 }).routeGoal).toEqual({ required: false, points: 1 });
  });
});

/** A round island of random land with one route from its west end to its east end. */
function routeIsland(extra: Partial<BoardDesign> = {}): BoardDesign {
  const base = testDesign([
    '~ ~ ~ ~ ~ ~ ~',
    ' ~ ~ L L L ~ ~',
    '~ ~ L L L L ~',
    ' ~ L L L L L ~',
    '~ ~ L L L L ~',
    ' ~ ~ L L L ~ ~',
    '~ ~ ~ ~ ~ ~ ~',
  ]);
  const tiles = land(base);
  const x = (t: { q: number; r: number }) => t.q + t.r / 2;
  const west = Math.min(...tiles.map(x));
  const east = Math.max(...tiles.map(x));
  return {
    ...base,
    routes: [
      {
        start: tiles.filter(t => x(t) <= west + 0.5).map(keyOf),
        next: tiles.filter(t => x(t) <= west + 1.5).map(keyOf),
        finish: tiles.filter(t => x(t) >= east - 0.5).map(keyOf),
      },
    ],
    ...extra,
  };
}

describe('bots on maps with special rules', () => {
  it('finish a game with three setup rounds and a route needed to win', () => {
    const design = routeIsland({
      victoryPoints: 10,
      setupPieces: ['settlement', 'settlement', 'city'],
      routeGoal: { required: true, points: 1 },
    });
    const game = playBotGame(['advanced', 'intermediate', 'beginner'], 3, 9000, design);
    expect(game.phase).toBe('finished');
    expect(routeFinished(game.board, game.buildings, game.winnerId!, game.routeOf[game.winnerId!])).toBe(true);
    // Every seat's starting pieces covered the route.
    expect(Object.keys(game.routeOf).sort()).toEqual(['p0', 'p1', 'p2']);
  });

  it('build past the usual pieces with rewards and play to a high target', () => {
    const design = routeIsland({
      routes: [],
      victoryPoints: 16,
      pieceRewards: [{ points: 8, settlements: 2, cities: 3, roads: 5 }],
    });
    const game = playBotGame(['advanced', 'advanced', 'intermediate'], 5, 12000, design);
    expect(game.phase).toBe('finished');
    const winner = game.winnerId!;
    const pieces = Object.values(game.buildings).filter(b => b.playerId === winner);
    expect(pieces.filter(b => b.kind === 'city').length + pieces.length).toBeGreaterThan(9);
  });
});
