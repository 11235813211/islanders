import { afterEach, describe, expect, it } from 'vitest';
import { BOTS } from '../shared/bots';
import { makeAdvanced } from '../shared/bots/advanced';
import { type Pace, roundsToAfford } from '../shared/bots/advanced/goals';
import { makeParams, TRAINED } from '../shared/bots/advanced/params';
import type { BotThought } from '../shared/bots/types';
import { advanceTime, applyAction, type BotThinking, botDueAt, getView, thinkAhead } from '../shared/engine';
import { emptyBag } from '../shared/engine/core';
import { type GameState, RESOURCES } from '../shared/types';
import { playBotGame } from './bot-harness';
import { inSeatOrder, makeLobby, seeded, TEST_NOW } from './fixtures';

const forecasting = makeAdvanced(makeParams({ ...TRAINED, knobs: { ...TRAINED.knobs, setupForecast: 0.25 } }));
const shipped = BOTS.advanced.brain;

afterEach(() => {
  BOTS.advanced.brain = shipped;
});

/** The plain search `roundsToAfford` must agree with exactly. */
function bisected(hand: Pace['income'], pace: Pace, cost: Pace['income']): number {
  const covered = (t: number) => {
    let credit = pace.wild * t;
    let need = 0;
    for (const r of RESOURCES) {
      const left = hand[r] + pace.income[r] * t - cost[r];
      if (left >= 0) credit += left / pace.rates[r];
      else need -= left;
    }
    return credit >= need;
  };
  if (covered(0)) return 0;
  if (!covered(30)) return 30;
  let [lo, hi] = [0, 30];
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (covered(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** A six-player table at its first placement, every seat an Advanced bot. */
function botTable(): GameState {
  const lobby = makeLobby(6);
  for (const p of lobby.players) p.bot = 'advanced';
  return inSeatOrder(applyAction(lobby, 'p0', { type: 'start' }, seeded(5), TEST_NOW));
}

/** Runs every piece of the placement due at `now`. */
function thinkThrough(g: GameState, now: number): { thinking: BotThinking | null; pieces: number } {
  let thinking: BotThinking | null = null;
  let pieces = 0;
  for (;;) {
    const next = thinkAhead(g, now, thinking);
    if (!next) return { thinking, pieces };
    thinking = next;
    pieces++;
  }
}

describe('placement in pieces', () => {
  it('finds the same wait as a plain search', () => {
    const random = seeded(11);
    const bag = (most: number) => {
      const out = emptyBag();
      for (const r of RESOURCES) out[r] = random() < 0.3 ? 0 : random() * most;
      return out;
    };
    for (let i = 0; i < 3000; i++) {
      const rates = { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 4, lodestone: 4 };
      for (const r of RESOURCES) if (random() < 0.3) rates[r] = random() < 0.5 ? 2 : 3;
      const pace: Pace = { income: bag(1), wild: random() < 0.8 ? 0 : random() / 2, rates };
      const [hand, cost] = [bag(4), bag(4)];
      expect(roundsToAfford(hand, pace, cost)).toBe(bisected(hand, pace, cost));
    }
  });

  it('chooses the same corner in pieces as all at once', () => {
    let placements = 0;
    playBotGame(['advanced', 'advanced', 'advanced', 'advanced', 'advanced', 'advanced'], 8, 80, undefined, g => {
      if (g.phase !== 'setup-settlement') return;
      const view = getView(g, g.setupOrder[g.setupIndex]!);
      let thought: BotThought | undefined;
      let pieces = 0;
      for (let next = forecasting.think!(view); next; next = forecasting.think!(view, thought)) {
        thought = next;
        pieces++;
      }
      expect(pieces).toBeLessThanOrEqual(3);
      expect(forecasting.turn(view, { thought })).toEqual(forecasting.turn(view, {}));
      placements++;
    });
    expect(placements).toBeGreaterThan(0);
  });

  it('thinks without changing the game, then makes the same move', () => {
    BOTS.advanced.brain = forecasting;
    const g = botTable();
    const now = botDueAt(g)!;
    const before = structuredClone(g);
    const { thinking, pieces } = thinkThrough(g, now);
    expect(pieces).toBeGreaterThanOrEqual(2);
    expect(g).toEqual(before);
    const split = advanceTime(g, now, seeded(1), thinking);
    expect(split).toEqual(advanceTime(g, now, seeded(1)));
    expect(split.version).toBeGreaterThan(g.version);
  });

  it('does nothing before the move is due, and drops work from another position', () => {
    BOTS.advanced.brain = forecasting;
    const g = botTable();
    const now = botDueAt(g)!;
    expect(thinkAhead(g, now - 1)).toBeNull();
    const first = thinkAhead(g, now)!;
    const next = advanceTime(g, now, seeded(1));
    const later = advanceTime(next, botDueAt(next)!, seeded(2));
    expect(later.phase).toBe('setup-settlement');
    const fresh = thinkAhead(later, botDueAt(later)!, first)!;
    expect(fresh.key).not.toBe(first.key);
    expect(fresh.thought.edges).toEqual([]);
  });

  it('is not used by a bot with the forecast off', () => {
    const g = botTable();
    expect(thinkAhead(g, botDueAt(g)!)).toBeNull();
  });
});
