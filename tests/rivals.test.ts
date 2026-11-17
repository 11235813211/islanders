import { describe, expect, it } from 'vitest';
import { Economy } from '../shared/bots/advanced/economy';
import { TRAINED } from '../shared/bots/advanced/params';
import { races } from '../shared/bots/advanced/rivals';
import { getView } from '../shared/engine';
import type { GameState } from '../shared/types';
import { playBotGame } from './bot-harness';

/** Mid-game states of a real Advanced game (after setup). */
function midGame(): GameState[] {
  const out: GameState[] = [];
  let i = 0;
  playBotGame(['advanced', 'advanced', 'advanced'], 5, 6000, undefined, g => {
    if (!g.phase.startsWith('setup') && g.phase === 'roll' && i++ % 4 === 0) out.push(g);
  });
  return out;
}

describe('rival model', () => {
  it('spreads each player’s next settlement over a few open corners', () => {
    for (const g of midGame()) {
      const econ = new Economy(getView(g, 'p0'), TRAINED.knobs);
      const r = races(econ);
      expect(r.intents).toHaveLength(g.players.length);
      for (const list of r.intents) {
        expect(list.length).toBeLessThanOrEqual(3);
        if (!list.length) continue;
        expect(list.reduce((s, t) => s + t.share, 0)).toBeCloseTo(1, 5);
        // Targets are open land corners (no building on them).
        for (const t of list) expect(g.buildings[econ.geo.ids[t.corner]!]).toBeUndefined();
      }
      for (const list of r.intents)
        for (const t of list) {
          const p = r.oursAt(t.corner);
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(1);
        }
    }
  });
});
