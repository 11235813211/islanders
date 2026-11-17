import { describe, expect, it } from 'vitest';
import { actWith } from '../shared/bots';
import { makeAdvanced } from '../shared/bots/advanced';
import type { Net } from '../shared/bots/advanced/net';
import { TRAINED } from '../shared/bots/advanced/params';
import { SELECTOR_INPUTS, type Selector, selectStrategy } from '../shared/bots/advanced/selector';
import { goalLean, STRATEGIES, withStrategy } from '../shared/bots/advanced/strategy';
import { applyAction, getView } from '../shared/engine';
import { pendingBotActor } from '../shared/engine/time';
import type { GameState } from '../shared/types';
import { playBotGame } from './bot-harness';
import { seeded, TEST_NOW } from './fixtures';

/** A selector network that ignores its inputs and always predicts `p`. */
function constant(p: number): Net {
  const n = SELECTOR_INPUTS.length;
  return {
    inputs: SELECTOR_INPUTS,
    mean: new Array(n).fill(0),
    scale: new Array(n).fill(1),
    layers: [{ w: [new Array(n).fill(0)], b: [Math.log(p / (1 - p))] }],
  };
}

/** States from a real Advanced game, every `every`-th step. */
function samples(every: number): GameState[] {
  const out: GameState[] = [];
  let i = 0;
  playBotGame(['advanced', 'advanced', 'advanced'], 11, 6000, undefined, g => {
    if (i++ % every === 0) out.push(g);
  });
  return out;
}

describe('strategies and the strategy selector', () => {
  it('lean goals only for the chosen strategy', () => {
    const knobs = TRAINED.knobs;
    for (const kind of ['city', 'settlement', 'route', 'development', 'road', 'survey', 'explore'] as const)
      expect(goalLean(withStrategy(knobs, 'current'), kind)).toBe(1);
    expect(goalLean(withStrategy(knobs, 'cities'), 'city')).toBeGreaterThan(1);
    expect(goalLean(withStrategy(knobs, 'cards'), 'development')).toBeGreaterThan(1);
    expect(goalLean(withStrategy(knobs, 'expand'), 'settlement')).toBeGreaterThan(1);
  });

  it('picks the strategy predicted best, or none below the margin', () => {
    const view = getView(samples(200)[1]!, 'p0');
    const selector: Selector = { cards: constant(0.7), cities: constant(0.55), expand: constant(0.3) };
    expect(selectStrategy(view, TRAINED.knobs, selector)).toBe('cards');
    expect(selectStrategy(view, { ...TRAINED.knobs, selectorMargin: 0.25 }, selector)).toBeNull();
    // Sea and Cartographers strategies don't apply on the standard island.
    expect(selectStrategy(view, TRAINED.knobs, { explore: constant(0.9), chart: constant(0.9) })).toBeNull();
  });

  it('a bot with a selector plays legal moves throughout a game', () => {
    const selector: Selector = Object.fromEntries(
      STRATEGIES.filter(s => s !== 'current').map((s, i) => [s, constant(0.45 + 0.04 * i)]),
    );
    const brain = makeAdvanced({ ...TRAINED, selector });
    const random = seeded(3);
    let tried = 0;
    for (const g of samples(7)) {
      const actor = pendingBotActor(g);
      if (!actor) continue;
      const action = actWith(brain, getView(g, actor));
      expect(() => applyAction(g, actor, action, random, TEST_NOW)).not.toThrow();
      tried++;
    }
    expect(tried).toBeGreaterThan(30);
  });
});
