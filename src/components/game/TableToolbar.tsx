import {
  Eye,
  FlaskConical,
  House,
  LogOut,
  MessageCircle,
  Pause,
  Play,
  Undo2,
  Users,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import { useState } from 'react';
import type { GameAction, GameView } from '../../../shared/types';
import type { Connection } from '../../hooks/useRoom';
import { setSoundEnabled, soundEnabled } from '../../lib/sound';

/** Why the undo button is or isn't available. */
function undoTitle(view: GameView): string {
  const undo = view.undoAvailable;
  if (!undo) return "Nothing to undo. Builds, trades and ending a turn can be undone; dice and card draws can't.";
  if (undo.actorId !== view.selfId) return 'Only the player who made the last move can ask to undo it.';
  return `Ask to undo: ${undo.description}`;
}

/** Top strip: room code, connection, solo-test seat switcher, and table tools. */
export default function TableToolbar({
  view,
  connection,
  busy,
  follow,
  setFollow,
  viewAs,
  send,
  toggleChat,
  invite,
  leave,
  home,
}: {
  view: GameView;
  connection: Connection;
  busy: boolean;
  follow: boolean;
  setFollow: (follow: boolean) => void;
  viewAs: (playerId: string) => void;
  send: (a: GameAction) => void;
  toggleChat: () => void;
  invite: () => void;
  leave: () => void;
  /** Go to the home screen without leaving the room. Shown when the site header is hidden. */
  home: () => void;
}) {
  const [sound, setSound] = useState(soundEnabled);
  const spectator = view.role === 'spectator';
  const paused = view.pausedAt !== null;
  const openProposal = !!view.proposal && !view.proposal.rejected.length;
  return (
    <div className="table-toolbar">
      <button className="icon-button phone-home" aria-label="Home" title="Home" onClick={home}>
        <House size={18} />
      </button>
      <strong className="table-code">{view.roomId}</strong>
      <span className={`table-connection ${connection}`} title={connection}>
        <Wifi size={15} />
        <span className="sr-only">{connection === 'online' ? 'Connected' : connection}</span>
      </span>
      {view.spectators.length > 0 && (
        <span className="spectator-count" title="Spectators">
          <Eye size={15} />
          {view.spectators.length}
        </span>
      )}
      {view.testMode && !spectator && (
        <div className="solo-compact">
          <FlaskConical size={16} />
          <select
            aria-label="Play as"
            disabled={busy}
            value={view.selfId}
            onChange={e => {
              setFollow(false);
              viewAs(e.target.value);
            }}
          >
            {view.players.map(p => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label title="Automatically control the active player">
            <input
              type="checkbox"
              checked={follow}
              onChange={e => setFollow(e.target.checked)}
              aria-label="Follow current turn"
            />
            <span>Follow</span>
          </label>
        </div>
      )}
      <div className="table-tools">
        <button className="icon-button" aria-label="Open chat" onClick={toggleChat}>
          <MessageCircle size={19} />
        </button>
        <button className="icon-button" aria-label="Invite friends or spectators" onClick={invite}>
          <Users size={19} />
        </button>
        <button
          className="icon-button"
          aria-label="Turn chime"
          aria-pressed={sound}
          title={sound ? 'Chime when it is your turn' : 'Chime is off'}
          onClick={() => {
            setSoundEnabled(!sound);
            setSound(!sound);
          }}
        >
          {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        {!spectator && (
          <>
            <button
              className="icon-button"
              aria-label="Propose undo"
              title={undoTitle(view)}
              disabled={busy || paused || openProposal || view.undoAvailable?.actorId !== view.selfId}
              onClick={() => send({ type: 'propose', kind: 'undo' })}
            >
              <Undo2 size={19} />
            </button>
            <button
              className="icon-button"
              aria-label={paused ? 'Propose resume' : 'Propose pause'}
              disabled={busy || openProposal || view.phase === 'finished'}
              onClick={() => send({ type: 'propose', kind: paused ? 'resume' : 'pause' })}
            >
              {paused ? <Play size={18} /> : <Pause size={18} />}
            </button>
          </>
        )}
        <button className="icon-button" aria-label="Leave game" title="Leave game" onClick={leave}>
          <LogOut size={18} />
        </button>
      </div>
    </div>
  );
}
