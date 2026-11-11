import { type GameState, type HandGuess, RESOURCES, type ResourceBag } from '../types';
import { emptyBag, resourceCount } from './core';

/**
 * A public count of each player's cards: what anyone at the table could work out by watching.
 * Every change to a hand is public (production, building, trades, discards, gold, monopoly) except
 * which card a steal took, so those count exactly; a steal moves one card spread over what the
 * victim probably held.
 *
 * `seen` holds the real hands as of the last update (hidden; never sent), so this can catch up
 * after any change without knowing where it came from. Bots see `likely` (getView).
 */

/** A fresh count for a game that is just starting, or that has unknown history (migrations). */
export function startHandGuess(state: Pick<GameState, 'players' | 'log'>): HandGuess {
  const guess: HandGuess = { seen: {}, likely: {}, logId: state.log.at(-1)?.id ?? 0 };
  for (const p of state.players) {
    guess.seen[p.id] = { ...p.resources };
    guess.likely[p.id] = spread(resourceCount(p.resources));
  }
  return guess;
}

const spread = (cards: number): ResourceBag => {
  const bag = emptyBag();
  for (const r of RESOURCES) bag[r] = cards / RESOURCES.length;
  return bag;
};

/** Bring the count up to date with the players' hands. Changes `state.handGuess` in place. */
export function trackHands(state: GameState): void {
  const old = state.handGuess;
  const next: HandGuess = { seen: {}, likely: {}, logId: state.log.at(-1)?.id ?? old.logId };
  const delta: Record<string, ResourceBag> = {};
  for (const p of state.players) {
    const seen = old.seen[p.id] ?? emptyBag();
    delta[p.id] = Object.fromEntries(RESOURCES.map(r => [r, p.resources[r] - seen[r]])) as ResourceBag;
    next.likely[p.id] = { ...(old.likely[p.id] ?? emptyBag()) };
    next.seen[p.id] = { ...p.resources };
  }
  const steals = state.log.filter(e => e.id > old.logId && e.event?.kind === 'steal').map(e => e.event!);
  // Take each stolen card out of the exact changes; it moves below as a spread instead.
  for (const steal of steals) {
    if (steal.kind !== 'steal' || !steal.resource || steal.resource === 'discovery') continue;
    if (delta[steal.victimId]) delta[steal.victimId]![steal.resource] += 1;
    if (delta[steal.thiefId]) delta[steal.thiefId]![steal.resource] -= 1;
  }
  for (const p of state.players) for (const r of RESOURCES) next.likely[p.id]![r] += delta[p.id]![r];
  for (const steal of steals) {
    if (steal.kind !== 'steal' || !steal.resource || steal.resource === 'discovery') continue;
    const victim = next.likely[steal.victimId];
    const thief = next.likely[steal.thiefId];
    if (!victim || !thief) continue;
    const share = shares(victim);
    for (const r of RESOURCES) {
      victim[r] -= share[r];
      thief[r] += share[r];
    }
  }
  for (const p of state.players) next.likely[p.id] = fitCount(next.likely[p.id]!, resourceCount(p.resources));
  state.handGuess = next;
}

/** Each resource's share of one card drawn from this (likely) hand. */
function shares(hand: ResourceBag): ResourceBag {
  const total = RESOURCES.reduce((n, r) => n + Math.max(0, hand[r]), 0);
  if (total <= 0) return spread(1);
  return Object.fromEntries(RESOURCES.map(r => [r, Math.max(0, hand[r]) / total])) as ResourceBag;
}

/** No negative counts, and the total matches the real card count (public). */
function fitCount(hand: ResourceBag, cards: number): ResourceBag {
  const clamped = Object.fromEntries(RESOURCES.map(r => [r, Math.max(0, hand[r])])) as ResourceBag;
  const total = resourceCount(clamped);
  if (Math.abs(total - cards) < 1e-9) return clamped;
  if (total <= 0) return spread(cards);
  return Object.fromEntries(RESOURCES.map(r => [r, (clamped[r] * cards) / total])) as ResourceBag;
}
