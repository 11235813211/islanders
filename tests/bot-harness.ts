import { advanceTime, applyAction, botDueAt } from '../shared/engine';
import type { BoardDesign } from '../shared/maps';
import type { BotLevel, GameState } from '../shared/types';
import { conserved, inSeatOrder, makeLobby, seaLobby, seeded, TEST_NOW } from './fixtures';

/**
 * Play one complete game where every seat is a bot, driven only by
 * advanceTime (the same path the room's alarm uses). Throws if the game
 * stalls or resources stop adding up. `onStep` sees every state along the way.
 */
export function playBotGame(
  levels: BotLevel[],
  seed: number,
  maxSteps = 6000,
  design?: BoardDesign,
  onStep?: (state: GameState) => void,
): GameState {
  const random = seeded(seed);
  let g = design ? seaLobby(design, levels.length, seed) : makeLobby(levels.length);
  g.players.forEach((p, i) => {
    p.bot = levels[i];
  });
  g = inSeatOrder(applyAction(g, 'p0', { type: 'start' }, random, TEST_NOW));
  let now = TEST_NOW;
  for (let step = 0; step < maxSteps && g.phase !== 'finished'; step++) {
    const due = botDueAt(g);
    if (due === null) throw new Error(`No bot wants to act in phase ${g.phase} (turn ${g.turn}).`);
    now = Math.max(now, due);
    const next = advanceTime(g, now, random);
    if (next === g) throw new Error(`Bot made no progress in phase ${g.phase}.`);
    g = next;
    if (!conserved(g)) throw new Error(`Resources stopped adding up on turn ${g.turn}.`);
    onStep?.(g);
  }
  return g;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest]),
  );
}

/**
 * Win counts per level over many seeded games. Cycles through every seat order,
 * so neither playing first nor sitting after a weak bot favors any level.
 */
export function tournament(
  levels: BotLevel[],
  games: number,
  firstSeed = 1,
  /** Maps to cycle through (sea maps); the standard island when empty. */
  designs: BoardDesign[] = [],
): Record<BotLevel, number> & { unfinished: number; turns: number } {
  const wins = { beginner: 0, intermediate: 0, advanced: 0, unfinished: 0, turns: 0 };
  for (let i = 0; i < games; i++) {
    const orders = permutations(levels);
    const seats = orders[i % orders.length]!;
    const design = designs.length ? designs[i % designs.length] : undefined;
    const g = playBotGame(seats, firstSeed + i, design ? 9000 : 6000, design);
    const winner = g.players.find(p => p.id === g.winnerId);
    wins.turns += g.turn / games;
    if (winner?.bot) wins[winner.bot]++;
    else wins.unfinished++;
  }
  return wins;
}
