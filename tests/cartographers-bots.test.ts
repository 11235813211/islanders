import { describe, expect, it } from 'vitest';
import { BUILTIN_BOARDS } from '../shared/maps';
import { playBotGame } from './bot-harness';

const compass = BUILTIN_BOARDS.find(b => b.id === 'compass-sea')!;

describe('Advanced bots on Cartographers maps', () => {
  // Before the planner knew lodestone, four Advanced bots fit out about one survey ship in 25 games.
  it('save lodestone for survey ships and fit them out', () => {
    let surveys = 0;
    for (const seed of [1, 2, 3, 4]) {
      const end = playBotGame(['advanced', 'advanced', 'advanced', 'advanced'], seed, 9000, compass);
      expect(end.phase).toBe('finished');
      surveys += end.surveys.length;
    }
    expect(surveys).toBeGreaterThanOrEqual(4);
  }, 60_000);
});
