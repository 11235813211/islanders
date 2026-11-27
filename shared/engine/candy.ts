// Christmas Candy trains (room setting `christmasCandy`, tracks in `board.trains`). When a train's
// number is rolled it is loaded from the bank with one random standard card per pick, plus
// CANDY_SPARE more. Each settlement on its track picks one card (a city two), from the start
// station to the end, so the first picks have the most choice. Leftovers go back to the bank.
import { trainCorners } from '../maps/candy-board';
import {
  type CandyLoad,
  CLASSIC_RESOURCES,
  type ClassicResource,
  type GameState,
  RESOURCES,
  type ResourceBag,
} from '../types';
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

/** How many picks in a row are `playerId`'s from the front of the train's line (zero if it isn't their turn). */
export function candyRun(load: Pick<CandyLoad, 'picks'> | null, playerId: string): number {
  const picks = load?.picks ?? [];
  const end = picks.findIndex(pick => pick.playerId !== playerId);
  return end < 0 ? picks.length : end;
}

/** The cards a take-candy action asks for, in pick order: `resource`, then `more`. */
function cardsAsked(action: { resource: ClassicResource; more?: ResourceBag }): ClassicResource[] {
  const more = action.more;
  if (more)
    requireRule(
      RESOURCES.every(r => (CLASSIC_RESOURCES as readonly string[]).includes(r) || !more[r]),
      'Only standard cards ride the candy train.',
    );
  return [action.resource, ...CLASSIC_RESOURCES.flatMap(r => Array<ClassicResource>(more?.[r] ?? 0).fill(r))];
}

export const candyHandlers: Pick<Handlers, 'take-candy'> = {
  /** Off-turn too: whoever is next along the track takes a card off the train (or one per pick in their run). */
  'take-candy'({ next, player, playerId, random }, action) {
    needPhase(next, 'candy');
    const load = next.candyLoad!;
    const run = candyRun(load, playerId);
    requireRule(run > 0, 'Wait for your pick from the candy train.');
    const asked = cardsAsked(action);
    requireRule(asked.length <= run, run === 1 ? 'You have one pick now.' : `You have ${run} picks in a row now.`);
    const cards = [...load.cards];
    for (const [i, resource] of asked.entries()) {
      const index = cards.indexOf(resource);
      requireRule(index >= 0, 'Choose cards that are on the train.');
      cards.splice(index, 1);
      player.resources[resource]++;
      tally(next, playerId, 'cardsIn', 'candy', 1);
      tally(next, playerId, 'produced', resource, 1);
      addLog(next, `${player.name} took a card from the candy train.`, {
        kind: 'candy',
        playerId,
        vertexId: load.picks[i]!.vertexId,
        resource,
      });
    }
    const rest = { ...load, cards, picks: load.picks.slice(asked.length) };
    if (rest.picks.length) {
      next.candyLoad = rest;
      return;
    }
    unload(next, rest);
    loadNext(next, rest.waiting, random);
    if (!next.candyLoad) next.phase = afterCandy(next);
  },
};
