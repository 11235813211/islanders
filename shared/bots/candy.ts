import { candyRun } from '../engine/candy';
import { BUILD_COSTS, emptyBag } from '../engine/core';
import type { ClassicResource, GameAction, GameView } from '../types';

/**
 * Which cards a bot takes off the candy train, one per pick in its run: each time the one that
 * brings it closest to a city or a settlement (what it holds least of, counting cards already
 * chosen, against what those cost), ties going to the card the train has most of. Cheap on
 * purpose: this runs on every pick.
 */
export function candyChoice(view: GameView): GameAction {
  const cards = [...(view.candyLoad?.cards ?? [])];
  const hand = { ...view.hand };
  const wanted = (r: ClassicResource) => BUILD_COSTS.city[r] + BUILD_COSTS.settlement[r] - hand[r] * 0.9;
  const onTrain = (r: ClassicResource) => cards.filter(c => c === r).length;
  const taken: ClassicResource[] = [];
  for (let i = Math.max(1, candyRun(view.candyLoad, view.selfId)); i > 0 && cards.length; i--) {
    const [best] = [...new Set(cards)].sort((a, b) => wanted(b) - wanted(a) || onTrain(b) - onTrain(a));
    cards.splice(cards.indexOf(best!), 1);
    hand[best!]++;
    taken.push(best!);
  }
  const [first = 'wood', ...rest] = taken;
  if (!rest.length) return { type: 'take-candy', resource: first };
  const more = emptyBag();
  for (const r of rest) more[r]++;
  return { type: 'take-candy', resource: first, more };
}
