import { BUILD_COSTS } from '../engine/core';
import type { ClassicResource, GameAction, GameView } from '../types';

/**
 * Which card a bot takes off the candy train: the one that brings it closest to a city or a
 * settlement (what it holds least of, against what those cost), ties going to the card the train
 * has most of. Cheap on purpose: this runs on every pick.
 */
export function candyChoice(view: GameView): GameAction {
  const cards = view.candyLoad?.cards ?? [];
  const wanted = (r: ClassicResource) => BUILD_COSTS.city[r] + BUILD_COSTS.settlement[r] - view.hand[r] * 0.9;
  const onTrain = (r: ClassicResource) => cards.filter(c => c === r).length;
  const [best] = [...new Set(cards)].sort((a, b) => wanted(b) - wanted(a) || onTrain(b) - onTrain(a));
  return { type: 'take-candy', resource: best ?? 'wood' };
}
