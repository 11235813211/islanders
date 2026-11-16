import { describe, expect, it } from 'vitest';
import { chooseBotAction } from '../shared/bots';
import { Economy } from '../shared/bots/advanced/economy';
import { winningMove } from '../shared/bots/advanced/endgame';
import { TRAINED } from '../shared/bots/advanced/params';
import { applyAction, getView } from '../shared/engine';
import { RESOURCES } from '../shared/types';
import { playBotGame } from './bot-harness';
import { grant, richGame, seeded, TEST_NOW } from './fixtures';

/** p0 in its build phase with two settlements, `points` short of the target, holding exactly `hand`. */
function nearTheEnd(points: number, hand: Parameters<typeof grant>[2]) {
  const g = richGame();
  const p0 = g.players[0]!;
  for (const r of RESOURCES) {
    g.bank[r] += p0.resources[r];
    p0.resources[r] = 0;
  }
  p0.development = [];
  grant(g, 'p0', hand);
  g.settings.victoryPoints = getView(g, 'p0').players[0]!.points + points;
  return g;
}

describe('Advanced endgame check', () => {
  it('trades into two cities when that wins this turn', () => {
    let g = nearTheEnd(2, { ore: 6, wheat: 2, sheep: 8 });
    const random = seeded(5);
    for (let step = 0; step < 8 && g.phase !== 'finished'; step++)
      g = applyAction(g, 'p0', chooseBotAction(getView(g, 'p0'), { level: 'advanced' }), random, TEST_NOW);
    expect(g.winnerId).toBe('p0');
  });

  it('leaves the turn to the planner when no set of builds wins', () => {
    const g = nearTheEnd(3, { ore: 6, wheat: 2, sheep: 8 });
    expect(winningMove(new Economy(getView(g, 'p0'), TRAINED.knobs))).toBeNull();
  });

  it('picks the gold that lets it win on its turn', () => {
    // One point short with a settlement to upgrade: two wheat and two ore in hand, one gold owed.
    const g = nearTheEnd(1, { ore: 2, wheat: 2 });
    g.phase = 'gold';
    g.pendingGold = { p0: 1 };
    expect(chooseBotAction(getView(g, 'p0'), { level: 'advanced' })).toMatchObject({
      type: 'choose-gold',
      resources: { ore: 1, wheat: 0, wood: 0, brick: 0, sheep: 0 },
    });
  });
});

describe('Advanced bots in whole games', () => {
  it('never trade back and forth with the bank within a turn', () => {
    let worst = 0;
    for (const seed of [11, 12, 13, 14]) {
      let turn = -1;
      let trades = 0;
      let seen = -1;
      playBotGame(['advanced', 'advanced', 'advanced', 'advanced'], seed, 9000, undefined, g => {
        if (g.turn !== turn) [turn, trades] = [g.turn, 0];
        // The log keeps only its last 60 entries, so new ones are found by id.
        for (const entry of g.log)
          if (entry.id > seen && entry.event?.kind === 'bank-trade') worst = Math.max(worst, ++trades);
        seen = g.log.at(-1)?.id ?? seen;
      });
    }
    expect(worst).toBeGreaterThan(0); // bank trades were seen at all
    expect(worst).toBeLessThanOrEqual(6);
  }, 60_000);
});
