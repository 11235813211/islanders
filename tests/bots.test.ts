import { describe, expect, it } from 'vitest';
import { chooseBotAction } from '../shared/bots';
import { advanceTime, applyAction, botDueAt, getView } from '../shared/engine';
import { bankGold, pendingBotActor } from '../shared/engine/time';
import { BUILTIN_BOARDS } from '../shared/maps';
import { playBotGame, tournament } from './bot-harness';
import { makeLobby, seaLobby, seeded, TEST_NOW } from './fixtures';

describe('bot seats', () => {
  it.each(['beginner', 'intermediate', 'advanced'] as const)('three %s bots finish a game on their own', level => {
    const g = playBotGame([level, level, level], 7);
    expect(g.phase).toBe('finished');
    expect(g.winnerId).not.toBeNull();
  });

  it('advanced bots finish games on every built-in sea map', () => {
    for (const [i, design] of BUILTIN_BOARDS.entries()) {
      const levels = Array(design.players.min).fill('advanced');
      expect(playBotGame(levels, 20 + i, 9000, design).phase).toBe('finished');
    }
  }, 120_000);

  /**
   * Rooms run on the Workers free plan: a bot move must stay cheap. Setup (the draft lookahead)
   * is the most expensive decision; check it on a six-player table and a large sea map.
   */
  it('advanced bot moves stay within the CPU budget', () => {
    const tables = [
      () => makeLobby(6),
      () => seaLobby(BUILTIN_BOARDS.find(b => b.id === 'wide-sea')!, 6),
      () => seaLobby(BUILTIN_BOARDS.find(b => b.id === 'four-isles')!, 4),
    ];
    const times: number[] = [];
    const slowest = { ms: 0, phase: '' };
    for (const table of tables) {
      const random = seeded(3);
      let g = table();
      for (const p of g.players) p.bot = 'advanced';
      g = applyAction(g, 'p0', { type: 'start' }, random, TEST_NOW);
      for (let step = 0; step < 400 && g.phase !== 'finished'; step++) {
        const id = pendingBotActor(g)!;
        const view = getView(g, id);
        const started = performance.now();
        const action = chooseBotAction(view, { level: 'advanced' });
        const ms = performance.now() - started;
        times.push(ms);
        if (ms > slowest.ms) Object.assign(slowest, { ms, phase: `${view.phase} (${view.players.length} players)` });
        try {
          g = applyAction(g, id, action, random, TEST_NOW);
        } catch {
          g = advanceTime(g, botDueAt(g)! + 120_000, random);
        }
      }
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)]!;
    const worst = times.at(-1)!;
    console.log(
      `advanced move ms: median ${median.toFixed(2)}, p99 ${times[Math.floor(times.length * 0.99)]!.toFixed(2)}, max ${worst.toFixed(2)} in ${slowest.phase}`,
    );
    expect(median).toBeLessThan(3);
    expect(worst).toBeLessThan(40);
  }, 60_000);

  it('a gold pick the bank can pay is always available', () => {
    let g = applyAction(makeLobby(2), 'p0', { type: 'start' }, seeded(), TEST_NOW);
    g.phase = 'gold';
    g.pendingGold = { p0: 3 };
    g.bank = { wood: 1, brick: 0, sheep: 0, wheat: 1, ore: 0 };
    const action = bankGold(g, 'p0');
    expect(action).toEqual({ type: 'choose-gold', resources: { wood: 1, brick: 0, sheep: 0, wheat: 1, ore: 0 } });
    g = applyAction(g, 'p0', action, seeded(), TEST_NOW);
    expect(g.pendingGold).toEqual({});
  });

  /**
   * Strength report: GAMES=240 npx vitest run tests/bots.test.ts -t report
   * For real measurements use the training tools (training/README.md): they run on every map.
   */
  it('report: head-to-head strength', () => {
    const started = Date.now();
    const wins = tournament(['beginner', 'intermediate', 'advanced'], Number(process.env.GAMES ?? 30));
    console.log('tournament', JSON.stringify(wins), `${Date.now() - started}ms`);
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
