import { hasAnswered } from '../rules';
import { type BotLevel, DEFAULT_BOT_LEVEL, type GameAction, type GameView, RESOURCES } from '../types';
import { advanced } from './advanced';
import { goldChoice, keepRoutePiece, specialBuild } from './analysis';
import { beginner } from './beginner';
import { cartographersTurn, keepsLodestone } from './cartographers';
import { splitGoldChoice } from './charting';
import { intermediate } from './strategic';
import type { BotOptions, BotThought, Brain, TurnOptions } from './types';

export type { BotOptions, BotThought, Brain } from './types';

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

/** One more piece of work on a slow decision, or null when `chooseBotAction` can simply answer. */
export function botThink(view: GameView, level: BotLevel, done?: BotThought): BotThought | null {
  return BOTS[level].brain.think?.(keepRoutePiece(view), done) ?? null;
}

/** The same, for any brain (training plays candidate brains this way). */
export function actWith(brain: Brain, given: GameView, options: TurnOptions = {}): GameAction {
  const view = keepRoutePiece(given);
  if (view.phase === 'discard') {
    // Where discoveries count toward the limit, a bot gives them up only once its cards run out.
    const owed = view.pendingDiscards[view.selfId] ?? 0;
    const cards = RESOURCES.reduce((n, r) => n + view.hand[r], 0);
    if (owed > cards) return { type: 'discard', resources: { ...view.hand, discovery: owed - cards } };
    return brain.discard(view);
  }
  if (view.phase === 'gold') {
    const gold = brain.gold ?? goldChoice;
    return view.pendingSplit[view.selfId]?.length ? splitGoldChoice(view, gold) : gold(view);
  }
  if (view.phase === 'special-build') return (brain.specialBuild ?? specialBuild)(view);
  if (view.phase === 'eruption') return { type: 'roll-volcanoes' };
  if (view.phase === 'build') {
    // The player whose turn it is can be sent an offer too, by someone trading off turn.
    const incoming = view.tradeOffers.find(o => o.to.includes(view.selfId) && !hasAnswered(o, view.selfId));
    if (incoming)
      // Bots don't value discoveries, so they pass on offers that include them.
      return incoming.give.discovery ||
        incoming.want.discovery ||
        keepsLodestone(view, incoming, reserveOf(brain, view))
        ? { type: 'decline-trade', offerId: incoming.id }
        : brain.respond(view, incoming);
    const own = view.tradeOffers.find(o => o.fromId === view.selfId);
    if (own) return brain.review(view, own);
  }
  return cartographersTurn(view, brain.turn(view, options), reserveOf(brain, view), brain.tiles);
}

/** Lodestone the brain's own plans are saving (Cartographers only). */
function reserveOf(brain: Brain, view: GameView): number {
  return view.cartographers && brain.lodestoneReserve ? brain.lodestoneReserve(view) : 0;
}
