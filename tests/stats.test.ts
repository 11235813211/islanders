import { describe, expect, it } from 'vitest';
import { applyAction, getView, normalizeGame } from '../shared/engine';
import { emptyBag } from '../shared/engine/core';
import type { GameState } from '../shared/types';
import { grant, TEST_NOW as now, seeded, settled } from './fixtures';

const act = (g: GameState, id: string, action: Parameters<typeof applyAction>[2]) =>
  applyAction(g, id, action, seeded(), now);
const total = (counts: Partial<Record<string | number, number>>) =>
  Object.values(counts).reduce<number>((n, c) => n + (c ?? 0), 0);

describe('end-of-game stats', () => {
  it('counts setup pieces and setup cards for every player', () => {
    const g = settled(3);
    for (const id of ['p0', 'p1', 'p2']) {
      const stats = g.stats[id]!;
      expect(stats.built).toMatchObject({ settlement: 2, road: 2 });
      const hand = g.players.find(p => p.id === id)!.resources;
      expect(stats.cardsIn.setup).toBe(total(hand));
    }
  });

  it('records the roller’s total and pays production by resource', () => {
    const g = act(settled(3), 'p0', { type: 'roll' });
    const face = g.dice![0] + g.dice![1];
    expect(g.stats.p0!.rolls[face]).toBe(1);
    for (const player of g.players) {
      const stats = g.stats[player.id]!;
      expect(total(stats.produced)).toBe(stats.cardsIn.roll ?? 0);
    }
  });

  it('counts build spending, bank trades, and discards', () => {
    let g = settled(3);
    g.phase = 'build';
    const rate = getView(g, 'p0').tradeRates.wood;
    grant(g, 'p0', { wood: rate + 1, brick: 1 });
    const spentBefore = g.stats.p0!.cardsOut.build ?? 0;
    const road = getView(g, 'p0').legal.roads[0]!;
    g = act(g, 'p0', { type: 'build-road', edgeId: road });
    expect(g.stats.p0!.cardsOut.build).toBe(spentBefore + 2);
    expect(g.stats.p0!.built.road).toBe(3);
    g = act(g, 'p0', {
      type: 'bank-trade',
      give: { ...emptyBag(), wood: rate },
      receive: { ...emptyBag(), ore: 1 },
    });
    expect(g.stats.p0).toMatchObject({ bankTrades: 1, cardsOut: { bank: rate }, cardsIn: { bank: 1 } });

    const d = settled(3);
    d.phase = 'discard';
    d.pendingDiscards = { p1: 1 };
    const have = d.players[1]!.resources;
    const resource = (Object.keys(have) as (keyof typeof have)[]).find(r => have[r] > 0)!;
    const after = act(d, 'p1', { type: 'discard', resources: { ...emptyBag(), [resource]: 1 } });
    expect(after.stats.p1!.cardsOut.discard).toBe(1);
  });

  it('hides per-player rolls mid-game when the room does not track dice', () => {
    const g = act(settled(3), 'p0', { type: 'roll' });
    g.settings.trackDice = false;
    expect(getView(g, 'p1').players[0]!.stats.rolls).toEqual({});
    g.phase = 'finished';
    expect(total(getView(g, 'p1').players[0]!.stats.rolls)).toBe(1);
  });

  it('carries old stored totals into the new shape', () => {
    const g = settled(3);
    const legacy = structuredClone(g) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 9;
    legacy.stats = { p0: { gained: 5, stolen: 2, lost: 1, discarded: 4, trades: 3 } };
    const migrated = normalizeGame(legacy as unknown as GameState, now);
    expect(migrated.stats.p0).toMatchObject({
      cardsIn: { roll: 5, steal: 2 },
      cardsOut: { steal: 1, discard: 4 },
      trades: 3,
      rolls: {},
    });
  });
});
