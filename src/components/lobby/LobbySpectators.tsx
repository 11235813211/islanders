import { Eye } from 'lucide-react';
import { MAX_PLAYERS } from '../../../shared/engine';
import type { GameAction, GameView } from '../../../shared/types';
import './lobby-spectators.css';

/** Everyone watching the room. The host can seat each one: in an open seat or in place of a player. */
export default function LobbySpectators({
  view,
  host,
  busy,
  send,
}: {
  view: GameView;
  host: boolean;
  busy: boolean;
  send: (action: GameAction) => void;
}) {
  if (!view.spectators.length || view.testMode) return null;
  const others = view.players.filter(p => p.id !== view.selfId);
  return (
    <section className="lobby-spectators" aria-label="Watching">
      <h3>
        <Eye size={16} />
        Watching
      </h3>
      {view.spectators.map(s => (
        <div className="lobby-spectator" key={s.id}>
          <span className="lobby-spectator-name">
            {s.name}
            {s.id === view.selfId && <small className="you-tag">you</small>}
          </span>
          {host && (
            <select
              aria-label={`Seat ${s.name}`}
              value=""
              disabled={busy}
              onChange={e =>
                send({
                  type: 'seat-spectator',
                  spectatorId: s.id,
                  ...(e.target.value === 'open' ? {} : { playerId: e.target.value }),
                })
              }
            >
              <option value="" disabled>
                Seat…
              </option>
              {view.players.length < MAX_PLAYERS && <option value="open">Open seat</option>}
              {others.map(p => (
                <option key={p.id} value={p.id}>
                  In place of {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
    </section>
  );
}
