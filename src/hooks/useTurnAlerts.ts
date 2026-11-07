import { useEffect, useRef } from 'react';
import type { GameView } from '../../shared/types';
import { playTurnChime, unlockAudio } from '../lib/sound';

const BASE_TITLE = 'Islanders · Join the game';

/** What, if anything, needs this player now. */
function needsMe(view: GameView): string | null {
  if (view.role !== 'player' || view.pausedAt !== null) return null;
  if ((view.pendingDiscards[view.selfId] ?? 0) > 0) return 'discard';
  const offer = view.tradeOffer;
  if (offer?.to.includes(view.selfId) && !offer.declinedBy.includes(view.selfId)) return `offer:${offer.id}`;
  if (view.activePlayerId === view.selfId && !['lobby', 'finished'].includes(view.phase))
    return `turn:${view.turn}:${view.phase.startsWith('setup') ? Object.keys(view.buildings).length : ''}`;
  return null;
}

/**
 * A soft chime and a tab-title change when it becomes your turn, you must
 * discard, or someone offers you a trade. Silent in solo test rooms, where
 * the "you" seat changes constantly.
 */
export function useTurnAlerts(view: GameView): void {
  const last = useRef<string | null>(null);
  useEffect(() => {
    const unlock = () => unlockAudio();
    document.addEventListener('pointerdown', unlock, { once: true });
    return () => document.removeEventListener('pointerdown', unlock);
  }, []);
  const need = view.testMode ? null : needsMe(view);
  useEffect(() => {
    // Setup placements each get their own key, but only the first of a pair should chime.
    const key = need?.startsWith('turn:') && view.phase === 'setup-road' ? last.current : need;
    if (key && key !== last.current) playTurnChime();
    last.current = key;
  }, [need, view.phase]);
  useEffect(() => {
    const update = () => {
      document.title = need && document.hidden ? 'Your turn · Islanders' : BASE_TITLE;
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      document.title = BASE_TITLE;
    };
  }, [need]);
}
