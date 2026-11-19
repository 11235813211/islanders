import { describe, expect, it } from 'vitest';
import { finishMove, finishTarget } from '../shared/bots/charting';
import { getView, normalizeGame } from '../shared/engine';
import { chartPoints, chartScorer, chartsLeft, fullyCharted, victoryPoints } from '../shared/rules';
import { boardIndex } from '../shared/seafaring';
import type { GameState, Hex } from '../shared/types';
import { act, cartographersGame, conserved, grant, hexOf, TEST_NOW } from './fixtures';

/** p0 to build with a lodestone and a settlement by the wood tile, which is one chart from full. */
function almostFull() {
  const g = cartographersGame();
  g.board = structuredClone(g.board);
  g.buildings = {};
  g.roads = {};
  g.ships = {};
  const hex = hexOf(g, 'wood');
  hex.number = 6;
  hex.extra = [5, 3];
  g.buildings[hex.vertexIds[0]!] = { playerId: 'p0', kind: 'settlement' };
  grant(g, 'p0', { lodestone: 1 });
  return { g, hex };
}

const sameHex = (g: GameState, hex: Hex) => g.board.hexes.find(h => h.id === hex.id)!;
const finish = (g: GameState, hex: Hex, id = 'p0') => act(g, id, { type: 'chart-hex', hexId: hex.id });

describe('finished charts', () => {
  it('count charts to a full tile: a plain 6 takes seven, an 8 the same', () => {
    expect(chartsLeft([6])).toBe(7);
    expect(chartsLeft([8])).toBe(7);
    expect(chartsLeft([6, 5, 3])).toBe(1);
    expect(chartsLeft([6, 5, 4])).toBe(0);
    expect(fullyCharted({ number: 8, extra: [9, 10] })).toBe(true);
    expect(fullyCharted({ number: 6, extra: [5] })).toBe(false);
  });

  it('score 1 point for the only player beside the tile', () => {
    const { g, hex } = almostFull();
    const before = victoryPoints(g, 'p0');
    const next = finish(g, hex);
    expect(chartScorer(next, sameHex(next, hex))).toBe('p0');
    expect(victoryPoints(next, 'p0')).toBe(before + 1);
    expect(getView(next, 'p1').players[0]!.chartPoints).toBe(1);
    expect(getView(next, 'p1').players[0]!.publicPoints).toBe(before + 1);
    expect(next.log.at(-1)!.text).toContain(`${next.players[0]!.name} scores 1 point.`);
    expect(conserved(next)).toBe(true);
  });

  it('score nothing before the tile is full', () => {
    const { g, hex } = almostFull();
    hex.extra = [5, 2];
    const next = finish(g, hex);
    expect(chartScorer(next, sameHex(next, hex))).toBeNull();
    expect(chartPoints(next, 'p0')).toBe(0);
  });

  it('stop scoring when a rival builds a settlement, city, or relay station beside the tile', () => {
    const { g, hex } = almostFull();
    const done = finish(g, hex);
    const edgeId = boardIndex(done.board)
      .vertex.get(hex.vertexIds[3]!)!
      .edgeIds.find(id =>
        boardIndex(done.board)
          .edgeHexes.get(id)!
          .some(h => h.id === hex.id),
      )!;
    for (const kind of ['settlement', 'city'] as const) {
      const built = { ...done, buildings: { ...done.buildings, [hex.vertexIds[3]!]: { playerId: 'p1', kind } } };
      expect(chartPoints(built, 'p0'), kind).toBe(0);
    }
    const relay = { ...done, roads: { ...done.roads, [edgeId]: 'p1' }, relays: [edgeId] };
    expect(chartPoints(relay, 'p0')).toBe(0);
    // A relay station of your own changes nothing.
    expect(chartPoints({ ...relay, roads: { ...done.roads, [edgeId]: 'p0' } }, 'p0')).toBe(1);
  });

  it('score for the player alone beside the tile, even when a rival made the last chart', () => {
    const { g, hex } = almostFull();
    grant(g, 'p1', { lodestone: 1 });
    g.turnIndex = 1;
    const next = finish(g, hex, 'p1');
    expect([chartPoints(next, 'p0'), chartPoints(next, 'p1')]).toEqual([1, 0]);
  });

  it('score for no one while two players are beside the tile', () => {
    const { g, hex } = almostFull();
    g.buildings[hex.vertexIds[3]!] = { playerId: 'p1', kind: 'settlement' };
    const next = finish(g, hex);
    expect(chartScorer(next, sameHex(next, hex))).toBeNull();
    expect(next.log.at(-1)!.text).toContain('No one scores it yet.');
  });

  it('wait for someone to build there when no one is beside the tile', () => {
    const { g, hex } = almostFull();
    g.buildings = {};
    const next = finish(g, hex);
    expect(chartPoints(next, 'p0')).toBe(0);
    next.buildings[hex.vertexIds[0]!] = { playerId: 'p1', kind: 'settlement' };
    expect(chartPoints(next, 'p1')).toBe(1);
  });

  it('can win the game', () => {
    const { g, hex } = almostFull();
    g.settings.victoryPoints = victoryPoints(g, 'p0') + 1;
    const next = finish(g, hex);
    expect(next.phase).toBe('finished');
    expect(next.winnerId).toBe('p0');
  });
});

describe('bots and finished charts', () => {
  it('chart the tile they alone stand beside, and hold off when a rival is there', () => {
    const { g, hex } = almostFull();
    expect(finishMove(getView(g, 'p0'))).toEqual({ type: 'chart-hex', hexId: hex.id });
    g.buildings[hex.vertexIds[3]!] = { playerId: 'p1', kind: 'settlement' };
    expect(finishTarget(getView(g, 'p0'))).not.toBe(hex.id);
  });
});

describe('rooms saved with chart claims', () => {
  it('drop the claim and score by who is beside the tile', () => {
    const { g, hex } = almostFull();
    hex.extra = [5, 4];
    const old = structuredClone(g);
    old.schemaVersion = 28;
    Object.assign(sameHex(old, hex), { chartedBy: 'p1' });
    const up = normalizeGame(old, TEST_NOW);
    expect(sameHex(up, hex)).not.toHaveProperty('chartedBy');
    expect(chartPoints(up, 'p0')).toBe(1);
  });
});

describe('rooms saved with survey ships', () => {
  it('keep each ship as a plain ship and its point as a bonus point', () => {
    const g = cartographersGame();
    const edgeId = g.board.edges[0]!.id;
    g.ships[edgeId] = 'p1';
    const points = victoryPoints(g, 'p1');
    const old = structuredClone(g) as unknown as Record<string, unknown> & GameState;
    old.schemaVersion = 27;
    old.surveys = [edgeId, 'sunk'] as never;
    old.stats.p1!.built = { survey: 1, road: 2 } as never;
    old.log = [{ id: 1, text: 'x', event: { kind: 'build', playerId: 'p1', piece: 'survey' } }] as never;
    const up = normalizeGame(old, TEST_NOW);
    expect(up).not.toHaveProperty('surveys');
    expect(up.ships[edgeId]).toBe('p1');
    expect(victoryPoints(up, 'p1')).toBe(points + 1);
    expect(up.stats.p1!.built).toEqual({ road: 2 });
    expect(up.log[0]!.event).toMatchObject({ piece: 'ship' });
  });
});
