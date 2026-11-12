import { describe, expect, it } from 'vitest';
import { createGame } from '../shared/engine';
import { rollDice } from '../shared/engine/dice';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { seeded } from './fixtures';

function balancedGame() {
  const game = createGame('DICE42', seeded());
  game.settings = { ...DEFAULT_SETTINGS, diceMode: 'balanced' };
  return game;
}

describe('balanced dice', () => {
  it('draws every combination once per fresh deck and reshuffles at 12 left', () => {
    const game = balancedGame();
    const random = seeded(3);
    const first = Array.from({ length: 24 }, () => rollDice(game, random).join(''));
    expect(new Set(first).size).toBe(24);
    expect(game.diceDeck).toHaveLength(12);
    rollDice(game, random);
    expect(game.diceDeck).toHaveLength(35);
  });
});
