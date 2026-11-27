// Christmas Candy trains (room setting `christmasCandy`, tracks in `board.trains`). When a train's
// number is rolled it is loaded from the bank with one random standard card per pick, plus
// CANDY_SPARE more. Each settlement on its track picks one card (a city two), from the start
// station to the end, so the first picks have the most choice. Leftovers go back to the bank.
import { trainCorners } from '../maps/candy-board';
import { type CandyLoad, CLASSIC_RESOURCES, type ClassicResource, type GameState } from '../types';
import { addLog, type Handlers, needPhase, requireRule, tally } from './core';
import { afterCandy } from './turn';

/** Cards loaded beyond one per pick, so even the last pick has a choice. */
export const CANDY_SPARE = 2;

/** Who picks from a train, in track order: each settlement once, each city twice. */
export function candyPicks(state: Pick<GameState, 'board' | 'buildings'>, train: number): CandyLoad['picks'] {
  return trainCorners(state.board.trains?.[train]).flatMap(vertexId => {
    const building = state.buildings[vertexId];
    if (!building) return [];
    const pick = { playerId: building.playerId, vertexId };
    return building.kind === 'city' ? [pick, pick] : [pick];
  });
}

/** Take `count` random standard cards out of the bank (fewer if it runs out). */
function drawCards(state: GameState, count: number, random: () => number): ClassicResource[] {
  const cards: ClassicResource[] = [];
  for (let i = 0; i < count; i++) {
    const stocked = CLASSIC_RESOURCES.filter(r => state.bank[r] > 0);
    if (!stocked.length) break;
    const resource = stocked[Math.floor(random() * stocked.length)]!;
    state.bank[resource]--;
    cards.push(resource);
  }
  return cards;
}

/** Load the first of `trains` that anyone is on (the rest wait their turn); none leaves candyLoad null. */
function loadNext(state: GameState, trains: number[], random: () => number): void {
  state.candyLoad = null;
  for (const [i, train] of trains.entries()) {
    const picks = candyPicks(state, train);
    if (!picks.length) continue;
    const cards = drawCards(state, picks.length + CANDY_SPARE, random);
    if (!cards.length) {
      addLog(state, 'The candy train came, but the bank had nothing left to load.');
      continue;
    }
    state.candyLoad = { train, cards, picks: picks.slice(0, cards.length), waiting: trains.slice(i + 1) };
    addLog(state, `The candy train is loaded with ${cards.length} cards.`);
    return;
  }
}

/** After a roll pays out: load the trains showing `total` (Christmas Candy rooms only). */
export function loadTrains(state: GameState, total: number, random: () => number): void {
  state.candyLoad = null;
  if (!state.settings.christmasCandy) return;
  const rolled = (state.board.trains ?? []).flatMap((train, i) => (train.number === total ? [i] : []));
  if (rolled.length) loadNext(state, rolled, random);
}

/** Cards still on the train go back to the bank. */
function unload(state: GameState, load: CandyLoad): void {
  for (const card of load.cards) state.bank[card]++;
}

export const candyHandlers: Pick<Handlers, 'take-candy'> = {
  /** Off-turn too: whoever is next along the track takes one card off the train. */
  'take-candy'({ next, player, playerId, random }, action) {
    needPhase(next, 'candy');
    const load = next.candyLoad!;
    const pick = load.picks[0]!;
    requireRule(pick.playerId === playerId, 'Wait for your pick from the candy train.');
    const index = load.cards.indexOf(action.resource as ClassicResource);
    requireRule(index >= 0, 'Choose a card that is on the train.');
    const resource = load.cards[index]!;
    const rest = { ...load, cards: load.cards.filter((_, i) => i !== index), picks: load.picks.slice(1) };
    player.resources[resource]++;
    tally(next, playerId, 'cardsIn', 'candy', 1);
    tally(next, playerId, 'produced', resource, 1);
    addLog(next, `${player.name} took a card from the candy train.`, {
      kind: 'candy',
      playerId,
      vertexId: pick.vertexId,
      resource,
    });
    if (rest.picks.length) {
      next.candyLoad = rest;
      return;
    }
    unload(next, rest);
    loadNext(next, rest.waiting, random);
    if (!next.candyLoad) next.phase = afterCandy(next);
  },
};
