import { describe, expect, it } from 'vitest';
import { applyAction, getActivePlayerId, getView, normalizeGame } from '../shared/engine';
import { discoverySupply } from '../shared/engine/core';
import { sinkShip } from '../shared/engine/production';
import { BUILTIN_BOARDS } from '../shared/maps';
import { longestRoad, victoryPoints } from '../shared/rules';
import { ERUPTION_CORNER, isRoadEdge, isShipEdge } from '../shared/seafaring';
import type { GameAction, GameState, Terrain } from '../shared/types';
import { playBotGame } from './bot-harness';
import { conserved, edgeBetween, grant, seaLobby, seeded, TEST_NOW, testDesign } from './fixtures';

/**
 * Two islands. Home island (left): wood 6, brick 5, sheep 9, ore 10, gold 8, volcano 4, jungle 11.
 * East isle: wheat 3, worth 2 bonus points, closed to setup settlements.
 */
const DESIGN = testDesign([
  '~ ~ ~ ~ ~ ~ ~',
  ' ~ w6 b5 ~ ~ h3*! ~',
  '~ s9 o10 ~ ~ h3 ~',
  ' ~ g8 v4 j11 ~@ ~ ~',
  '~ ~ ~ ~ ~ ~ ~',
]);

const act = (g: GameState, id: string, action: GameAction, random = seeded()) =>
  applyAction(g, id, action, random, TEST_NOW);
const hexOf = (g: GameState, terrain: Terrain) => g.board.hexes.find(h => h.terrain === terrain)!;
/** Random source returning these values in turn (dice use floor(v * 6) + 1). */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

/** Started game in the build phase with p0 to move. Buildings placed directly. */
function building(setup: (g: GameState) => void = () => {}): GameState {
  const g = act(seaLobby(DESIGN, 2), 'p0', { type: 'start' });
  Object.assign(g, { phase: 'build', turn: 3, turnIndex: 0, setupIndex: 4, rollDeadline: null });
  setup(g);
  return g;
}

describe('choosing a map', () => {
  it('builds the designed board, sets 13 points, and returns to the standard island', () => {
    const g = seaLobby(DESIGN);
    expect(g.board.hexes.some(h => h.terrain === 'sea')).toBe(true);
    expect(g.settings.victoryPoints).toBe(13);
    expect(getView(g, 'p1').map).toMatchObject({ id: 'test-map', name: 'Test map' });
    expect(getView(g, 'p1').seafaring).toBe(true);
    expect(g.pirate).toBe(g.board.hexes.find(h => h.terrain === 'sea' && h.id === g.pirate)?.id);
    const base = act(g, 'p0', { type: 'choose-map', mapId: 'base' });
    expect(base.board.hexes).toHaveLength(19);
    expect(base.settings.victoryPoints).toBe(10);
    expect(getView(base, 'p0').seafaring).toBe(false);
  });

  it('only the host may choose, and only a map the server supplied', () => {
    const g = seaLobby(DESIGN);
    expect(() => applyAction(g, 'p1', { type: 'choose-map', mapId: 'base' })).toThrow(/host/);
    expect(() => act(g, 'p0', { type: 'choose-map', mapId: 'other' })).toThrow(/not available/);
  });

  it('play again draws the same map again', () => {
    const g = building();
    g.phase = 'finished';
    const again = act(g, 'p0', { type: 'play-again' });
    expect(again.map?.id).toBe('test-map');
    expect(again.board.hexes.filter(h => h.terrain === 'sea').length).toBeGreaterThan(5);
  });
});

describe('setup on sea maps', () => {
  it('keeps setup settlements off closed islands and lets the second piece be a ship', () => {
    let g = act(seaLobby(DESIGN, 2), 'p0', { type: 'start' });
    const closed = g.board.hexes.find(h => h.noSetup)!;
    expect(() => act(g, 'p0', { type: 'place-settlement', vertexId: closed.vertexIds[0]! })).toThrow();
    const coastal = hexOf(g, 'wood').vertexIds[4]!; // top corner touches the sea
    g = act(g, 'p0', { type: 'place-settlement', vertexId: coastal });
    const legal = getView(g, 'p0').legal;
    expect(legal.ships.length).toBeGreaterThan(0);
    expect(legal.roads.length).toBeGreaterThan(0);
    g = act(g, 'p0', { type: 'place-ship', edgeId: legal.ships[0]! });
    expect(g.ships[legal.ships[0]!]).toBe('p0');
    expect(g.phase).toBe('setup-settlement');
    expect(getActivePlayerId(g)).toBe('p1');
  });
});

describe('ships', () => {
  const home = (g: GameState) => hexOf(g, 'wood').vertexIds[4]!;

  it('cost lumber and wool and must connect to your settlement or ship', () => {
    let g = building(g => {
      g.buildings[home(g)] = { playerId: 'p0', kind: 'settlement' };
      grant(g, 'p0', { wood: 2, sheep: 2 });
    });
    const legal = getView(g, 'p0').legal.ships;
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.every(id => isShipEdge(g.board, id))).toBe(true);
    g = act(g, 'p0', { type: 'build-ship', edgeId: legal[0]! });
    expect(g.players[0]!.resources).toMatchObject({ wood: 1, sheep: 1 });
    const next = getView(g, 'p0').legal.ships;
    expect(next.some(id => !legal.includes(id))).toBe(true);
    expect(conserved(g)).toBe(true);
  });

  it.each([
    ['anywhere', true],
    ['settlement', false],
  ] as const)('continue from the end of a road when roads meet ships %s: %s', (routeLinks, continues) => {
    const g = building(g => {
      g.settings.routeLinks = routeLinks;
      const wood = hexOf(g, 'wood');
      g.buildings[wood.vertexIds[1]!] = { playerId: 'p0', kind: 'settlement' };
      // A road from the bottom corner up to the top-left corner; its far end touches the sea.
      g.roads[edgeBetween(g, wood.vertexIds[2]!, wood.vertexIds[1]!)] = 'p0';
      g.roads[edgeBetween(g, wood.vertexIds[3]!, wood.vertexIds[2]!)] = 'p0';
      grant(g, 'p0', { wood: 2, sheep: 2 });
    });
    const tip = hexOf(g, 'wood').vertexIds[3]!;
    const fromTip = getView(g, 'p0').legal.ships.some(id => {
      const edge = g.board.edges.find(e => e.id === id)!;
      return edge.a === tip || edge.b === tip;
    });
    expect(fromTip).toBe(continues);
  });

  it('move one open-ended ship per turn, not one built this turn, and never beside the pirate', () => {
    let g = building(g => {
      g.buildings[home(g)] = { playerId: 'p0', kind: 'settlement' };
      grant(g, 'p0', { wood: 3, sheep: 3 });
    });
    g = act(g, 'p0', { type: 'build-ship', edgeId: getView(g, 'p0').legal.ships[0]! });
    const ship = Object.keys(g.ships)[0]!;
    expect(getView(g, 'p0').legal.shipMoves[ship]).toBeUndefined();
    g.shipsBuilt = [];
    const targets = getView(g, 'p0').legal.shipMoves[ship]!;
    expect(targets.length).toBeGreaterThan(0);
    g = act(g, 'p0', { type: 'move-ship', from: ship, to: targets[0]! });
    expect(g.ships[ship]).toBeUndefined();
    expect(g.ships[targets[0]!]).toBe('p0');
    expect(() => act(g, 'p0', { type: 'move-ship', from: targets[0]!, to: ship })).toThrow(/one ship/);
    // The pirate next to an edge blocks building there.
    const blocked = getView(g, 'p0').legal.ships[0]!;
    const sea = g.board.hexes.find(
      h =>
        h.terrain === 'sea' &&
        g.board.edges.find(e => e.id === blocked && h.vertexIds.includes(e.a) && h.vertexIds.includes(e.b)),
    )!;
    g.pirate = sea.id;
    expect(getView(g, 'p0').legal.ships).not.toContain(blocked);
  });
});

describe('pirate', () => {
  it('a 7 can move the pirate onto open sea and steal from a ship owner there', () => {
    let g = building(g => {
      g.buildings[home(g)] = { playerId: 'p1', kind: 'settlement' };
      grant(g, 'p1', { wood: 2, sheep: 2, ore: 1 });
    });
    function home(g: GameState) {
      return hexOf(g, 'wood').vertexIds[4]!;
    }
    g.turnIndex = 1;
    g = act(g, 'p1', { type: 'build-ship', edgeId: getView(g, 'p1').legal.ships[0]! });
    const ship = Object.keys(g.ships)[0]!;
    g.turnIndex = 0;
    g.phase = 'robber';
    const sea = g.board.hexes.find(
      h =>
        h.terrain === 'sea' &&
        h.id !== g.pirate &&
        g.board.edges.some(e => e.id === ship && h.vertexIds.includes(e.a) && h.vertexIds.includes(e.b)),
    )!;
    expect(getView(g, 'p0').legal.robberHexes).toContain(sea.id);
    g = act(g, 'p0', { type: 'move-robber', hexId: sea.id });
    expect(g.pirate).toBe(sea.id);
    expect(g.robber).not.toBe(sea.id);
    expect(g.players[0]!.resources.wood + g.players[0]!.resources.sheep + g.players[0]!.resources.ore).toBe(1);
  });
});

describe('gold, volcanoes, and jungles', () => {
  it('gold pays a resource of the owner’s choice before building', () => {
    let g = building(g => {
      g.buildings[hexOf(g, 'gold').vertexIds[0]!] = { playerId: 'p1', kind: 'city' };
    });
    g.phase = 'roll';
    g = act(g, 'p0', { type: 'roll' }, sequence(0.5, 0.5)); // 4 + 4
    expect(g.phase).toBe('gold');
    expect(g.pendingGold).toEqual({ p1: 2 });
    expect(getView(g, 'p1').pendingGold.p1).toBe(2);
    expect(() =>
      act(g, 'p1', { type: 'choose-gold', resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 1, lodestone: 0 } }),
    ).toThrow(/exactly 2/);
    g = act(g, 'p1', {
      type: 'choose-gold',
      resources: { wood: 0, brick: 0, sheep: 0, wheat: 1, ore: 1, lodestone: 0 },
    });
    expect(g.phase).toBe('build');
    expect(g.players[1]!.resources).toMatchObject({ wheat: 1, ore: 1 });
    expect(conserved(g)).toBe(true);
  });

  it('a volcano erupts toward the corner its die names', () => {
    let g = building(g => {
      const volcano = hexOf(g, 'volcano');
      g.buildings[volcano.vertexIds[ERUPTION_CORNER[1]]!] = { playerId: 'p1', kind: 'city' };
      g.settings.volcanoDice = 'random'; // a plain die, so the sequence below names the corner
    });
    g.phase = 'roll';
    g = act(g, 'p0', { type: 'roll' }, sequence(0.2, 0.2)); // 2 + 2
    // Gold from the volcano is chosen first; then the roller rolls the eruption die.
    expect(g.phase).toBe('gold');
    expect(g.pendingGold.p1).toBe(2);
    expect(g.eruption).toEqual([hexOf(g, 'volcano').id]);
    g = act(g, 'p1', {
      type: 'choose-gold',
      resources: { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0, lodestone: 0 },
    });
    expect(g.phase).toBe('eruption');
    expect(() => act(g, 'p0', { type: 'end-turn' })).toThrow();
    g = act(g, 'p0', { type: 'roll-volcanoes' }, sequence(0.2)); // die 2
    const vertex = hexOf(g, 'volcano').vertexIds[ERUPTION_CORNER[1]]!;
    expect(g.buildings[vertex]).toEqual({ playerId: 'p1', kind: 'settlement' });
    expect(g.log.some(l => l.event?.kind === 'eruption' && l.event.damage === 'city')).toBe(true);
    expect(g.phase).toBe('build');
  });

  it('a volcano nobody lives beside stays quiet', () => {
    let g = building(g => {
      const volcano = hexOf(g, 'volcano');
      for (const id of volcano.vertexIds) delete g.buildings[id];
    });
    g.phase = 'roll';
    g = act(g, 'p0', { type: 'roll' }, sequence(0.2, 0.2)); // 2 + 2, the volcano's number
    expect(g.eruption).toBeNull();
    expect(g.phase).toBe('build');
    expect(g.log.some(l => l.event?.kind === 'eruption')).toBe(false);
  });

  it('jungles give discoveries that pay for development cards', () => {
    let g = building(g => {
      g.buildings[hexOf(g, 'jungle').vertexIds[1]!] = { playerId: 'p0', kind: 'city' };
    });
    g.phase = 'roll';
    g = act(g, 'p0', { type: 'roll' }, sequence(0.7, 0.9)); // 5 + 6
    expect(g.players[0]!.discoveries).toBe(2);
    grant(g, 'p0', { ore: 1 });
    g = act(g, 'p0', { type: 'buy-development' });
    expect(g.players[0]!.development).toHaveLength(1);
    expect(g.players[0]!.discoveries).toBe(0);
    expect(g.players[0]!.resources.ore).toBe(0);
    expect(getView(g, 'p1').players[0]!.discoveries).toBe(0);
  });

  it('discoveries come from a supply of 12 (15 for 5–6 players), which spent ones go back to', () => {
    let g = building(g => {
      g.buildings[hexOf(g, 'jungle').vertexIds[1]!] = { playerId: 'p0', kind: 'city' };
      g.settings.showBank = 'always';
    });
    expect(discoverySupply(4)).toBe(12);
    expect(discoverySupply(5)).toBe(15);
    g.players[1]!.discoveries = 11;
    expect(getView(g, 'p0').discoveryBank).toBe(1);
    g.phase = 'roll';
    g = act(g, 'p0', { type: 'roll' }, sequence(0.7, 0.9)); // 5 + 6: a city owed 2, only 1 left
    expect(g.players[0]!.discoveries).toBe(1);
    expect(getView(g, 'p0').discoveryBank).toBe(0);
    expect(getView(g, 'p0').discoveryInSupply).toBe(false);
    grant(g, 'p0', { wheat: 1, ore: 1 });
    g = act(g, 'p0', { type: 'buy-development' });
    expect(getView(g, 'p0').discoveryBank).toBe(1);
  });
});

describe('islands and the trade route', () => {
  it('the first settlement on a new island earns its bonus once', () => {
    const g = building();
    const east = g.board.hexes.filter(h => h.island === g.board.hexes.find(x => x.noSetup)!.island);
    const top = east[0]!.vertexIds[4]!;
    g.ships[g.board.vertices.find(v => v.id === top)!.edgeIds.find(id => isShipEdge(g.board, id))!] = 'p0';
    grant(g, 'p0', { wood: 2, brick: 2, sheep: 2, wheat: 2 });
    const before = victoryPoints(g, 'p0');
    const next = act(g, 'p0', { type: 'build-settlement', vertexId: top });
    expect(next.bonusPoints.p0).toBe(2);
    expect(victoryPoints(next, 'p0')).toBe(before + 3);
    expect(getView(next, 'p1').players[0]!.publicPoints).toBe(3);
  });

  /**
   * p0's settlement on the shore, a ship along the forest's coast to the next shore corner (`tip`),
   * and `roadEdge`, the land–land edge from that corner (it only takes a road).
   */
  function shipToShore(routeLinks: GameState['settings']['routeLinks']) {
    const g = building(g => {
      g.settings.routeLinks = routeLinks;
    });
    const terrain = new Map(g.board.hexes.map(h => [h.id, h.terrain]));
    const tip = g.board.vertices.find(
      v =>
        v.hexIds.length === 3 &&
        v.hexIds.filter(id => terrain.get(id) === 'sea').length === 1 &&
        v.hexIds.some(id => terrain.get(id) === 'wood'),
    )!;
    const roadEdge = tip.edgeIds.find(id => isRoadEdge(g.board, id) && !isShipEdge(g.board, id))!;
    const shipEdge = tip.edgeIds.find(id => isShipEdge(g.board, id))!;
    const edge = g.board.edges.find(e => e.id === shipEdge)!;
    g.buildings[edge.a === tip.id ? edge.b : edge.a] = { playerId: 'p0', kind: 'settlement' };
    g.ships[shipEdge] = 'p0';
    g.shipsBuilt = [];
    g.pirate = null;
    grant(g, 'p0', { wood: 1, brick: 1 });
    return { g, tip: tip.id, roadEdge, shipEdge };
  }

  it('by default a road may start from the end of a ship', () => {
    const { g, roadEdge } = shipToShore('anywhere');
    expect(getView(g, 'p0').legal.roads).toContain(roadEdge);
  });

  it("under the published rule a road can't start from the end of a ship", () => {
    const { g, tip, roadEdge } = shipToShore('settlement');
    expect(getView(g, 'p0').legal.roads).not.toContain(roadEdge);
    g.buildings[tip] = { playerId: 'p0', kind: 'settlement' };
    expect(getView(g, 'p0').legal.roads).toContain(roadEdge);
  });

  it.each([
    ['anywhere', false],
    ['settlement', true],
  ] as const)('a ship whose far end meets your road may move (roads meet ships %s): %s', (routeLinks, moves) => {
    const { g, roadEdge, shipEdge } = shipToShore(routeLinks);
    g.roads[roadEdge] = 'p0';
    expect(shipEdge in getView(g, 'p0').legal.shipMoves).toBe(moves);
  });

  it.each([
    ['anywhere', 2],
    ['settlement', 1],
  ] as const)('a road and a ship count as one route without a settlement between (%s): %s', (routeLinks, length) => {
    const g = building(g => {
      g.settings.routeLinks = routeLinks;
    });
    const wood = hexOf(g, 'wood');
    const [a, b, c] = [wood.vertexIds[2]!, wood.vertexIds[3]!, wood.vertexIds[4]!];
    g.roads[edgeBetween(g, a, b)] = 'p0';
    g.ships[edgeBetween(g, b, c)] = 'p0';
    expect(longestRoad(g, 'p0')).toBe(length);
    g.buildings[b] = { playerId: 'p0', kind: 'settlement' };
    expect(longestRoad(g, 'p0')).toBe(2);
  });

  it('by default a ship joined to your settlement through a road is not stranded when another sinks', () => {
    const { g, tip, roadEdge, shipEdge } = shipToShore('anywhere');
    g.roads[roadEdge] = 'p0';
    // The road leads inland to another of p0's settlements.
    const road = g.board.edges.find(e => e.id === roadEdge)!;
    g.buildings[road.a === tip ? road.b : road.a] = { playerId: 'p0', kind: 'settlement' };
    // A second ship out from the tip; sinking the first leaves it joined through the road only.
    const next = g.board.vertices
      .find(v => v.id === tip)!
      .edgeIds.find(id => id !== shipEdge && isShipEdge(g.board, id))!;
    g.ships[next] = 'p0';
    sinkShip(g, shipEdge);
    expect(g.ships[shipEdge]).toBeUndefined();
    expect(g.ships[next]).toBe('p0');
  });
});

describe('stored rooms', () => {
  it('rooms saved before sea maps load with the new fields', () => {
    const g = building() as unknown as Record<string, unknown>;
    for (const key of [
      'ships',
      'pirate',
      'stealHex',
      'pendingGold',
      'shipsBuilt',
      'shipMoved',
      'islands',
      'bonusPoints',
      'design',
      'map',
    ])
      delete g[key];
    g.schemaVersion = 1;
    for (const p of g.players as Record<string, unknown>[]) delete p.discoveries;
    const loaded = normalizeGame(g as unknown as GameState, TEST_NOW, seeded());
    expect(loaded.ships).toEqual({});
    expect(loaded.players[0]!.discoveries).toBe(0);
    expect(getView(loaded, 'p0').legal.ships).toBeDefined();
  });
});

describe('bots on the built-in maps', () => {
  const shipsBuilt: number[] = [];
  it.each(BUILTIN_BOARDS.map(b => [b.id, b] as const))(
    '%s plays to the end',
    (_, design) => {
      const levels = ['advanced', 'intermediate', 'beginner'] as const;
      const g = playBotGame([...levels], 7, 8000, design);
      expect(g.phase).toBe('finished');
      shipsBuilt.push(Object.keys(g.ships).length);
    },
    30_000,
  );
  it('bots sail on most maps', () => {
    expect(shipsBuilt.filter(n => n > 0).length).toBeGreaterThanOrEqual(Math.ceil(BUILTIN_BOARDS.length / 2));
  });
});
