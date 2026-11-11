import { describe, expect, it } from 'vitest';
import { getView } from '../shared/engine';
import { BUILTIN_BOARDS } from '../shared/maps';
import { RESOURCES } from '../shared/types';
import { playBotGame } from './bot-harness';

const sum = (bag: Record<string, number>) => RESOURCES.reduce((n, r) => n + bag[r]!, 0);

describe('public card count (engine/hands.ts)', () => {
  it('is exact for hands never stolen from, always adds up, and only bots receive it', () => {
    // A sea map too: gold, ships, and the pirate's steals.
    const sea = BUILTIN_BOARDS.find(b => b.id === 'fire-and-ice')!;
    for (const [seed, design] of [
      [3, undefined],
      [4, sea],
    ] as const) {
      const robbed = new Set<string>();
      let checked = 0;
      let exact = 0;
      playBotGame(['advanced', 'intermediate', 'advanced', 'beginner'], seed, 6000, design, g => {
        for (const e of g.log) if (e.event?.kind === 'steal') robbed.add(e.event.victimId).add(e.event.thiefId);
        for (const p of g.players) {
          const likely = g.handGuess.likely[p.id]!;
          expect(sum(likely)).toBeCloseTo(sum(p.resources), 6);
          for (const r of RESOURCES) expect(likely[r]).toBeGreaterThanOrEqual(0);
          checked++;
          if (robbed.has(p.id)) continue;
          for (const r of RESOURCES) expect(likely[r]).toBeCloseTo(p.resources[r], 6);
          exact++;
        }
      });
      expect(exact).toBeGreaterThan(0);
      expect(checked).toBeGreaterThan(exact);
    }
  });

  it('is sent to bot seats only', () => {
    const g = playBotGame(['beginner', 'beginner', 'beginner'], 5, 200);
    expect(getView(g, 'p0').likelyHands).not.toBeNull();
    g.players[1]!.bot = undefined;
    expect(getView(g, 'p1').likelyHands).toBeNull();
  });
});
