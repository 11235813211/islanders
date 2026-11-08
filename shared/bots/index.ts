import { type BotLevel, DEFAULT_BOT_LEVEL, type GameAction, type GameView } from '../types';
import { goldChoice, specialBuild } from './analysis';
import { beginner } from './beginner';
import { advanced, intermediate } from './strategic';
import type { BotOptions, Brain } from './types';

export type { BotOptions } from './types';

/** Bot levels, weakest first. Descriptions are shown in the lobby. */
export const BOTS: Record<BotLevel, { brain: Brain; label: string; description: string }> = {
  beginner: { brain: beginner, label: 'Beginner', description: 'Builds what it can afford and keeps trades simple.' },
  intermediate: {
    brain: intermediate,
    label: 'Intermediate',
    description: 'Plans toward goals, uses the robber and cards on purpose, offers fair trades.',
  },
  advanced: {
    brain: advanced,
    label: 'Advanced',
    description: 'Plans ahead, estimates your cards, and refuses trades that help the leader.',
  },
};

/**
 * Choose one action for a seat from its own view (never hidden information).
 * Handles every situation a seat can be asked to act in: its turn, a discard,
 * an offer sent to it, or reviewing answers to its own offer.
 */
export function chooseBotAction(view: GameView, options: BotOptions = {}): GameAction {
  const brain = BOTS[options.level ?? DEFAULT_BOT_LEVEL].brain;
  const offer = view.tradeOffer;
  if (view.phase === 'discard') return brain.discard(view);
  if (view.phase === 'gold') return goldChoice(view);
  if (view.phase === 'special-build') return specialBuild(view);
  if (offer && view.phase === 'build') {
    if (offer.fromId === view.selfId) return brain.review(view, offer);
    const answered = offer.declinedBy.includes(view.selfId) || offer.counters.some(c => c.fromId === view.selfId);
    if (offer.to.includes(view.selfId) && !answered && view.activePlayerId !== view.selfId)
      return brain.respond(view, offer);
  }
  return brain.turn(view, options);
}
