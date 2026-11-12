import { shuffled } from '../board';
import type { GameState } from '../types';

/** Balanced dice reshuffle all 36 combinations once this few cards are left (Colonist's tuned value). */
const RESHUFFLE_AT = 12;
/** Chance cut for drawing the same total as the last roll (Colonist: 30% less likely). */
const REPEAT_CUT = 0.3;

const die = (random: () => number) => Math.floor(random() * 6) + 1;

function fullDeck(random: () => number): [number, number][] {
  const cards: [number, number][] = [];
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) cards.push([a, b]);
  return shuffled(cards, random);
}

/**
 * The two dice for a roll. Random mode is plain; balanced draws from a deck of the 36 combinations,
 * and sometimes skips a card that repeats the last total so streaks are rarer.
 */
export function rollDice(state: GameState, random: () => number): [number, number] {
  if (state.settings.diceMode !== 'balanced') return [die(random), die(random)];
  if (state.diceDeck.length <= RESHUFFLE_AT) state.diceDeck = fullDeck(random);
  let index = 0;
  const repeats = (i: number) => state.diceDeck[i]![0] + state.diceDeck[i]![1] === state.lastRollTotal;
  if (repeats(index) && random() < REPEAT_CUT) {
    const other = state.diceDeck.findIndex((_, i) => !repeats(i));
    if (other >= 0) index = other;
  }
  const [card] = state.diceDeck.splice(index, 1);
  state.lastRollTotal = card![0] + card![1];
  return card!;
}
