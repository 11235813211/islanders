import { Bot, Check, Eye, Hourglass, UserRound } from 'lucide-react';
import { useState } from 'react';
import type { GameAction, GameView } from '../../../shared/types';
import { GameDialog } from '../TradePanel';

/**
 * Whether the viewer (the host, mid-game) may change who plays this seat: a person's seat can go
 * to a bot or someone watching; a bot's seat to someone watching.
 */
export function canHandSeat(view: GameView, player: GameView['players'][number]): boolean {
  const playing = view.phase !== 'lobby' && view.phase !== 'finished';
  const host = playing && !view.testMode && view.hostId === view.selfId && player.id !== view.selfId;
  return host && (!player.bot || view.spectators.length > 0);
}

/** What the host picked for the seat: watch, leave, or a spectator's id to take over. */
type Choice = { kind: 'watch' } | { kind: 'leave' } | { kind: 'spectator'; id: string; name: string };

/** The confirm step's title, text, and button for a choice. */
function confirmText(choice: Choice, name: string, bot: boolean) {
  if (choice.kind === 'spectator')
    return {
      title: `Seat ${choice.name} in place of ${name}?`,
      text: `${choice.name} takes over the seat, cards and points.${bot ? '' : ` ${name} keeps watching.`}`,
      button: `Seat ${choice.name}`,
    };
  const watch = choice.kind === 'watch';
  return {
    title: watch ? `Move ${name} to spectators?` : `Replace ${name} with a bot?`,
    text: watch
      ? `A bot takes their seat, cards and points. ${name} keeps watching and can take the seat back.`
      : `A bot takes their seat, cards and points. ${name} leaves the room. If signed in, they get the seat back by rejoining.`,
    button: watch ? 'Move to spectators' : 'Replace with bot',
  };
}

/**
 * Host: give a person double time on their clocks, or change who plays a seat mid-game, for a player who has to leave or someone watching who
 * wants in. A person's seat goes to an Advanced bot (they watch or leave) or to someone watching; a
 * bot's seat to someone watching. Two steps, so it can't happen by a stray tap.
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
  const [choice, setChoice] = useState<Choice | null>(null);
  const player = view.players.find(p => p.id === playerId);
  if (!player || !canHandSeat(view, player)) return null;
  const name = player.name;
  if (!choice)
    return (
      <GameDialog title={name} close={close}>
        <p>{player.bot ? 'Someone watching can take over this bot’s seat.' : 'Choose who plays this seat now.'}</p>
        {!player.bot && (
          <div className="dialog-actions">
            <button
              type="button"
              className={`button ${player.doubleTime ? 'primary' : 'secondary'}`}
              aria-pressed={player.doubleTime}
              disabled={busy}
              onClick={() => send({ type: 'set-double-time', playerId, on: !player.doubleTime })}
            >
              {player.doubleTime ? <Check size={18} /> : <Hourglass size={18} />}
              Double time
            </button>
          </div>
        )}
        <div className="dialog-actions">
          {!player.bot && (
            <>
              <button className="button secondary" onClick={() => setChoice({ kind: 'watch' })}>
                <Eye size={18} />
                Move to spectators
              </button>
              <button className="button secondary" onClick={() => setChoice({ kind: 'leave' })}>
                <Bot size={18} />
                Replace with bot
              </button>
            </>
          )}
          {view.spectators.map(s => (
            <button
              key={s.id}
              className="button secondary"
              onClick={() => setChoice({ kind: 'spectator', id: s.id, name: s.name })}
            >
              <UserRound size={18} />
              Seat {s.name}
            </button>
          ))}
        </div>
      </GameDialog>
    );
  const text = confirmText(choice, name, !!player.bot);
  const confirm = () => {
    send(
      choice.kind === 'spectator'
        ? { type: 'seat-spectator', spectatorId: choice.id, playerId }
        : { type: 'seat-to-bot', playerId, watch: choice.kind === 'watch' },
    );
    close();
  };
  return (
    <GameDialog title={text.title} close={close}>
      <p>{text.text}</p>
      <div className="dialog-actions">
        <button className="button secondary" onClick={close}>
          Cancel
        </button>
        <button className="button primary" disabled={busy} onClick={confirm}>
          {choice.kind === 'spectator' ? (
            <UserRound size={18} />
          ) : choice.kind === 'watch' ? (
            <Eye size={18} />
          ) : (
            <Bot size={18} />
          )}
          {text.button}
        </button>
      </div>
    </GameDialog>
  );
}
