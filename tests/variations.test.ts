import { describe, expect, it } from 'vitest';
import { advanceTime, applyAction, getView } from '../shared/engine';
import { longestRoad } from '../shared/rules';
import { boardIndex, isShipEdge } from '../shared/seafaring';
import type { GameAction, GameState, Terrain } from '../shared/types';
import { corner, edgeBetween, grant, makeLobby, seaLobby, seeded, settled, TEST_NOW, testDesign } from './fixtures';

/**
 * Room variations (Seafarers on or off, volcano starts and dice, how ships move) and the
 * eruption and gold timing that go with them.
 */

const act = (g: GameState, id: string, action: GameAction, random = seeded()) =>
  applyAction(g, id, action, random, TEST_NOW);
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};
const hexOf = (g: GameState, terrain: Terrain) => g.board.hexes.find(h => h.terrain === terrain)!;

const ISLE = testDesign([
  '~ ~ ~ ~ ~ ~ ~ ~ ~',
  ' ~ w6 b5 ~ ~ ~ ~ ~ ~',
  '~ s9 o10 ~ ~ ~ ~ h3 ~',
  ' ~ g8 v4 j11 ~ ~ ~ ~ ~',
  '~ ~ ~ ~ ~ ~ ~ ~ ~',
]);

function building(setup: (g: GameState) => void = () => {}, settings: Partial<GameState['settings']> = {}) {
  let g = seaLobby(ISLE, 2);
  g = act(g, 'p0', { type: 'configure', settings: { ...g.settings, ...settings } });
  g = act(g, 'p0', { type: 'start' });
  Object.assign(g, { phase: 'build', turn: 3, turnIndex: 0, setupIndex: 4, rollDeadline: null });
  setup(g);
  return g;
}

describe('Seafarers as a variation', () => {
  it('sea maps start with it on; turned off, there are no ships or pirate', () => {
    const lobby = seaLobby(ISLE, 2);
    expect(lobby.settings.seafarers).toBe(true);
    const off = building(() => {}, { seafarers: false });
    expect(off.pirate).toBeNull();
    expect(getView(off, 'p0').seafaring).toBe(false);
    off.buildings[corner(off, 0, 1, 0)] = { playerId: 'p0', kind: 'settlement' };
    grant(off, 'p0', { wood: 1, sheep: 1 });
    expect(getView(off, 'p0').legal.ships).toEqual([]);
  });

  it('on the standard island it adds a ring of sea, so ships and the pirate play', () => {
    let g = makeLobby(2);
    g = act(g, 'p0', { type: 'configure', settings: { ...g.settings, seafarers: true } });
    g = act(g, 'p0', { type: 'start' });
    const land = g.board.hexes.filter(h => h.terrain !== 'sea');
    expect(land).toHaveLength(19);
    expect(g.board.hexes.length).toBeGreaterThan(19);
    expect(g.board.harbors).toHaveLength(9);
    expect(g.pirate).toBeNull();
    expect(
      getView({ ...g, phase: 'robber', turn: 1 }, 'p0').legal.robberHexes.some(
        id => boardIndex(g.board).hex.get(id)!.terrain === 'sea',
      ),
    ).toBe(true);
    expect(getView(g, 'p0').seafaring).toBe(true);
    // A setup settlement on the coast may be followed by a ship.
    const coastal = getView(g, 'p0').legal.settlements.find(id =>
      boardIndex(g.board)
        .vertex.get(id)!
        .hexIds.some(h => boardIndex(g.board).hex.get(h)!.terrain === 'sea'),
    )!;
    g = act(g, 'p0', { type: 'place-settlement', vertexId: coastal });
    expect(getView(g, 'p0').legal.ships.length).toBeGreaterThan(0);
    expect(g.board.edges.some(e => isShipEdge(g.board, e.id))).toBe(true);
  });

  it('a map with no pirate start puts the pirate on the sea farthest from land', () => {
    const g = building();
    const index = boardIndex(g.board);
    const pirate = index.hex.get(g.pirate!)!;
    const land = g.board.hexes.filter(h => h.terrain !== 'sea');
    const gap = (h: { x: number; y: number }) => Math.min(...land.map(l => Math.hypot(l.x - h.x, l.y - h.y)));
    for (const sea of g.board.hexes.filter(h => h.terrain === 'sea'))
      expect(gap(pirate)).toBeGreaterThanOrEqual(gap(sea));
  });
});

describe('eruptions', () => {
  it('the robber keeps its volcano from erupting', () => {
    let g = building(g => {
      g.robber = hexOf(g, 'volcano').id;
      g.phase = 'roll';
    });
    g = act(g, 'p0', { type: 'roll' }, sequence(0.2, 0.2)); // 2 + 2 = 4
    expect(g.eruption).toBeNull();
    expect(g.phase).toBe('build');
  });

  it('balanced volcano dice show all six faces before any repeats', () => {
    let g = building(() => {}, { volcanoDice: 'balanced' });
    const volcano = hexOf(g, 'volcano').id;
    const faces: number[] = [];
    for (let i = 0; i < 6; i++) {
      Object.assign(g, { phase: 'eruption', eruption: [volcano] });
      g = act(g, 'p0', { type: 'roll-volcanoes' }, seeded(i + 3));
      const last = g.log.filter(e => e.event?.kind === 'eruption').at(-1)!.event as { die: number };
      faces.push(last.die);
    }
    expect([...faces].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(JSON.stringify(getView(g, 'p0'))).not.toContain('volcanoDecks');
  });

  it('the volcano dice roll themselves after the auto-roll wait', () => {
    let g = building(g => {
      g.phase = 'roll';
    });
    g = act(g, 'p0', { type: 'roll' }, sequence(0.2, 0.2));
    if (g.phase === 'gold') g = advanceTime(g, g.goldDeadline!, seeded());
    expect(g.phase).toBe('eruption');
    expect(g.rollDeadline).not.toBeNull();
    g = advanceTime(g, g.rollDeadline!, seeded());
    expect(g.phase).toBe('build');
  });

  it('gold choices are made for anyone who has not chosen after 15 seconds', () => {
    let g = building(g => {
      g.buildings[hexOf(g, 'gold').vertexIds[0]!] = { playerId: 'p0', kind: 'settlement' };
      g.phase = 'roll';
    });
    g = act(g, 'p0', { type: 'roll' }, sequence(0.5, 0.2)); // 4 + 2... sets up gold on 8 below
    Object.assign(g, { phase: 'gold', pendingGold: { p0: 1 }, goldDeadline: TEST_NOW + 15_000 });
    expect(advanceTime(g, TEST_NOW + 14_000, seeded()).phase).toBe('gold');
    const done = advanceTime(g, TEST_NOW + 15_000, seeded());
    expect(done.phase).not.toBe('gold');
    expect(done.pendingGold).toEqual({});
  });
});

describe('ships and discoveries', () => {
  /** p0 owns two settlements joined by one ship on the coast between them. */
  function closedRoute(shipMoving: 'open' | 'ends') {
    return building(
      g => {
        const a = corner(g, 0, 1, 2);
        const b = corner(g, 0, 1, 1);
        g.buildings[a] = { playerId: 'p0', kind: 'settlement' };
        g.buildings[b] = { playerId: 'p0', kind: 'settlement' };
        g.ships[edgeBetween(g, a, b)] = 'p0';
      },
      { shipMoving },
    );
  }

  it('by default a ship between two settlements may move; the published rule keeps it put', () => {
    const ends = closedRoute('ends');
    const ship = Object.keys(ends.ships)[0]!;
    expect(isShipEdge(ends.board, ship)).toBe(true);
    expect(getView(ends, 'p0').legal.shipMoves[ship]?.length).toBeGreaterThan(0);
    expect(getView(closedRoute('open'), 'p0').legal.shipMoves).toEqual({});
  });

  it('discoveries pay for the cards the buyer picks', () => {
    const g = building(g => {
      g.players[0]!.discoveries = 2;
      grant(g, 'p0', { sheep: 1, wheat: 1 });
    });
    const bought = act(g, 'p0', {
      type: 'buy-development',
      discoveries: { wood: 0, brick: 0, sheep: 1, wheat: 0, ore: 1 },
    });
    expect(bought.players[0]!.discoveries).toBe(0);
    expect(bought.players[0]!.resources).toMatchObject({ sheep: 1, wheat: 0, ore: 0 });
    expect(() =>
      act(g, 'p0', { type: 'buy-development', discoveries: { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 1 } }),
    ).toThrow();
  });
});

it('a settlement built in the middle of a route splits it for Longest Road', () => {
  let g = settled(2);
  g.phase = 'build';
  g.roads = {};
  g.buildings = {};
  // Five of p0's roads around the center tile: corners v0 … v5.
  const center = g.board.hexes.find(h => h.q === 0 && h.r === 0)!;
  const v = center.vertexIds;
  for (let i = 0; i < 5; i++) g.roads[edgeBetween(g, v[i]!, v[i + 1]!)] = 'p0';
  expect(longestRoad(g, 'p0')).toBe(5);
  // p1 reaches corner v2 from outside the center tile and settles there.
  const index = boardIndex(g.board);
  const spur = index.vertex.get(v[2]!)!.edgeIds.find(id => !g.roads[id])!;
  g.roads[spur] = 'p1';
  grant(g, 'p1', { wood: 1, brick: 1, sheep: 1, wheat: 1 });
  g.turnIndex = 1;
  g = act(g, 'p1', { type: 'build-settlement', vertexId: v[2]! });
  expect(longestRoad(g, 'p0')).toBe(3);
});

describe('icebergs', () => {
  const ICY = testDesign([
    '~ ~ ~ ~ ~ ~ ~',
    ' ~ w6 b5 ~ ~ ~ ~',
    '~ s9 o10 ~ i5 ~ ~',
    ' ~ h8 h4 ~ ~ ~ ~',
    '~ ~ ~ ~ ~ ~ ~',
  ]);
  function icy() {
    const g = act(seaLobby(ICY, 2), 'p0', { type: 'start' });
    Object.assign(g, { phase: 'roll', turn: 3, turnIndex: 0, setupIndex: 4, rollDeadline: null, pirate: null });
    return g;
  }

  it('a rolled iceberg moves a hex the way its die names, taking its number along', () => {
    const g = icy();
    const ice = hexOf(g, 'iceberg');
    const from = { q: ice.q, r: ice.r };
    const rolled = act(g, 'p0', { type: 'roll' }, sequence(0.2, 0.4, 0.0)); // 2 + 3 = 5, then face 1
    const event = rolled.log.filter(e => e.event?.kind === 'iceberg').at(-1)!.event as {
      hexId: string;
      toHexId: string;
    };
    expect(event.toHexId).not.toBeNull();
    const moved = rolled.board.hexes.find(h => h.id === event.toHexId)!;
    expect(moved).toMatchObject({ terrain: 'iceberg', number: 5 });
    expect(rolled.board.hexes.find(h => h.q === from.q && h.r === from.r)).toMatchObject({
      terrain: 'sea',
      number: null,
    });
    // Face 1 is the upper-right side: up one row.
    expect(moved.r).toBe(from.r - 1);
  });

  it('a sunk ship in the middle of a route makes the ships beyond it slide back', async () => {
    const { sinkShip } = await import('../shared/engine/production');
    const g = icy();
    const index = boardIndex(g.board);
    const home = corner(g, 0, 1, 0);
    g.buildings[home] = { playerId: 'p0', kind: 'settlement' };
    // Three ships out to sea from the settlement, one edge after another.
    const route: string[] = [];
    let at = home;
    while (route.length < 3) {
      const next = index.vertex
        .get(at)!
        .edgeIds.find(id => isShipEdge(g.board, id) && !route.includes(id) && !g.roads[id])!;
      route.push(next);
      const edge = index.edge.get(next)!;
      at = edge.a === at ? edge.b : edge.a;
    }
    for (const id of route) g.ships[id] = 'p0';
    sinkShip(g, route[1]!);
    expect(Object.keys(g.ships).sort()).toEqual([route[0]!, route[1]!].sort());
  });
});

describe('fog', () => {
  const FOGGY = testDesign(['~ ~ ~ ~ ~ ~', ' ~ w6 b5 ~ ~ ~', '~ s9 o10 ~ ~ ~', ' ~ ~ ~ ~ ~ ~', '~ ~ ~ ~ ~ ~'], {
    fogPool: { wheat: 1 },
  });
  /** The design above with one sea tile next to the island turned to fog. */
  function foggy() {
    const design = structuredClone(FOGGY);
    const brick = design.tiles.find(t => t.kind === 'brick')!;
    const spot = design.tiles.find(t => t.kind === 'sea' && t.q === brick.q + 1 && t.r === brick.r)!;
    spot.kind = 'fog';
    const g = act(seaLobby(design, 2), 'p0', { type: 'start' });
    Object.assign(g, { phase: 'build', turn: 3, turnIndex: 0, setupIndex: 4, rollDeadline: null, pirate: null });
    return g;
  }

  it('fog hides what is under it until a road or ship reaches a corner; land pays one card', () => {
    let g = foggy();
    const fog = hexOf(g, 'fog');
    expect(g.fog[fog.id]).toMatchObject({ terrain: 'wheat' });
    expect(JSON.stringify(getView(g, 'p1'))).not.toContain('"fog":{');
    // p0 settles on the brick tile's corner that touches the fog, then builds a road along the coast to it.
    const index = boardIndex(g.board);
    const shared = fog.vertexIds.filter(v => hexOf(g, 'brick').vertexIds.includes(v));
    const home = hexOf(g, 'brick').vertexIds.find(
      v =>
        !fog.vertexIds.includes(v) &&
        index.vertex.get(v)!.edgeIds.some(id => {
          const e = index.edge.get(id)!;
          return shared.includes(e.a === v ? e.b : e.a);
        }),
    )!;
    g.buildings[home] = { playerId: 'p0', kind: 'settlement' };
    grant(g, 'p0', { wood: 1, brick: 1 });
    const edge = index.vertex.get(home)!.edgeIds.find(id => {
      const e = index.edge.get(id)!;
      return shared.includes(e.a === home ? e.b : e.a);
    })!;
    const before = g.players[0]!.resources.wheat;
    g = act(g, 'p0', { type: 'build-road', edgeId: edge });
    const revealed = g.board.hexes.find(h => h.id === fog.id)!;
    expect(revealed.terrain).toBe('wheat');
    expect(revealed.number).not.toBeNull();
    expect(g.players[0]!.resources.wheat).toBe(before + 1);
    expect(g.undo).toBeNull();
    expect(g.log.some(e => e.event?.kind === 'discover')).toBe(true);
  });
});

describe('island mixes', () => {
  it('an island with its own mix draws from it; the rest use the board mix', async () => {
    const { buildBoard } = await import('../shared/maps');
    const design = testDesign(['~ ~ ~ ~ ~ ~ ~ ~', ' ~ L L L ~ L L ~', '~ L L L ~ L L ~', ' ~ ~ ~ ~ ~ ~ ~ ~'], {
      pool: { wood: 1 },
    });
    const east = design.tiles.filter(t => t.kind === 'land').sort((a, b) => b.q + b.r / 2 - (a.q + a.r / 2))[0]!;
    design.islandPools = { [`${east.q},${east.r}`]: { ore: 1 } };
    const board = buildBoard(design, seeded(3)).board;
    const land = board.hexes.filter(h => h.island !== undefined);
    const islandOfEast = land.find(h => h.q === east.q && h.r === east.r)!.island;
    for (const h of land) expect(h.terrain).toBe(h.island === islandOfEast ? 'ore' : 'wood');
  });
});
