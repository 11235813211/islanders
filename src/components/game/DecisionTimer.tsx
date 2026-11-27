import { Timer } from 'lucide-react';
import type { CSSProperties } from 'react';
import { choiceMs, type ShortChoice, timeFactor } from '../../../shared/rules';
import type { GameView } from '../../../shared/types';
import './decision-timer.css';

interface Decision {
  deadline: number;
  label: string;
  kind: ShortChoice;
}

/** The short-choice clock the viewer is on, if any: the robber, a steal, discarding, gold, or candy. */
function decisionDeadline(view: GameView): Decision | null {
  if (view.role !== 'player' || view.pausedAt !== null) return null;
  const mine = view.activePlayerId === view.selfId && view.robberDeadline !== null;
  if (view.phase === 'robber' && mine)
    return { deadline: view.robberDeadline!, label: view.seafaring ? 'Robber or pirate' : 'Robber', kind: 'robber' };
  if (view.phase === 'steal' && mine) return { deadline: view.robberDeadline!, label: 'Steal', kind: 'steal' };
  if (view.phase === 'discard' && (view.pendingDiscards[view.selfId] ?? 0) > 0 && view.discardDeadline !== null)
    return { deadline: view.discardDeadline, label: 'Discard', kind: 'discard' };
  if (view.phase === 'gold' && (view.pendingGold[view.selfId] ?? 0) > 0 && view.goldDeadline !== null)
    return { deadline: view.goldDeadline, label: 'Gold', kind: 'gold' };
  if (view.phase === 'candy' && view.candyLoad?.picks[0]?.playerId === view.selfId && view.candyDeadline !== null)
    return { deadline: view.candyDeadline, label: 'Candy', kind: 'candy' };
  return null;
}

/**
 * A countdown in the board's top left while you make a short timed choice, so it's clear a bot
 * will choose for you when it runs out.
 */
export default function DecisionTimer({ view, now }: { view: GameView; now: number }) {
  const decision = decisionDeadline(view);
  if (!decision) return null;
  const total = choiceMs(view.settings, decision.kind) * timeFactor(view.players, [view.selfId]);
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
