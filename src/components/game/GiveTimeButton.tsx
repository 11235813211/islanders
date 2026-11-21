import { TUNING } from '../../../shared/default-settings';
import { canGiveTime } from '../../../shared/rules';
import type { GameAction, GameView } from '../../../shared/types';
import './give-time.css';

/** Beside the turn clock: gives the person moving more time. Anyone may press it, as often as they like. */
export default function GiveTimeButton({
  view,
  busy,
  send,
}: {
  view: GameView;
  busy: boolean;
  send: (action: GameAction) => void;
}) {
  const active = view.players.find(p => p.id === view.activePlayerId);
  if (!active || view.role !== 'player' || !canGiveTime(view, view.activePlayerId, view.selfId)) return null;
  return (
    <button
      type="button"
      className="give-time"
      disabled={busy}
      aria-label={`Give ${active.name} ${TUNING.giveTimeSeconds} seconds`}
      title={`Give ${active.name} ${TUNING.giveTimeSeconds} seconds`}
      onClick={() => send({ type: 'give-time' })}
    >
      +{TUNING.giveTimeSeconds}s
    </button>
  );
}
