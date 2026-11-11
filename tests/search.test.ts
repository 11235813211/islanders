import { describe, expect, it } from 'vitest';
import { BOTS } from '../shared/bots';
import { type GameState, RESOURCES } from '../shared/types';
import { drawScenario } from '../training/scenarios';
import { determinize } from '../training/search';
import { playGame, seeded } from '../training/sim';

/** A four-player standard-island game paused mid-game at seat p0's build phase. */
function midGame(): GameState {
  let found: GameState | null = null;
  const brains = Array.from({ length: 4 }, () => BOTS.intermediate.brain);
  playGame(drawScenario(3, { maps: ['base'], players: [4] }), brains, 3, {
    beforeMove(state, seat) {
      if (!found && seat === 0 && state.phase === 'build' && state.turn > 24 && !state.tradeOffer) {
        const hands = state.players.slice(1).filter(p => RESOURCES.some(r => p.resources[r] > 0));
        if (hands.length >= 2) found = structuredClone(state);
      }
    },
  });
  if (!found) throw new Error('no mid-game position');
  return found;
}

/** The same position with hidden facts changed: two opponents trade a card, the deck reordered. */
function withOtherSecrets(state: GameState): GameState {
  const g = structuredClone(state);
  const [a, b] = g.players.slice(1).filter(p => RESOURCES.some(r => p.resources[r] > 0));
  const ra = RESOURCES.find(r => a!.resources[r] > 0)!;
  const rb = RESOURCES.find(r => r !== ra && b!.resources[r] > 0) ?? ra;
  a!.resources[ra]--;
  b!.resources[ra]++;
  b!.resources[rb]--;
  a!.resources[rb]++;
  g.developmentDeck.reverse();
  return g;
}

const secrets = (g: GameState) => ({
  hands: g.players.map(p => p.resources),
  cards: g.players.map(p => p.development.map(c => c.kind)),
  deck: g.developmentDeck.map(c => c.kind),
  bank: g.bank,
});

describe('search samples (training/search.ts)', () => {
  const state = midGame();

  it('depend only on what the seat can see', () => {
    expect(secrets(withOtherSecrets(state))).not.toEqual(secrets(state));
    const one = determinize(state, 'p0', seeded(11));
    const two = determinize(withOtherSecrets(state), 'p0', seeded(11));
    expect(secrets(two)).toEqual(secrets(one));
  });

  it('keep every hand size, our own hand, and the card supply', () => {
    const sample = determinize(state, 'p0', seeded(5));
    expect(sample.players[0]).toEqual(state.players[0]);
    sample.players.forEach((p, i) => {
      const count = (bag: typeof p.resources) => RESOURCES.reduce((n, r) => n + bag[r], 0);
      expect(count(p.resources)).toBe(count(state.players[i]!.resources));
      expect(p.development.length).toBe(state.players[i]!.development.length);
    });
    for (const r of RESOURCES) {
      const total = (g: GameState) => g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0);
      expect(total(sample)).toBe(total(state));
    }
  });
});
