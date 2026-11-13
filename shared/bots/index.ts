import { hasAnswered } from '../rules';
import { type BotLevel, DEFAULT_BOT_LEVEL, type GameAction, type GameView, RESOURCES } from '../types';
import { advanced } from './advanced';
import { goldChoice, specialBuild } from './analysis';
import { beginner } from './beginner';
import { cartographersTurn, chartChoice, keepsLodestone } from './cartographers';
import { intermediate } from './strategic';
import type { BotOptions, Brain, TurnOptions } from './types';

export type { BotOptions, Brain } from './types';

/** Bot levels, weakest first. */
export const BOTS: Record<BotLevel, { brain: Brain; label: string }> = {
  beginner: { brain: beginner, label: 'Beginner' },
  intermediate: { brain: intermediate, label: 'Intermediate' },
  advanced: { brain: advanced, label: 'Advanced' },
};

/**
 * Choose one action for a seat from its own view (never hidden information).
 * Handles every situation a seat can be asked to act in: its turn, a discard,
 * an offer sent to it, or reviewing answers to its own offer.
 */
export function chooseBotAction(view: GameView, options: BotOptions = {}): GameAction {
  return actWith(BOTS[options.level ?? DEFAULT_BOT_LEVEL].brain, view, options);
}

/** The same, for any brain (training plays candidate brains this way). */
export function actWith(brain: Brain, view: GameView, options: TurnOptions = {}): GameAction {
  const offer = view.tradeOffer;
  if (view.phase === 'discard') {
    // Where discoveries count toward the limit, a bot gives them up only once its cards run out.
    const owed = view.pendingDiscards[view.selfId] ?? 0;
    const cards = RESOURCES.reduce((n, r) => n + view.hand[r], 0);
    if (owed > cards) return { type: 'discard', resources: { ...view.hand, discovery: owed - cards } };
    return brain.discard(view);
  }
  if (view.phase === 'gold') return (brain.gold ?? goldChoice)(view);
  if (view.phase === 'special-build') return (brain.specialBuild ?? specialBuild)(view);
  if (view.phase === 'eruption') return { type: 'roll-volcanoes' };
  if (view.phase === 'charting') return chartChoice(view);
  if (offer && view.phase === 'build') {
    if (offer.fromId === view.selfId) return brain.review(view, offer);
    const answered = hasAnswered(offer, view.selfId);
    // The player whose turn it is can be sent an offer too, by someone trading off turn.
    if (offer.to.includes(view.selfId) && !answered)
      // Bots don't value discoveries, so they pass on offers that include them.
      return offer.give.discovery || offer.want.discovery || keepsLodestone(view, offer)
        ? { type: 'decline-trade', offerId: offer.id }
        : brain.respond(view, offer);
  }
  return cartographersTurn(view, brain.turn(view, options));
}
