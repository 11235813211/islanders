import { describe, expect, it } from 'vitest';
import { victoryPoints } from '../shared/rules';
import type { BotLevel } from '../shared/types';
import { playBotGame } from './bot-harness';

const KNIGHTS = { citiesKnights: true, victoryPoints: 13 };

describe('bots play Cities & Knights', () => {
  it.each([
    [['beginner', 'intermediate', 'advanced'] as BotLevel[], 1],
    [['advanced', 'advanced', 'advanced', 'advanced'] as BotLevel[], 2],
    [['intermediate', 'beginner'] as BotLevel[], 3],
  ])('%j finish a game (seed %i)', (levels, seed) => {
    let attacks = 0;
    let improved = false;
    const end = playBotGame(
      levels,
      seed,
      12_000,
      undefined,
      g => {
        attacks = Math.max(attacks, g.ck!.attacks);
        improved ||= Object.values(g.ck!.improvements).some(t => t.trade + t.politics + t.science > 0);
      },
      KNIGHTS,
    );
    expect(end.phase).toBe('finished');
    expect(victoryPoints(end, end.winnerId!)).toBeGreaterThanOrEqual(13);
    expect(attacks).toBeGreaterThan(0);
    expect(improved).toBe(true);
  });
});
