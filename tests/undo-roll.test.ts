import { describe, expect, it } from 'vitest';
import { chooseBotAction } from '../shared/bots';
import { advanceTime, applyAction, botDueAt, getActivePlayerId, getView } from '../shared/engine';
import { GameError } from '../shared/engine/core';
import type { GameState } from '../shared/types';
import { conserved, inSeatOrder, makeLobby, seeded, TEST_NOW } from './fixtures';

/** Rolls logged for each turn number (a turn must never be rolled twice). */
const rollsPerTurn = (g: GameState) => {
  const counts = new Map<number, number>();
  for (const entry of g.log)
    if (entry.event?.kind === 'roll') counts.set(entry.turn ?? 0, (counts.get(entry.turn ?? 0) ?? 0) + 1);
  return counts;
};

describe('undo never takes a turn back before its roll', () => {
  it('in seeded games where people undo whenever they can, no turn is rolled twice', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const random = seeded(seed);
      let g = makeLobby(seed % 2 ? 2 : 3);
      g.testMode = seed % 3 === 0;
      g = inSeatOrder(applyAction(g, 'p0', { type: 'start' }, random, TEST_NOW));
      let now = TEST_NOW;
      for (let step = 0; step < 600 && g.phase !== 'finished'; step++) {
        now += 1000;
        const due = Math.min(botDueAt(g) ?? Number.POSITIVE_INFINITY, g.rollDeadline ?? Number.POSITIVE_INFINITY);
        // Someone with an undo takes it about a third of the time, and everyone else agrees.
        if (g.undo && random() < 0.35) {
          try {
            g = applyAction(g, g.undo.actorId, { type: 'propose', kind: 'undo' }, random, now);
            for (const id of g.proposal?.required ?? [])
              if (g.proposal && !g.proposal.accepted.includes(id))
                g = applyAction(g, id, { type: 'vote', proposalId: g.proposal.id, accept: true }, random, now);
          } catch (error) {
            if (!(error instanceof GameError)) throw error;
          }
          continue;
        }
        if (Number.isFinite(due)) {
          g = advanceTime(g, Math.max(now, due), random);
          continue;
        }
        const id = getActivePlayerId(g)!;
        const discarder = Object.keys(g.pendingDiscards).find(p => g.pendingDiscards[p]! > 0);
        const gold = Object.keys(g.pendingGold)[0];
        const actor = discarder ?? gold ?? id;
        try {
          g = applyAction(g, actor, chooseBotAction(getView(g, actor), { level: 'beginner' }), random, now);
        } catch (error) {
          if (!(error instanceof GameError)) throw error;
          g = advanceTime(g, g.turnDeadline ?? now, random);
        }
        expect(conserved(g), `seed ${seed}, step ${step}`).toBe(true);
      }
      // Undo never removes log entries, so a turn rolled twice would still show two rolls here.
      for (const [turn, rolls] of rollsPerTurn(g)) expect(rolls, `seed ${seed}, turn ${turn}`).toBeLessThanOrEqual(1);
    }
  }, 30_000);
});
