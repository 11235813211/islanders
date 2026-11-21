import { activeStrength, barbarianStrength, KNIGHTS_LIMITS, TRACK_INFO } from '../../../shared/knights';
import type { GameView } from '../../../shared/types';
import { KNIGHTS } from '../../art';

/**
 * Over the board's top right: how close the barbarian ship is, the island's knights against the
 * barbarians' strength, and the event die's last face.
 */
export default function BarbarianTrack({ view }: { view: GameView }) {
  const ck = view.ck;
  if (!ck || view.phase === 'pick-board') return null;
  const strength = barbarianStrength(view.buildings);
  const defense = view.players.reduce((n, p) => n + activeStrength(ck, p.id), 0);
  const steps = KNIGHTS_LIMITS.barbarianDistance;
  const event = ck.event;
  const eventName = event === 'ship' ? 'barbarian ship' : event ? `${TRACK_INFO[event].name.toLowerCase()} gate` : null;
  return (
    <div
      className={`ck-barbarians${defense < strength ? ' losing' : ''}`}
      role="group"
      aria-label={`Barbarians ${ck.barbarian} of ${steps} steps. Knights ${defense} against ${strength}.${eventName ? ` Last event: ${eventName}.` : ''}`}
    >
      <span className="ck-sea" aria-hidden="true">
        {Array.from({ length: steps }, (_, i) => (
          <span key={i} className={i < ck.barbarian ? 'sailed' : undefined} />
        ))}
        <span className="ck-ship" style={{ left: `${(ck.barbarian / steps) * 100}%` }}>
          <KNIGHTS.BarbarianShip size={20} />
        </span>
      </span>
      <span className="ck-strength" data-tip="Active knights on the island against one strength for each city">
        <strong>{defense}</strong> vs <strong>{strength}</strong>
      </span>
      {event && (
        <span className="ck-event" data-tip={`Event die: ${eventName}`}>
          <KNIGHTS.EventFace face={event} size={20} />
        </span>
      )}
    </div>
  );
}
