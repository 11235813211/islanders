import { Check, Minus, Plus } from 'lucide-react';
import { boardPlayerCount, MAX_PLAYERS } from '../../../shared/engine';
import type { GameAction, GameView } from '../../../shared/types';
import './board-players.css';

const MIN_PLAYERS = 2;

/**
 * Host only: how many players maps are shown and proposed for, for everyone in the room. Lets a
 * table of four look at five-player maps while the fifth person is on the way.
 */
export default function BoardPlayers({
  view,
  busy,
  send,
}: {
  view: GameView;
  busy: boolean;
  send: (action: GameAction) => void;
}) {
  const auto = view.boardPlayers === null;
  const count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, boardPlayerCount(view)));
  const set = (players: number) => send({ type: 'set-board-players', players });
  return (
    <div className="board-players tone-sea">
      <span className="board-players-label">Players for maps</span>
      <button
        type="button"
        className="board-players-auto"
        aria-pressed={auto}
        disabled={busy || auto}
        onClick={() => send({ type: 'set-board-players' })}
      >
        {auto && <Check size={14} />}
        Auto
      </button>
      <span className="setting-stepper" role="group" aria-label="Players for maps">
        <button
          type="button"
          aria-label="Fewer players for maps"
          disabled={busy || count <= MIN_PLAYERS}
          onClick={() => set(count - 1)}
        >
          <Minus size={16} />
        </button>
        <output aria-live="polite">{count}</output>
        <button
          type="button"
          aria-label="More players for maps"
          disabled={busy || count >= MAX_PLAYERS}
          onClick={() => set(count + 1)}
        >
          <Plus size={16} />
        </button>
      </span>
    </div>
  );
}
