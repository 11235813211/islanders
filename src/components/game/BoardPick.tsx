import { ArrowRight, ChevronLeft, ChevronRight, Shuffle } from 'lucide-react';
import type { GameAction, GameView } from '../../../shared/types';
import './board-pick.css';

/**
 * Before setup: the host looks at the drawn board and can draw another or go back to an earlier
 * one, then starts. Everyone else sees which board is up.
 */
export default function BoardPick({
  view,
  busy,
  send,
}: {
  view: GameView;
  busy: boolean;
  send: (a: GameAction) => void;
}) {
  const pick = view.boardPick;
  if (!pick) return null;
  const host = view.hostId === view.selfId;
  const label = `Board ${pick.shown} of ${pick.count}`;
  const short = `${pick.shown} of ${pick.count}`;
  if (!host)
    return (
      <section className="board-pick" aria-label="Choosing the board">
        <p className="board-pick-wait">The host is choosing the board · {label}</p>
      </section>
    );
  const show = (board: number) => send({ type: 'show-board', board });
  return (
    <section className="board-pick" aria-label="Choose the board">
      <div className="board-pick-row">
        <button
          type="button"
          className="button secondary board-pick-step"
          aria-label="Previous board"
          disabled={busy || pick.shown <= 1}
          onClick={() => show(pick.shown - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span className="board-pick-label" role="status" aria-label={label}>
          <span className="board-pick-word">Board </span>
          {short}
        </span>
        <button
          type="button"
          className="button secondary board-pick-step"
          aria-label="Next board"
          disabled={busy || pick.shown >= pick.count}
          onClick={() => show(pick.shown + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="board-pick-row">
        <button
          type="button"
          className="button secondary"
          aria-label="New board"
          disabled={busy}
          onClick={() => send({ type: 'new-board' })}
        >
          <Shuffle size={17} />
          New<span className="board-pick-word"> board</span>
        </button>
        <button type="button" className="button primary" disabled={busy} onClick={() => send({ type: 'start' })}>
          Play
          <ArrowRight size={17} />
        </button>
      </div>
    </section>
  );
}
