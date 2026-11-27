import { TUNING } from '../../../shared/default-settings';
import { canGiveTime, timedChoosers } from '../../../shared/rules';
import type { GameAction, GameView } from '../../../shared/types';
import './give-time.css';

/** Who the time goes to, for the button's label: one name, or how many are choosing. */
function recipients(view: GameView): string {
  const ids = timedChoosers(view, view.activePlayerId);
  if (ids.length > 1) return `the ${ids.length} players choosing`;
  return view.players.find(p => p.id === ids[0])?.name ?? 'them';
}

/**
 * Beside the turn clock: gives the person moving, or the people choosing cards, more time.
 * Anyone else may press it, as often as they like.
 */
export default function GiveTimeButton({
  view,
  busy,
  send,
}: {
  view: GameView;
  busy: boolean;
  send: (action: GameAction) => void;
}) {
  if (view.role !== 'player' || !canGiveTime(view, view.activePlayerId, view.selfId)) return null;
  const label = `Give ${recipients(view)} ${TUNING.giveTimeSeconds} seconds`;
  return (
    <button
      type="button"
      className="give-time"
      disabled={busy}
      aria-label={label}
      title={label}
      onClick={() => send({ type: 'give-time' })}
    >
      +{TUNING.giveTimeSeconds}s
    </button>
  );
}
