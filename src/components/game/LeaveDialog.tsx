import { Bookmark, LogOut } from 'lucide-react';
import { isBotGame, SAVED_BOT_GAME_HOURS } from '../../../shared/settings';
import type { GameView } from '../../../shared/types';
import { GameDialog } from '../TradePanel';

/** Where a saved game can be picked up again: the account's room list, or the room code for a guest. */
function resumeHint(view: GameView, signedIn: boolean): string {
  const where = signedIn ? 'from My rooms' : `with code ${view.roomId}`;
  return `Save it and come back ${where} within ${SAVED_BOT_GAME_HOURS} hours, or end it now.`;
}

/**
 * Leaving the table. Against bots nobody is waiting on you, so the choice is to save the
 * game for later or end it; with other people, a bot takes over your seat.
 */
export default function LeaveDialog({
  view,
  busy,
  signedIn,
  close,
  saveForLater,
  leave,
}: {
  view: GameView;
  busy: boolean;
  signedIn: boolean;
  close: () => void;
  /** Go home and keep the room. */
  saveForLater: () => void;
  /** Give up the seat for good. */
  leave: () => void;
}) {
  const spectator = view.role === 'spectator';
  if (!spectator && isBotGame(view))
    return (
      <GameDialog title="Leave this game?" close={close}>
        <p>{resumeHint(view, signedIn)}</p>
        <div className="dialog-actions">
          <button className="button secondary" disabled={busy} onClick={leave}>
            <LogOut size={18} />
            End game
          </button>
          <button className="button primary" onClick={saveForLater}>
            <Bookmark size={18} />
            Save for later
          </button>
        </div>
      </GameDialog>
    );
  return (
    <GameDialog title="Leave this game?" close={close}>
      <p>
        {spectator
          ? 'You will stop watching this room.'
          : view.phase === 'finished'
            ? 'You will leave the room. The others can start a new game without you.'
            : 'A bot will take over your seat so the game can continue. You can’t rejoin this seat.'}
      </p>
      <div className="dialog-actions">
        <button className="button secondary" onClick={close}>
          Stay
        </button>
        <button className="button primary" disabled={busy} onClick={leave}>
          <LogOut size={18} />
          Leave game
        </button>
      </div>
    </GameDialog>
  );
}
