import { ArrowRight, ChevronLeft, ChevronRight, Shuffle } from 'lucide-react';
import { useState } from 'react';
import type { GameAction, GameView } from '../../../shared/types';
import type { BoardPeek } from '../../hooks/useRoom';
import './board-pick.css';

/**
 * Pick-board phase, for players who aren't the host: which drawn board they are looking at, and the
 * view to draw the table with. Looking is local; it follows the host again whenever the host shows
 * or draws another board.
 */
export function useBoardLook(view: GameView, peek: BoardPeek | null, fetch: (board: number) => void) {
  const pick = view.boardPick;
  const key = pick ? `${pick.shown}/${pick.count}` : '';
  const [choice, setChoice] = useState<{ key: string; board: number | null }>({ key, board: null });
  const looking = pick && choice.key === key ? choice.board : null;
  const look = (board: number) => {
    if (!pick) return;
    const own = board === pick.shown ? null : board;
    setChoice({ key, board: own });
    if (own !== null) fetch(own);
  };
  const ready = looking !== null && peek?.board === looking;
  return {
    /** The board number on screen (1-based), or null outside the pick-board phase. */
    board: looking ?? pick?.shown ?? null,
    look,
    view: ready ? { ...view, ...peek.peek } : view,
  };
}

/**
 * Before setup: everyone can step through the drawn boards. The host's steps change the board on
 * the table; the host can also draw another and start.
 */
export default function BoardPick({
  view,
  busy,
  send,
  looking,
  look,
}: {
  view: GameView;
  busy: boolean;
  send: (a: GameAction) => void;
  /** Board this (non-host) player is looking at; see useBoardLook. */
  looking: number | null;
  look: (board: number) => void;
}) {
  const pick = view.boardPick;
  if (!pick) return null;
  const host = view.hostId === view.selfId;
  const shown = host ? pick.shown : (looking ?? pick.shown);
  const step = host ? (board: number) => send({ type: 'show-board', board }) : look;
  const stepper = <BoardStepper shown={shown} count={pick.count} disabled={host && busy} step={step} />;
  if (!host)
    return (
      <section className="board-pick" aria-label="Drawn boards">
        {stepper}
        <p className="board-pick-wait">
          {shown === pick.shown ? 'The host is choosing' : `The host is on board ${pick.shown}`}
        </p>
      </section>
    );
  return (
    <section className="board-pick" aria-label="Choose the board">
      {stepper}
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

/** Previous / "Board 2 of 5" / next. */
function BoardStepper({
  shown,
  count,
  disabled,
  step,
}: {
  shown: number;
  count: number;
  disabled: boolean;
  step: (board: number) => void;
}) {
  const label = `Board ${shown} of ${count}`;
  return (
    <div className="board-pick-row">
      <button
        type="button"
        className="button secondary board-pick-step"
        aria-label="Previous board"
        disabled={disabled || shown <= 1}
        onClick={() => step(shown - 1)}
      >
        <ChevronLeft size={18} />
      </button>
      <span className="board-pick-label" role="status" aria-label={label}>
        <span className="board-pick-word">Board </span>
        {shown} of {count}
      </span>
      <button
        type="button"
        className="button secondary board-pick-step"
        aria-label="Next board"
        disabled={disabled || shown >= count}
        onClick={() => step(shown + 1)}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
