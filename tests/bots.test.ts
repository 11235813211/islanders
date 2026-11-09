import { describe, expect, it } from 'vitest';
import { ADVANCED } from '../shared/bots/strategic';
import { BUILTIN_BOARDS } from '../shared/maps';
import { playBotGame, tournament } from './bot-harness';

describe('bot seats', () => {
  it.each(['beginner', 'intermediate', 'advanced'] as const)('three %s bots finish a game on their own', level => {
    const g = playBotGame([level, level, level], 7);
    expect(g.phase).toBe('finished');
    expect(g.winnerId).not.toBeNull();
  });

  /**
   * Strength report, also a tuning tool:
   *   GAMES=180 PROFILE='{"handSafety":false}' npx vitest run tests/bots.test.ts -t report
   * PROFILE overrides the Advanced profile for this run only.
   */
  it('report: head-to-head strength', () => {
    if (process.env.PROFILE) Object.assign(ADVANCED, JSON.parse(process.env.PROFILE));
    const started = Date.now();
    const wins = tournament(['beginner', 'intermediate', 'advanced'], Number(process.env.GAMES ?? 30));
    console.log('tournament', JSON.stringify(ADVANCED), JSON.stringify(wins), `${Date.now() - started}ms`);
    expect(wins.unfinished).toBe(0);
  }, 600_000);

  /** The same on the built-in sea maps: `GAMES=60 npx vitest run tests/bots.test.ts -t "sea report"`. */
  it('sea report: head-to-head strength on sea maps', () => {
    const started = Date.now();
    const sea = BUILTIN_BOARDS.filter(b => b.players.min <= 3 && b.players.max >= 3);
    const wins = tournament(['beginner', 'intermediate', 'advanced'], Number(process.env.GAMES ?? 12), 1, sea);
    console.log('sea tournament', JSON.stringify(wins), `${Date.now() - started}ms`);
    expect(wins.unfinished).toBe(0);
  }, 900_000);
});
