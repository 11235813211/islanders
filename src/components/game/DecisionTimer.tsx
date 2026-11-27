import { Timer } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { GameView } from '../../../shared/types';
import './decision-timer.css';

/** The short-choice clock the viewer is on, if any: placing the robber, discarding, or picking gold. */
function decisionDeadline(view: GameView): { deadline: number; label: string } | null {
  if (view.role !== 'player' || view.pausedAt !== null) return null;
  if (view.phase === 'robber' && view.activePlayerId === view.selfId && view.robberDeadline !== null)
    return { deadline: view.robberDeadline, label: view.seafaring ? 'Robber or pirate' : 'Robber' };
  if (view.phase === 'discard' && (view.pendingDiscards[view.selfId] ?? 0) > 0 && view.discardDeadline !== null)
    return { deadline: view.discardDeadline, label: 'Discard' };
  if (view.phase === 'gold' && (view.pendingGold[view.selfId] ?? 0) > 0 && view.goldDeadline !== null)
    return { deadline: view.goldDeadline, label: 'Gold' };
  if (view.phase === 'candy' && view.candyLoad?.picks[0]?.playerId === view.selfId && view.candyDeadline !== null)
    return { deadline: view.candyDeadline, label: 'Candy' };
  return null;
}

/**
 * A countdown in the board's top left while you make a short timed choice, so it's clear a bot
 * will choose for you when it runs out.
 */
export default function DecisionTimer({ view, now }: { view: GameView; now: number }) {
  const decision = decisionDeadline(view);
  if (!decision) return null;
  const total = view.settings.decisionSeconds * 1000;
  const left = Math.max(0, decision.deadline - now);
  const seconds = Math.ceil(left / 1000);
  const share = Math.min(1, left / total);
  return (
    <div
      className={`decision-timer${seconds <= 5 ? ' urgent' : ''}`}
      role="timer"
      aria-label={`${decision.label}: ${seconds} seconds left`}
      style={{ '--progress': `${share * 360}deg` } as CSSProperties}
    >
      <span className="decision-ring">
        <Timer size={15} />
      </span>
      <strong>{seconds}s</strong>
    </div>
  );
}
