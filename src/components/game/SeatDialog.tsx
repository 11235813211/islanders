import { Bot, Eye } from 'lucide-react';
import { useState } from 'react';
import type { GameAction, GameView } from '../../../shared/types';
import { GameDialog } from '../TradePanel';

/** Whether the viewer (the host, mid-game) may hand this seat to a bot. */
export function canHandSeat(view: GameView, player: GameView['players'][number]): boolean {
  const playing = view.phase !== 'lobby' && view.phase !== 'finished';
  return playing && !view.testMode && view.hostId === view.selfId && !player.bot && player.id !== view.selfId;
}

/**
 * Host: give someone's seat to an Advanced bot, for a player who has to leave mid-game. They either
 * keep watching as a spectator or leave the room. Two steps, so it can't happen by a stray tap.
 */
export default function SeatDialog({
  view,
  playerId,
  busy,
  send,
  close,
}: {
  view: GameView;
  playerId: string;
  busy: boolean;
  send: (a: GameAction) => void;
  close: () => void;
}) {
  const [watch, setWatch] = useState<boolean | null>(null);
  const player = view.players.find(p => p.id === playerId);
  if (!player || !canHandSeat(view, player)) return null;
  const name = player.name;
  if (watch === null)
    return (
      <GameDialog title={name} close={close}>
        <p>An Advanced bot plays the seat for the rest of the game.</p>
        <div className="dialog-actions">
          <button className="button secondary" onClick={() => setWatch(true)}>
            <Eye size={18} />
            Move to spectators
          </button>
          <button className="button secondary" onClick={() => setWatch(false)}>
            <Bot size={18} />
            Replace with bot
          </button>
        </div>
      </GameDialog>
    );
  const confirm = () => {
    send({ type: 'seat-to-bot', playerId, watch });
    close();
  };
  return (
    <GameDialog title={watch ? `Move ${name} to spectators?` : `Replace ${name} with a bot?`} close={close}>
      <p>
        {watch
          ? `A bot takes their seat, cards and points. ${name} keeps watching and can't take the seat back.`
          : `A bot takes their seat, cards and points. ${name} leaves the room and can't take the seat back.`}
      </p>
      <div className="dialog-actions">
        <button className="button secondary" onClick={close}>
          Cancel
        </button>
        <button className="button primary" disabled={busy} onClick={confirm}>
          {watch ? <Eye size={18} /> : <Bot size={18} />}
          {watch ? 'Move to spectators' : 'Replace with bot'}
        </button>
      </div>
    </GameDialog>
  );
}
