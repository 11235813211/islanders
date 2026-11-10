import { describe, expect, it } from 'vitest';
import { generateBoard } from '../shared/board';
import {
  addPlayer,
  applyAction,
  BUILD_COSTS,
  createGame,
  emptyBag,
  GameError,
  getActivePlayerId,
  getView,
  normalizeGame,
  resourceCount,
} from '../shared/engine';
import { type GameAction, type GameState, RESOURCES, type Resource, type ResourceBag } from '../shared/types';

function seeded(seed = 42): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}

function lobby(count = 3): GameState {
  let state = createGame('ABCDEF', seeded());
  for (let i = 0; i < count; i++) state = addPlayer(state, { id: `p${i}`, name: `Player ${i}` });
  return state;
}

function setup(count = 3): GameState {
  let state = applyAction(lobby(count), 'p0', { type: 'start' });
  while (state.phase.startsWith('setup')) {
    const actor = getActivePlayerId(state)!;
    const legal = getView(state, actor).legal;
    state = applyAction(
      state,
      actor,
      state.phase === 'setup-settlement'
        ? { type: 'place-settlement', vertexId: legal.settlements[0] }
        : { type: 'place-road', edgeId: legal.roads[0] },
    );
  }
  return state;
}

function clearHands(state: GameState): void {
  for (const player of state.players) {
    for (const resource of RESOURCES) {
      state.bank[resource] += player.resources[resource];
      player.resources[resource] = 0;
    }
  }
}

function grant(state: GameState, playerId: string, resources: Partial<ResourceBag>): void {
  const player = state.players.find(candidate => candidate.id === playerId)!;
  for (const resource of RESOURCES) {
    const amount = resources[resource] ?? 0;
    player.resources[resource] += amount;
    state.bank[resource] -= amount;
  }
}

function assertConserved(state: GameState): void {
  for (const resource of RESOURCES) {
    expect(state.bank[resource]).toBeGreaterThanOrEqual(0);
    expect(state.players.reduce((sum, player) => sum + player.resources[resource], state.bank[resource])).toBe(19);
    for (const player of state.players) expect(player.resources[resource]).toBeGreaterThanOrEqual(0);
  }
}

function rollTotal(state: GameState, total: number): GameState {
  const first = Math.max(1, total - 6);
  const second = total - first;
  const values = [(first - 0.5) / 6, (second - 0.5) / 6];
  return applyAction(state, getActivePlayerId(state)!, { type: 'roll' }, () => values.shift()!);
}

// This deliberately modest simulation player uses public board geometry and
// its own hand only. It plans toward a legal new intersection instead of
// consuming all fifteen roads in loops and mistaking that strategy for a bug.
function productionScore(state: GameState, vertexId: string): number {
  const hexes = state.board.vertices
    .find(vertex => vertex.id === vertexId)!
    .hexIds.map(id => state.board.hexes.find(hex => hex.id === id)!);
  return (
    hexes.reduce((sum, hex) => sum + (hex.number ? 6 - Math.abs(7 - hex.number) : 0), 0) +
    new Set(hexes.filter(hex => hex.terrain !== 'desert').map(hex => hex.terrain)).size
  );
}

function expansionPlan(state: GameState, playerId: string): { vertexId: string; edges: string[] } | undefined {
  const vertices = state.board.vertices;
  const distance = new Map<string, number>();
  const routes = new Map<string, string[]>();
  for (const vertex of vertices) {
    const building = state.buildings[vertex.id];
    if (building && building.playerId !== playerId) continue;
    if (building?.playerId === playerId || vertex.edgeIds.some(id => state.roads[id] === playerId)) {
      distance.set(vertex.id, 0);
      routes.set(vertex.id, []);
    }
  }
  const unvisited = new Set(vertices.map(vertex => vertex.id));
  while (unvisited.size) {
    const current = [...unvisited].sort((a, b) => (distance.get(a) ?? Infinity) - (distance.get(b) ?? Infinity))[0];
    const currentDistance = distance.get(current);
    if (currentDistance === undefined) break;
    unvisited.delete(current);
    for (const edgeId of vertices.find(vertex => vertex.id === current)!.edgeIds) {
      if (state.roads[edgeId] && state.roads[edgeId] !== playerId) continue;
      const edge = state.board.edges.find(candidate => candidate.id === edgeId)!;
      const neighbor = edge.a === current ? edge.b : edge.a;
      if (!unvisited.has(neighbor)) continue;
      if (state.buildings[neighbor] && state.buildings[neighbor].playerId !== playerId) continue;
      const weight = state.roads[edgeId] ? 0 : 1;
      const candidateDistance = currentDistance + weight;
      if (candidateDistance < (distance.get(neighbor) ?? Infinity)) {
        distance.set(neighbor, candidateDistance);
        routes.set(neighbor, [...routes.get(current)!, ...(weight ? [edgeId] : [])]);
      }
    }
  }
  const roadsLeft = 15 - Object.values(state.roads).filter(owner => owner === playerId).length;
  const candidates = vertices.filter(
    vertex =>
      !state.buildings[vertex.id] &&
      distance.has(vertex.id) &&
      distance.get(vertex.id)! <= roadsLeft &&
      vertex.edgeIds.every(edgeId => {
        const edge = state.board.edges.find(candidate => candidate.id === edgeId)!;
        return !state.buildings[edge.a === vertex.id ? edge.b : edge.a];
      }),
  );
  candidates.sort(
    (a, b) =>
      distance.get(a.id)! * 10 -
      productionScore(state, a.id) -
      (distance.get(b.id)! * 10 - productionScore(state, b.id)),
  );
  return candidates[0] ? { vertexId: candidates[0].id, edges: routes.get(candidates[0].id)! } : undefined;
}

function plannedBuild(state: GameState, playerId: string): { action: GameAction; cost: ResourceBag } | undefined {
  const buildings = Object.entries(state.buildings).filter(([, building]) => building.playerId === playerId);
  const cities = buildings.filter(([, building]) => building.kind === 'city');
  const settlements = buildings.filter(([, building]) => building.kind === 'settlement');
  if (cities.length < 4 && settlements.length) {
    const vertexId = settlements.sort(([a], [b]) => productionScore(state, b) - productionScore(state, a))[0][0];
    return { action: { type: 'build-city', vertexId }, cost: BUILD_COSTS.city };
  }
  const expansion = expansionPlan(state, playerId);
  if (!expansion) return undefined;
  if (expansion.edges.length)
    return { action: { type: 'build-road', edgeId: expansion.edges[0] }, cost: BUILD_COSTS.road };
  if (settlements.length < 5)
    return { action: { type: 'build-settlement', vertexId: expansion.vertexId }, cost: BUILD_COSTS.settlement };
  return undefined;
}

describe('island topology and distribution', () => {
  it('has 19 hexes, 54 unique intersections, and 72 shared road edges', () => {
    const board = generateBoard(seeded());
    expect(board.hexes).toHaveLength(19);
    expect(board.vertices).toHaveLength(54);
    expect(board.edges).toHaveLength(72);
    expect(new Set(board.edges.map(edge => [edge.a, edge.b].sort().join(':'))).size).toBe(72);
    for (const hex of board.hexes) expect(new Set(hex.vertexIds).size).toBe(6);
    for (const vertex of board.vertices) {
      expect(vertex.edgeIds.length).toBeGreaterThanOrEqual(2);
      expect(vertex.edgeIds.length).toBeLessThanOrEqual(3);
    }
  });

  it('preserves tile and token counts and separates all 6/8 tokens across 100 boards', () => {
    for (let seed = 0; seed < 100; seed++) {
      const board = generateBoard(seeded(seed));
      const counts = Object.fromEntries(
        [...RESOURCES, 'desert'].map(terrain => [terrain, board.hexes.filter(hex => hex.terrain === terrain).length]),
      );
      expect(counts).toEqual({ wood: 4, sheep: 4, wheat: 4, brick: 3, ore: 3, desert: 1 });
      expect(
        board.hexes
          .map(hex => hex.number)
          .filter(Boolean)
          .sort((a, b) => a! - b!),
      ).toEqual([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
      const red = board.hexes.filter(hex => hex.number === 6 || hex.number === 8);
      for (let i = 0; i < red.length; i++) {
        for (let j = i + 1; j < red.length; j++) {
          expect(red[i].vertexIds.filter(id => red[j].vertexIds.includes(id)).length).toBe(0);
        }
      }
      expect(board.hexes.find(hex => hex.terrain === 'desert')!.number).toBeNull();
    }
  });

  it('remains deterministic and terminates with a constant random source', () => {
    expect(generateBoard(() => 0)).toEqual(generateBoard(() => 0));
    expect(generateBoard(seeded(1))).not.toEqual(generateBoard(seeded(2)));
  });
});

describe('room and setup rules', () => {
  it('enforces host authority, player limits, names, and lobby membership', () => {
    const state = lobby();
    expect(() => applyAction(state, 'p1', { type: 'start' })).toThrow(/host/);
    expect(() => applyAction(lobby(1), 'p0', { type: 'start' })).toThrow(/friend/);
    expect(() => addPlayer(lobby(6), { id: 'p6', name: 'Seventh' })).toThrow(/six players/);
    expect(() => addPlayer(state, { id: 'p0', name: 'Again' })).toThrow(/already/);
    expect(() => addPlayer(state, { id: 'new', name: ' ' })).toThrow(/name/);
    expect(() => addPlayer(state, { id: '__proto__', name: 'Invalid' })).toThrow(/identity/);
    expect(() => addPlayer(setup(), { id: 'new', name: 'Late' })).toThrow(/started/);
    expect(state.phase).toBe('lobby');
  });

  it.each([2, 3, 4])('completes snake setup for %i players and gives only second-settlement resources', count => {
    let state = applyAction(lobby(count), 'p0', { type: 'start' });
    const expected = [...state.players.map(player => player.id), ...state.players.map(player => player.id).reverse()];
    const observed: string[] = [];
    for (let index = 0; index < count * 2; index++) {
      const actor = getActivePlayerId(state)!;
      observed.push(actor);
      const vertexId = getView(state, actor).legal.settlements[0];
      const before = resourceCount(state.players.find(player => player.id === actor)!.resources);
      state = applyAction(state, actor, { type: 'place-settlement', vertexId });
      const bordering = state.board.vertices
        .find(vertex => vertex.id === vertexId)!
        .hexIds.filter(id => state.board.hexes.find(hex => hex.id === id)!.terrain !== 'desert').length;
      expect(resourceCount(state.players.find(player => player.id === actor)!.resources) - before).toBe(
        index >= count ? bordering : 0,
      );
      const edgeId = getView(state, actor).legal.roads[0];
      state = applyAction(state, actor, { type: 'place-road', edgeId });
    }
    expect(observed).toEqual(expected);
    expect(state.phase).toBe('roll');
    expect(state.turn).toBe(1);
    expect(getActivePlayerId(state)).toBe('p0');
    for (const player of getView(state, 'p0').players) {
      expect(player.points).toBe(2);
      expect(player.roadsLeft).toBe(13);
    }
    assertConserved(state);
  });

  it('rejects occupied/neighboring settlements and roads disconnected from the new settlement', () => {
    let state = applyAction(lobby(), 'p0', { type: 'start' });
    state = applyAction(state, 'p0', { type: 'place-settlement', vertexId: 'v0' });
    const legal = getView(state, 'p0').legal.roads;
    const distant = state.board.edges.find(edge => !legal.includes(edge.id))!.id;
    expect(() => applyAction(state, 'p0', { type: 'place-road', edgeId: distant })).toThrow(/Connect/);
    state = applyAction(state, 'p0', { type: 'place-road', edgeId: legal[0] });
    expect(() => applyAction(state, 'p1', { type: 'place-settlement', vertexId: 'v0' })).toThrow(/open/);
    const neighbor = state.board.edges.find(edge => edge.a === 'v0' || edge.b === 'v0')!;
    expect(() =>
      applyAction(state, 'p1', { type: 'place-settlement', vertexId: neighbor.a === 'v0' ? neighbor.b : neighbor.a }),
    ).toThrow(/open/);
    expect(getView(state, 'p0').legal.settlements).toEqual([]);
  });
});

describe('resource production and turn state', () => {
  it('pays settlements once and cities twice, but never pays the robber hex', () => {
    const state = setup();
    clearHands(state);
    state.buildings = {};
    const hex = state.board.hexes.find(candidate => candidate.terrain !== 'desert')!;
    state.buildings[hex.vertexIds[0]] = { playerId: 'p0', kind: 'settlement' };
    state.buildings[hex.vertexIds[2]] = { playerId: 'p1', kind: 'city' };
    const result = rollTotal(state, hex.number!);
    expect(result.players[0].resources[hex.terrain as Resource]).toBeGreaterThanOrEqual(1);
    expect(result.players[1].resources[hex.terrain as Resource]).toBeGreaterThanOrEqual(2);
    const otherSameNumber = state.board.hexes.filter(
      candidate => candidate.number === hex.number && candidate.id !== hex.id,
    );
    for (const other of otherSameNumber) other.number = 12;
    state.robber = hex.id;
    const blocked = rollTotal(state, hex.number!);
    expect(blocked.players.every(player => resourceCount(player.resources) === 0)).toBe(true);
    assertConserved(result);
    assertConserved(blocked);
  });

  it('does not allocate scarce resources to multiple claimants, but gives a sole claimant the remaining cards', () => {
    const state = setup();
    clearHands(state);
    state.buildings = {};
    const hex = state.board.hexes.find(candidate => candidate.terrain === 'wood')!;
    for (const tile of state.board.hexes) tile.number = tile.id === hex.id ? 6 : null;
    grant(state, 'p2', { wood: 18 });
    state.buildings[hex.vertexIds[0]] = { playerId: 'p0', kind: 'city' };
    state.buildings[hex.vertexIds[2]] = { playerId: 'p1', kind: 'settlement' };
    const scarce = rollTotal(state, 6);
    expect(scarce.players[0].resources.wood).toBe(0);
    expect(scarce.players[1].resources.wood).toBe(0);
    delete state.buildings[hex.vertexIds[2]];
    const sole = rollTotal(state, 6);
    expect(sole.players[0].resources.wood).toBe(1);
    expect(sole.bank.wood).toBe(0);
    assertConserved(scarce);
    assertConserved(sole);
  });

  it('requires a single roll before building, then rotates the turn', () => {
    const state = setup();
    expect(() => applyAction(state, 'p0', { type: 'end-turn' })).toThrow(/not available/);
    expect(() => applyAction(state, 'p1', { type: 'roll' })).toThrow(/turn/);
    const rolled = rollTotal(state, 2);
    expect(() => applyAction(rolled, 'p0', { type: 'roll' })).toThrow(/not available/);
    const next = applyAction(rolled, 'p0', { type: 'end-turn' });
    expect(next.phase).toBe('roll');
    expect(next.dice).toBeNull();
    expect(next.turn).toBe(2);
    expect(getActivePlayerId(next)).toBe('p1');
    expect(next.version).toBe(state.version + 2);
  });
});

describe('seven and robber', () => {
  it('requires exactly half from every hand above seven before moving the robber', () => {
    const state = setup();
    clearHands(state);
    grant(state, 'p0', { wood: 9 });
    grant(state, 'p1', { brick: 8 });
    grant(state, 'p2', { sheep: 7 });
    let next = rollTotal(state, 7);
    expect(next.phase).toBe('discard');
    expect(next.pendingDiscards).toEqual({ p0: 4, p1: 4 });
    expect(() => applyAction(next, 'p0', { type: 'move-robber', hexId: 'h0' })).toThrow(/not available/);
    expect(() => applyAction(next, 'p1', { type: 'discard', resources: { ...emptyBag(), brick: 3 } })).toThrow(
      /exactly 4/,
    );
    expect(() => applyAction(next, 'p1', { type: 'discard', resources: { ...emptyBag(), ore: 4 } })).toThrow(/enough/);
    next = applyAction(next, 'p1', { type: 'discard', resources: { ...emptyBag(), brick: 4 } });
    expect(next.phase).toBe('discard');
    expect(() => applyAction(next, 'p1', { type: 'discard', resources: { ...emptyBag(), brick: 4 } })).toThrow(
      /do not need/,
    );
    next = applyAction(next, 'p0', { type: 'discard', resources: { ...emptyBag(), wood: 4 } });
    expect(next.phase).toBe('robber');
    expect(next.pendingDiscards).toEqual({});
    assertConserved(next);
  });

  it('moves to a different hex, steals only from eligible neighbors, and hides the stolen resource', () => {
    const state = setup();
    clearHands(state);
    state.buildings = {};
    grant(state, 'p1', { ore: 2 });
    grant(state, 'p2', { wood: 1 });
    const destination = state.board.hexes.find(hex => hex.id !== state.robber)!;
    state.buildings[destination.vertexIds[0]] = { playerId: 'p1', kind: 'city' };
    let next = rollTotal(state, 7);
    expect(() => applyAction(next, 'p0', { type: 'move-robber', hexId: next.robber })).toThrow(/different/);
    next = applyAction(next, 'p0', { type: 'move-robber', hexId: destination.id });
    expect(next.phase).toBe('build'); // A single eligible victim is automatic.
    expect(() => applyAction(next, 'p0', { type: 'steal', playerId: 'p2' })).toThrow(/not available/);
    expect(next.players[0].resources.ore).toBe(1);
    expect(next.players[1].resources.ore).toBe(1);
    expect(next.phase).toBe('build');
    expect(next.log.at(-1)!.text).not.toContain('ore');
    assertConserved(next);
  });

  it('does not require stealing from an empty hex or an empty hand', () => {
    const state = setup();
    clearHands(state);
    const next = rollTotal(state, 7);
    expect(next.phase).toBe('robber');
    const moved = applyAction(next, 'p0', { type: 'move-robber', hexId: getView(next, 'p0').legal.robberHexes[0] });
    expect(moved.phase).toBe('build');
  });
});

describe('building and bank trades', () => {
  it('charges costs, returns resources to the bank, and rejects isolated roads', () => {
    const state = setup();
    clearHands(state);
    state.phase = 'build';
    grant(state, 'p0', { wood: 1, brick: 1 });
    const legal = getView(state, 'p0').legal.roads;
    const isolated = state.board.edges.find(edge => !state.roads[edge.id] && !legal.includes(edge.id))!.id;
    expect(() => applyAction(state, 'p0', { type: 'build-road', edgeId: isolated })).toThrow(/connected/);
    const next = applyAction(state, 'p0', { type: 'build-road', edgeId: legal[0] });
    expect(next.players[0].resources).toEqual(emptyBag());
    expect(next.roads[legal[0]]).toBe('p0');
    expect(getView(next, 'p0').legal.roads).toEqual([]);
    assertConserved(next);
  });

  it('cannot extend a road through an opponent settlement', () => {
    const state = setup();
    clearHands(state);
    state.phase = 'build';
    state.buildings = {};
    state.roads = {};
    grant(state, 'p0', { wood: 3, brick: 3 });
    const junction = state.board.vertices.find(vertex => vertex.edgeIds.length === 3)!;
    state.roads[junction.edgeIds[0]] = 'p0';
    state.buildings[junction.id] = { playerId: 'p1', kind: 'settlement' };
    expect(getView(state, 'p0').legal.roads).not.toContain(junction.edgeIds[1]);
    expect(() => applyAction(state, 'p0', { type: 'build-road', edgeId: junction.edgeIds[1] })).toThrow(/connected/);
    state.buildings[junction.id] = { playerId: 'p0', kind: 'settlement' };
    expect(getView(state, 'p0').legal.roads).toContain(junction.edgeIds[1]);
  });

  it('builds only a connected settlement with distance clearance', () => {
    const state = setup();
    clearHands(state);
    state.phase = 'build';
    state.buildings = {};
    state.roads = {};
    grant(state, 'p0', { wood: 1, brick: 1, sheep: 1, wheat: 1 });
    const edge = state.board.edges[0];
    state.roads[edge.id] = 'p0';
    expect(getView(state, 'p0').legal.settlements.sort()).toEqual([edge.a, edge.b].sort());
    const next = applyAction(state, 'p0', { type: 'build-settlement', vertexId: edge.a });
    expect(next.buildings[edge.a]).toEqual({ playerId: 'p0', kind: 'settlement' });
    expect(next.players[0].resources).toEqual(emptyBag());
    assertConserved(next);
  });

  it('upgrades only an owned settlement, adds a point, and returns the settlement piece', () => {
    const state = setup();
    clearHands(state);
    state.phase = 'build';
    grant(state, 'p0', { wheat: 2, ore: 3 });
    const own = Object.keys(state.buildings).find(id => state.buildings[id].playerId === 'p0')!;
    const other = Object.keys(state.buildings).find(id => state.buildings[id].playerId === 'p1')!;
    expect(() => applyAction(state, 'p0', { type: 'build-city', vertexId: other })).toThrow(/Upgrade/);
    const next = applyAction(state, 'p0', { type: 'build-city', vertexId: own });
    expect(getView(next, 'p0').players[0]).toMatchObject({ points: 3, settlementsLeft: 4, citiesLeft: 3 });
    expect(next.players[0].resources).toEqual(emptyBag());
    assertConserved(next);
  });

  it('enforces road, settlement, and city piece limits', () => {
    const state = setup();
    clearHands(state);
    state.phase = 'build';
    state.roads = {};
    state.buildings = {};
    grant(state, 'p0', { wood: 10, brick: 10, sheep: 10, wheat: 10, ore: 10 });
    for (const edge of state.board.edges.slice(0, 15)) state.roads[edge.id] = 'p0';
    expect(getView(state, 'p0').legal.roads).toEqual([]);
    for (const vertex of state.board.vertices.slice(0, 5))
      state.buildings[vertex.id] = { playerId: 'p0', kind: 'settlement' };
    expect(getView(state, 'p0').legal.settlements).toEqual([]);
    for (const vertex of state.board.vertices.slice(5, 9))
      state.buildings[vertex.id] = { playerId: 'p0', kind: 'city' };
    expect(getView(state, 'p0').legal.cities).toEqual([]);
  });

  it('trades four identical cards for one available card and rejects invalid bank trades', () => {
    const state = setup();
    clearHands(state);
    state.phase = 'build';
    grant(state, 'p0', { wood: 4 });
    const next = applyAction(state, 'p0', { type: 'trade', give: 'wood', receive: 'ore' });
    expect(next.players[0].resources).toEqual({ ...emptyBag(), ore: 1 });
    expect(() => applyAction(state, 'p0', { type: 'trade', give: 'wood', receive: 'wood' })).toThrow(/different/);
    expect(() => applyAction(next, 'p0', { type: 'trade', give: 'ore', receive: 'wood' })).toThrow(/4 resources/);
    grant(state, 'p1', { ore: 19 });
    expect(() => applyAction(state, 'p0', { type: 'trade', give: 'wood', receive: 'ore' })).toThrow(/bank/);
    assertConserved(next);
  });

  it('ends the game at ten points and rejects every subsequent move', () => {
    const state = setup();
    clearHands(state);
    state.phase = 'build';
    state.buildings = {};
    for (let i = 0; i < 4; i++) state.buildings[`v${i}`] = { playerId: 'p0', kind: 'city' };
    state.buildings.v4 = { playerId: 'p0', kind: 'settlement' };
    const vacant = state.board.vertices.find(vertex =>
      vertex.edgeIds.every(id => {
        const edge = state.board.edges.find(candidate => candidate.id === id)!;
        return !state.buildings[edge.a] && !state.buildings[edge.b];
      }),
    )!;
    state.roads[vacant.edgeIds[0]] = 'p0';
    grant(state, 'p0', { wood: 1, brick: 1, sheep: 1, wheat: 1 });
    const next = applyAction(state, 'p0', { type: 'build-settlement', vertexId: vacant.id });
    expect(next.phase).toBe('finished');
    expect(next.winnerId).toBe('p0');
    expect(getView(next, 'p0').players[0].points).toBe(10);
    expect(() => applyAction(next, 'p0', { type: 'end-turn' })).toThrow(/finished/);
  });
});

describe('trust boundary and immutability', () => {
  it.each([
    null,
    [],
    {},
    { type: 'cheat' },
    { type: '__proto__' },
    { type: 'roll', dice: [6, 6] },
    { type: 'trade', give: '__proto__', receive: 'wood' },
    { type: 'discard', resources: { ...emptyBag(), wood: -1 } },
    { type: 'discard', resources: { ...emptyBag(), wood: 0.5 } },
    { type: 'discard', resources: { ...emptyBag(), wood: Infinity } },
    { type: 'discard', resources: { wood: 4 } },
    { type: 'build-road', edgeId: null },
  ])('rejects malformed commands without altering state: %j', action => {
    const state = setup();
    const original = structuredClone(state);
    expect(() => applyAction(state, 'p0', action as GameAction)).toThrow(GameError);
    expect(state).toEqual(original);
  });

  it('returns independent state and view objects and never projects opponent resources', () => {
    const state = setup();
    const original = structuredClone(state);
    const next = rollTotal(state, 2);
    expect(state).toEqual(original);
    expect(next).not.toBe(state);
    const view = getView(state, 'p0');
    expect(view.players.every(player => !Object.hasOwn(player, 'resources'))).toBe(true);
    expect(view.hand).toEqual(state.players[0].resources);
    view.hand.wood = 500;
    view.board.hexes[0].number = 100;
    expect(state).toEqual(original);
    expect(() => getView(state, 'intruder')).toThrow(/not a member/);
    expect(() => applyAction(state, 'intruder', { type: 'roll' })).toThrow(/not a player/);
  });

  it('does not reveal opponent resource composition when public information is unchanged', () => {
    const state = setup();
    clearHands(state);
    state.phase = 'build';
    grant(state, 'p0', { wood: 1, brick: 1 });
    grant(state, 'p1', { wheat: 3, ore: 1 });
    grant(state, 'p2', { wheat: 1, ore: 3 });
    const alternate = structuredClone(state);
    [alternate.players[1].resources, alternate.players[2].resources] = [
      alternate.players[2].resources,
      alternate.players[1].resources,
    ];
    expect(getView(alternate, 'p0')).toEqual(getView(state, 'p0'));
    expect(getView(alternate, 'p1').hand).not.toEqual(getView(state, 'p1').hand);
    assertConserved(state);
    assertConserved(alternate);
  });

  it('hides exact bank counts so two-player opponents cannot derive each other’s hand', () => {
    const state = setup(2);
    clearHands(state);
    state.phase = 'build';
    grant(state, 'p0', { wood: 1, brick: 1 });
    const alternate = structuredClone(state);
    grant(state, 'p1', { wheat: 3, ore: 1 });
    grant(alternate, 'p1', { sheep: 3, brick: 1 });
    expect(state.bank).not.toEqual(alternate.bank);
    expect(getView(alternate, 'p0')).toEqual(getView(state, 'p0'));
    expect(getView(state, 'p0').bank).toEqual({ wood: true, brick: true, sheep: true, wheat: true, ore: true });
    grant(state, 'p1', { ore: 18 });
    expect(getView(state, 'p0').bank.ore).toBe(false);
    assertConserved(state);
    assertConserved(alternate);
  });

  it.each([2, 3, 4])(
    'plays a complete %i-player game to ten points using legal commands only',
    count => {
      const random = seeded(708 + count);
      let state = createGame('SIMULATED', random);
      for (let i = 0; i < count; i++) state = addPlayer(state, { id: `p${i}`, name: `Player ${i}` });
      state = applyAction(state, 'p0', { type: 'start' });
      while (state.phase.startsWith('setup')) {
        const actor = getActivePlayerId(state)!;
        const legal = getView(state, actor).legal;
        if (state.phase === 'setup-settlement') {
          const sites = [...legal.settlements].sort((a, b) => productionScore(state, b) - productionScore(state, a));
          state = applyAction(state, actor, { type: 'place-settlement', vertexId: sites[0] });
        } else {
          state = applyAction(state, actor, { type: 'place-road', edgeId: legal.roads[0] });
        }
      }
      for (let turn = 0; turn < 1500 && state.phase !== 'finished'; turn++) {
        const actor = getActivePlayerId(state)!;
        state = applyAction(state, actor, { type: 'roll' }, random);
        for (const [id, amount] of Object.entries(state.pendingDiscards)) {
          const discard = emptyBag();
          const hand = { ...getView(state, id).hand };
          for (let remaining = amount; remaining > 0; remaining--) {
            const resource = [...RESOURCES].sort((a, b) => hand[b] - hand[a])[0];
            hand[resource]--;
            discard[resource]++;
          }
          state = applyAction(state, id, { type: 'discard', resources: discard });
        }
        if (state.phase === 'robber') {
          const hexes = getView(state, actor).legal.robberHexes;
          state = applyAction(state, actor, { type: 'move-robber', hexId: hexes[Math.floor(random() * hexes.length)] });
        }
        if (state.phase === 'steal') {
          state = applyAction(
            state,
            actor,
            { type: 'steal', playerId: getView(state, actor).legal.stealTargets[0] },
            random,
          );
        }
        for (let move = 0; move < 25 && state.phase === 'build'; move++) {
          const plan = plannedBuild(state, actor);
          if (!plan) break;
          const view = getView(state, actor);
          if (RESOURCES.every(resource => view.hand[resource] >= plan.cost[resource])) {
            state = applyAction(state, actor, plan.action);
          } else {
            const give = [...RESOURCES]
              .sort((a, b) => view.hand[b] - plan.cost[b] - (view.hand[a] - plan.cost[a]))
              .find(resource => view.hand[resource] - plan.cost[resource] >= 4);
            const receive = RESOURCES.find(
              resource => view.hand[resource] < plan.cost[resource] && view.bank[resource],
            );
            if (!give || !receive) break;
            state = applyAction(state, actor, { type: 'trade', give, receive });
          }
        }
        assertConserved(state);
        for (const player of getView(state, actor).players) {
          expect(player.roadsLeft).toBeGreaterThanOrEqual(0);
          expect(player.settlementsLeft).toBeGreaterThanOrEqual(0);
          expect(player.citiesLeft).toBeGreaterThanOrEqual(0);
        }
        if (state.phase === 'build') state = applyAction(state, actor, { type: 'end-turn' });
      }
      expect(state.phase).toBe('finished');
      const winner = getView(state, state.winnerId!).players.find(player => player.id === state.winnerId)!;
      // One move adds at most 2 points (Longest Road), so a winner ends on the target or one past it.
      expect(winner.points).toBeGreaterThanOrEqual(state.settings.victoryPoints);
      expect(winner.points).toBeLessThanOrEqual(state.settings.victoryPoints + 1);
      expect(state.players[state.turnIndex].id).toBe(state.winnerId);
    },
    15_000,
  );

  it('keeps resources conserved across 180 simulated turns with discards, robber moves, trades, and builds', () => {
    const random = seeded(9182);
    let state = setup(4);
    for (let turn = 0; turn < 180 && state.phase !== 'finished'; turn++) {
      const actor = getActivePlayerId(state)!;
      state = applyAction(state, actor, { type: 'roll' }, random);
      for (const [id, amount] of Object.entries(state.pendingDiscards)) {
        const discard = emptyBag();
        let remaining = amount;
        const player = state.players.find(candidate => candidate.id === id)!;
        for (const resource of RESOURCES) {
          discard[resource] = Math.min(remaining, player.resources[resource]);
          remaining -= discard[resource];
        }
        state = applyAction(state, id, { type: 'discard', resources: discard });
      }
      if (state.phase === 'robber') {
        const hexes = getView(state, actor).legal.robberHexes;
        state = applyAction(state, actor, { type: 'move-robber', hexId: hexes[Math.floor(random() * hexes.length)] });
      }
      if (state.phase === 'steal')
        state = applyAction(
          state,
          actor,
          { type: 'steal', playerId: getView(state, actor).legal.stealTargets[0] },
          random,
        );
      const view = getView(state, actor);
      if (view.legal.cities.length)
        state = applyAction(state, actor, { type: 'build-city', vertexId: view.legal.cities[0] });
      else if (view.legal.settlements.length)
        state = applyAction(state, actor, { type: 'build-settlement', vertexId: view.legal.settlements[0] });
      else if (view.legal.roads.length)
        state = applyAction(state, actor, { type: 'build-road', edgeId: view.legal.roads[0] });
      else {
        const give = RESOURCES.find(resource => view.hand[resource] >= 4);
        const receive = RESOURCES.find(resource => resource !== give && view.bank[resource]);
        if (give && receive) state = applyAction(state, actor, { type: 'trade', give, receive });
      }
      assertConserved(state);
      if (state.phase === 'build') state = applyAction(state, actor, { type: 'end-turn' });
    }
    expect(state.turn).toBeGreaterThan(100);
    expect(state.log.length).toBeLessThanOrEqual(60);
    expect(new Set(state.log.map(entry => entry.id)).size).toBe(state.log.length);
  });
});

describe('room settings and automatic roll scheduling', () => {
  it('lets only the host configure supported settings before a game starts', () => {
    const state = lobby();
    expect(state.settings).toMatchObject({ autoRollSeconds: 5, trackDice: true });
    const action = { type: 'configure', settings: { autoRollSeconds: 10, trackDice: false } } as const;
    expect(() => applyAction(state, 'p1', action)).toThrow(/host/);
    const next = applyAction(state, 'p0', action);
    expect(next.settings).toMatchObject(action.settings);
    expect(next.version).toBe(state.version + 1);
    expect(state.settings).toMatchObject({ autoRollSeconds: 5, trackDice: true });
    expect(() => applyAction(setup(), 'p0', action)).toThrow(/not available/);
  });

  it.each([
    { autoRollSeconds: -1, trackDice: true },
    { autoRollSeconds: 6, trackDice: true },
    { autoRollSeconds: '10', trackDice: true },
    { autoRollSeconds: 10, trackDice: 1 },
    { autoRollSeconds: 10 },
    { autoRollSeconds: 10, trackDice: true, friendlyRobber: 'yes' },
  ])('rejects malformed settings without changing state: %j', settings => {
    const state = lobby();
    const original = structuredClone(state);
    expect(() => applyAction(state, 'p0', { type: 'configure', settings } as GameAction)).toThrow(GameError);
    expect(state).toEqual(original);
  });

  it('sets the first roll deadline after setup and resets it only at the next turn', () => {
    let state = applyAction(lobby(2), 'p0', { type: 'start' });
    expect(state.rollDeadline).toBeNull();
    while (state.phase.startsWith('setup')) {
      const actor = getActivePlayerId(state)!;
      const legal = getView(state, actor).legal;
      const action: GameAction =
        state.phase === 'setup-settlement'
          ? { type: 'place-settlement', vertexId: legal.settlements[0] }
          : { type: 'place-road', edgeId: legal.roads[0] };
      state = applyAction(state, actor, action, seeded(), 1_000);
    }
    expect(state.rollDeadline).toBe(6_000);
    expect(getView(state, 'p1').rollDeadline).toBe(6_000);
    const rolled = applyAction(state, 'p0', { type: 'roll' }, () => 0, 2_000);
    expect(rolled.rollDeadline).toBeNull();
    expect(rolled.diceCounts[2]).toBe(1);
    const next = applyAction(rolled, 'p0', { type: 'end-turn' }, seeded(), 5_000);
    expect(next.rollDeadline).toBe(10_000);
  });

  it('keeps auto-roll disabled independently from dice tracking', () => {
    const state = setup();
    state.settings = { ...state.settings, autoRollSeconds: 0, trackDice: false };
    const rolled = rollTotal(state, 2);
    expect(rolled.diceCounts[2]).toBe(1);
    expect(getView(rolled, 'p0').diceCounts).toEqual({});
    const next = applyAction(rolled, 'p0', { type: 'end-turn' }, seeded(), 5_000);
    expect(next.rollDeadline).toBeNull();
    const nextRoll = rollTotal(next, 7);
    expect(nextRoll.diceCounts[7]).toBe(1);
    expect(Object.values(nextRoll.diceCounts).reduce((sum, count) => sum + count, 0)).toBe(2);
  });

  it('normalizes legacy snapshots without altering saved data or refreshing an existing deadline', () => {
    const legacy = setup();
    const legacyRecord = legacy as unknown as Record<string, unknown>;
    // Rooms saved before schema versioning have no schemaVersion.
    for (const key of ['schemaVersion', 'settings', 'rollDeadline', 'diceCounts', 'tradeOffer', 'testMode'])
      delete legacyRecord[key];
    const original = structuredClone(legacy);
    const normalized = normalizeGame(legacy, 20_000);
    expect(normalized.settings).toMatchObject({ autoRollSeconds: 5, trackDice: true });
    expect(normalized.rollDeadline).toBe(25_000);
    expect(normalized.tradeOffer).toBeNull();
    expect(normalized.testMode).toBe(false);
    expect(Object.keys(normalized.diceCounts)).toHaveLength(11);
    expect(legacy).toEqual(original);
    expect(normalizeGame(normalized, 60_000).rollDeadline).toBe(25_000);
    const next = applyAction(normalized, 'p0', { type: 'roll' }, () => 0, 25_000);
    expect(next.phase).toBe('build');
    expect(normalizeGame(next, 60_000).rollDeadline).toBeNull();
  });

  it('marks test rooms explicitly without granting engine-level impersonation', () => {
    let state = createGame('TEST42', seeded(), { testMode: true });
    state = addPlayer(state, { id: 'p0', name: 'Host' });
    state = addPlayer(state, { id: 'p1', name: 'Test seat' });
    state = applyAction(state, 'p0', { type: 'start' });
    expect(getView(state, 'p0').testMode).toBe(true);
    expect(() =>
      applyAction(state, 'p1', { type: 'place-settlement', vertexId: getView(state, 'p0').legal.settlements[0] }),
    ).toThrow(/turn/);
  });
});

describe('player trade offers', () => {
  function tradingGame(): GameState {
    const state = setup();
    clearHands(state);
    state.phase = 'build';
    state.rollDeadline = null;
    grant(state, 'p0', { wood: 4, brick: 1 });
    grant(state, 'p1', { ore: 3 });
    grant(state, 'p2', { wheat: 3 });
    return state;
  }
  const give = { ...emptyBag(), wood: 2 };
  const want = { ...emptyBag(), ore: 1 };

  it('shows an offer to all seats; a yes waits for the proposer, who then trades with that player', () => {
    const state = tradingGame();
    const offered = applyAction(state, 'p0', { type: 'offer-trade', give, want });
    expect(offered.tradeOffer).toMatchObject({
      id: `trade-${state.version + 1}`,
      fromId: 'p0',
      give,
      want,
      acceptedBy: [],
      declinedBy: [],
    });
    expect(getView(offered, 'p1').tradeOffer).toEqual(offered.tradeOffer);
    expect(offered.players.map(player => player.resources)).toEqual(state.players.map(player => player.resources));
    const offerId = offered.tradeOffer!.id;
    const yes = applyAction(offered, 'p1', { type: 'accept-trade', offerId });
    expect(yes.tradeOffer!.acceptedBy).toEqual(['p1']);
    expect(yes.players).toEqual(offered.players);
    expect(() => applyAction(yes, 'p0', { type: 'confirm-trade', offerId, playerId: 'p2' })).toThrow(/not accepted/);
    expect(() => applyAction(yes, 'p1', { type: 'confirm-trade', offerId, playerId: 'p1' })).toThrow(/turn/);
    const accepted = applyAction(yes, 'p0', { type: 'confirm-trade', offerId, playerId: 'p1' });
    expect(accepted.players[0].resources).toEqual({ ...emptyBag(), wood: 2, brick: 1, ore: 1 });
    expect(accepted.players[1].resources).toEqual({ ...emptyBag(), wood: 2, ore: 2 });
    expect(accepted.bank).toEqual(state.bank);
    expect(accepted.tradeOffer).toBeNull();
    expect(accepted.turnIndex).toBe(0);
    expect(accepted.phase).toBe('build');
    assertConserved(accepted);
  });

  it('allows only the active player to offer during the build phase and rejects gifts or overlapping types', () => {
    const state = tradingGame();
    expect(() => applyAction(state, 'p1', { type: 'offer-trade', give: want, want: give })).toThrow(/turn/);
    expect(() => applyAction({ ...state, phase: 'roll' }, 'p0', { type: 'offer-trade', give, want })).toThrow(
      /not available/,
    );
    expect(() => applyAction(state, 'p0', { type: 'offer-trade', give: want, want: give })).toThrow(/resources/);
    expect(() => applyAction(state, 'p0', { type: 'offer-trade', give: emptyBag(), want })).toThrow(/at least one/);
    expect(() => applyAction(state, 'p0', { type: 'offer-trade', give, want: give })).toThrow(/different/);
  });

  it.each([-1, 0.5, 20, Infinity, NaN])('rejects invalid quantities (%s) without mutating hands', amount => {
    const state = tradingGame();
    const original = structuredClone(state);
    expect(() => applyAction(state, 'p0', { type: 'offer-trade', give: { ...give, wood: amount }, want })).toThrow(
      GameError,
    );
    expect(state).toEqual(original);
  });

  it('rejects malformed resource bags and unexpected fields', () => {
    const state = tradingGame();
    for (const action of [
      { type: 'offer-trade', give: { wood: 1 }, want },
      { type: 'offer-trade', give: null, want },
      { type: 'offer-trade', give, want, playerId: 'p1' },
      { type: 'accept-trade', offerId: null },
    ])
      expect(() => applyAction(state, 'p0', action as GameAction)).toThrow(GameError);
  });

  it('rejects self-acceptance, insufficient hands, stale offers, and duplicate acceptance', () => {
    const state = tradingGame();
    const offered = applyAction(state, 'p0', { type: 'offer-trade', give, want });
    const action = { type: 'accept-trade', offerId: offered.tradeOffer!.id } as const;
    const original = structuredClone(offered);
    expect(() => applyAction(offered, 'p0', action)).toThrow(/own trade/);
    expect(() => applyAction(offered, 'p2', action)).toThrow(/do not have/);
    expect(() => applyAction(offered, 'p1', { ...action, offerId: 'expired' })).toThrow(/no longer/);
    expect(offered).toEqual(original);
    const accepted = applyAction(applyAction(offered, 'p1', action), 'p0', {
      type: 'confirm-trade',
      offerId: action.offerId,
      playerId: 'p1',
    });
    expect(() => applyAction(accepted, 'p2', action)).toThrow(/no longer/);
    const replaced = applyAction(offered, 'p0', { type: 'offer-trade', give: { ...give, wood: 3 }, want });
    expect(replaced.tradeOffer!.id).not.toBe(action.offerId);
    expect(() => applyAction(replaced, 'p1', action)).toThrow(/no longer/);
    assertConserved(replaced);
  });

  it('tracks answers independently, lets a recipient change theirs, permits cancel, and expires on end turn', () => {
    const offered = applyAction(tradingGame(), 'p0', { type: 'offer-trade', give, want });
    const offerId = offered.tradeOffer!.id;
    const declined = applyAction(offered, 'p2', { type: 'decline-trade', offerId });
    expect(declined.tradeOffer!.declinedBy).toEqual(['p2']);
    expect(declined.players).toEqual(offered.players);
    const yes = applyAction(declined, 'p1', { type: 'accept-trade', offerId });
    const changed = applyAction(yes, 'p1', { type: 'decline-trade', offerId });
    expect(changed.tradeOffer!.acceptedBy).toEqual([]);
    expect(changed.tradeOffer!.declinedBy).toEqual(['p2', 'p1']);
    expect(() => applyAction(offered, 'p0', { type: 'decline-trade', offerId })).toThrow(/Cancel/);
    expect(() => applyAction(offered, 'p1', { type: 'cancel-trade', offerId })).toThrow(/turn/);
    expect(applyAction(declined, 'p0', { type: 'cancel-trade', offerId }).tradeOffer).toBeNull();
    const ended = applyAction(offered, 'p0', { type: 'end-turn' });
    expect(ended.tradeOffer).toBeNull();
    expect(() => applyAction(ended, 'p1', { type: 'accept-trade', offerId })).toThrow(/not available/);
  });

  it('automatically closes an offer if spending makes it unaffordable, but preserves an affordable offer', () => {
    const state = tradingGame();
    const offered = applyAction(state, 'p0', { type: 'offer-trade', give: { ...give, wood: 4 }, want });
    const built = applyAction(offered, 'p0', { type: 'build-road', edgeId: getView(offered, 'p0').legal.roads[0] });
    expect(built.tradeOffer).toBeNull();
    expect(built.log.at(-1)!.text).toContain('closed');
    const smaller = applyAction(state, 'p0', { type: 'offer-trade', give, want });
    const stillAffordable = applyAction(smaller, 'p0', {
      type: 'build-road',
      edgeId: getView(smaller, 'p0').legal.roads[0],
    });
    expect(stillAffordable.tradeOffer).toEqual(smaller.tradeOffer);
    const bankTrade = applyAction(offered, 'p0', { type: 'trade', give: 'wood', receive: 'wheat' });
    expect(bankTrade.tradeOffer).toBeNull();
    assertConserved(built);
    assertConserved(stillAffordable);
    assertConserved(bankTrade);
  });

  it('does not declare an off-turn trade recipient the winner', () => {
    const state = tradingGame();
    for (let i = 0; i < 5; i++) state.buildings[`v${i}`] = { playerId: 'p1', kind: 'city' };
    const offered = applyAction(state, 'p0', { type: 'offer-trade', give, want });
    const offerId = offered.tradeOffer!.id;
    const yes = applyAction(offered, 'p1', { type: 'accept-trade', offerId });
    const accepted = applyAction(yes, 'p0', { type: 'confirm-trade', offerId, playerId: 'p1' });
    expect(accepted.phase).toBe('build');
    expect(accepted.winnerId).toBeNull();
  });
});
