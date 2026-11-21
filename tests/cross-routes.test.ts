import { describe, expect, it } from 'vitest';
import { getView, normalizeGame } from '../shared/engine';
import { pieceCounts } from '../shared/engine/core';
import { longestRoad } from '../shared/rules';
import { boardIndex, isRoadEdge, isShipEdge, otherEnd } from '../shared/seafaring';
import type { GameState } from '../shared/types';
import { act, grant, inSeatOrder, seaLobby, settled, testDesign } from './fixtures';

/**
 * Crossing routes (settings.crossRoutes): players on different routes share edges and build past
 * each other's buildings; players on the same route block each other as usual.
 * p0 and p1 hold route 0, p2 holds route 1.
 */

/** A building turn for p0 on the base island with nothing built, and four corners in a line. */
function crossing(on = true) {
  const g = settled(3);
  Object.assign(g, { buildings: {}, roads: {}, ships: {}, crossings: {}, phase: 'build', turnIndex: 0 });
  g.rollDeadline = null;
  g.settings.crossRoutes = on;
  g.routeOf = { p0: 0, p1: 0, p2: 1 };
  grant(g, 'p0', { wood: 4, brick: 4, sheep: 2, wheat: 2 });
  return { g, line: landLine(g) };
}

/** Five corners joined by four road edges, each corner touching only land. */
function landLine(g: GameState) {
  const index = boardIndex(g.board);
  const inland = (v: string) => index.vertex.get(v)!.hexIds.length === 3;
  for (const start of g.board.vertices.filter(v => inland(v.id))) {
    const corners = [start.id];
    const edges: string[] = [];
    while (corners.length < 5) {
      const at = corners.at(-1)!;
      const next = index.vertex
        .get(at)!
        .edgeIds.filter(id => isRoadEdge(g.board, id))
        .find(id => {
          const to = otherEnd(index.edge.get(id)!, at);
          return inland(to) && !corners.includes(to);
        });
      if (!next) break;
      edges.push(next);
      corners.push(otherEnd(index.edge.get(next)!, at));
    }
    if (corners.length === 5) return { corners, edges };
  }
  throw new Error('no inland line');
}

describe('crossing routes', () => {
  it('lets a road share an edge with a road of another route, not of the same route', () => {
    const { g, line } = crossing();
    g.buildings[line.corners[0]!] = { playerId: 'p0', kind: 'settlement' };
    g.roads[line.edges[0]!] = 'p2';
    expect(getView(g, 'p0').legal.roads).toContain(line.edges[0]);
    g.roads[line.edges[0]!] = 'p1';
    expect(getView(g, 'p0').legal.roads).not.toContain(line.edges[0]);
    g.roads[line.edges[0]!] = 'p2';
    g.settings.crossRoutes = false;
    expect(getView(g, 'p0').legal.roads).not.toContain(line.edges[0]);
  });

  it('builds the shared road as a crossing that counts as your piece', () => {
    const { g, line } = crossing();
    g.buildings[line.corners[0]!] = { playerId: 'p0', kind: 'settlement' };
    g.roads[line.edges[0]!] = 'p2';
    const next = act(g, 'p0', { type: 'build-road', edgeId: line.edges[0]! });
    expect(next.roads[line.edges[0]!]).toBe('p2');
    expect(next.crossings[line.edges[0]!]).toEqual({ p0: 'road' });
    expect(pieceCounts(next, 'p0').roads).toBe(1);
    expect(getView(next, 'p0').legal.roads).toContain(line.edges[1]);
    expect(getView(next, 'p1').crossings).toEqual(next.crossings);
  });

  it("goes past another route's settlement, which no longer splits Longest Road", () => {
    const { g, line } = crossing();
    g.buildings[line.corners[0]!] = { playerId: 'p0', kind: 'settlement' };
    g.roads[line.edges[0]!] = 'p0';
    g.roads[line.edges[1]!] = 'p0';
    g.buildings[line.corners[2]!] = { playerId: 'p2', kind: 'settlement' };
    expect(getView(g, 'p0').legal.roads).toContain(line.edges[2]);
    g.roads[line.edges[2]!] = 'p0';
    expect(longestRoad(g, 'p0')).toBe(3);
    g.settings.crossRoutes = false;
    expect(longestRoad(g, 'p0')).toBe(2);
    g.buildings[line.corners[2]!] = { playerId: 'p1', kind: 'settlement' };
    g.settings.crossRoutes = true;
    delete g.roads[line.edges[2]!];
    expect(getView(g, 'p0').legal.roads).not.toContain(line.edges[2]);
  });

  it('still keeps settlements two corners apart', () => {
    const { g, line } = crossing();
    g.buildings[line.corners[0]!] = { playerId: 'p0', kind: 'settlement' };
    g.roads[line.edges[0]!] = 'p0';
    g.roads[line.edges[1]!] = 'p0';
    g.buildings[line.corners[3]!] = { playerId: 'p2', kind: 'settlement' };
    expect(getView(g, 'p0').legal.settlements).not.toContain(line.corners[2]);
  });

  it('starts empty in rooms saved before it', () => {
    const { g } = crossing();
    const old = { ...g, schemaVersion: 29 } as Partial<GameState>;
    delete old.crossings;
    expect(normalizeGame(old as GameState).crossings).toEqual({});
  });
});

const ISLE = testDesign([
  '~ ~ ~ ~ ~ ~ ~ ~ ~',
  ' ~ w6 b5 ~ ~ ~ ~ ~ ~',
  '~ s9 o10 ~ ~ ~ ~ h3 ~',
  ' ~ g8 v4 j11 ~ ~ ~ ~ ~',
  '~ ~ ~ ~ ~ ~ ~ ~ ~',
]);

describe('crossing routes at sea', () => {
  /** p0's settlement on the shore, p1 (another route) holding the ship edge beside it. */
  function sea() {
    let g = seaLobby(ISLE, 2);
    g = act(g, 'p0', { type: 'configure', settings: { ...g.settings, crossRoutes: true } });
    g = inSeatOrder(act(g, 'p0', { type: 'start' }));
    Object.assign(g, { phase: 'build', turn: 3, turnIndex: 0, setupIndex: 4, rollDeadline: null, pirate: null });
    Object.assign(g, { buildings: {}, roads: {}, ships: {}, crossings: {}, shipsBuilt: [] });
    g.routeOf = { p0: 0, p1: 1 };
    const shore = g.board.vertices.find(v =>
      v.edgeIds.some(id => isShipEdge(g.board, id) && !isRoadEdge(g.board, id)),
    )!;
    const edge = shore.edgeIds.find(id => isShipEdge(g.board, id) && !isRoadEdge(g.board, id))!;
    g.buildings[shore.id] = { playerId: 'p0', kind: 'settlement' };
    g.ships[edge] = 'p1';
    grant(g, 'p0', { wood: 2, sheep: 2 });
    return { g, edge };
  }

  it('shares a ship edge, and only your own ship there may move', () => {
    const { g, edge } = sea();
    expect(getView(g, 'p0').legal.ships).toContain(edge);
    let next = act(g, 'p0', { type: 'build-ship', edgeId: edge });
    expect(next.crossings[edge]).toEqual({ p0: 'ship' });
    next = { ...next, shipsBuilt: [] };
    const moves = getView(next, 'p0').legal.shipMoves;
    expect(Object.keys(moves)).toEqual([edge]);
    const moved = act(next, 'p0', { type: 'move-ship', from: edge, to: moves[edge]![0]! });
    expect(moved.crossings[edge]).toBeUndefined();
    expect(moved.ships[edge]).toBe('p1');
    expect(pieceCounts(moved, 'p0').ships).toBe(1);
  });
});
