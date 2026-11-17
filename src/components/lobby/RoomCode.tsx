import { Check, Copy, Pencil, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CUSTOM_ROOM_CODE } from '../../../shared/settings';
import type { GameView } from '../../../shared/types';
import './room-code.css';

/** The code people type to join: the host's own code once set, else the room's first code. */
export const roomCodeOf = (view: Pick<GameView, 'roomId' | 'inviteCode'>) => view.inviteCode ?? view.roomId;

/**
 * The lobby's room code with a copy button. An admin host (`setCode`) may give the room its own
 * code once; it can't be changed after.
 */
export default function RoomCode({
  view,
  busy,
  copy,
  copied,
  setCode,
}: {
  view: GameView;
  busy: boolean;
  copy: () => void;
  copied: boolean;
  setCode?: (code: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const code = roomCodeOf(view);
  const valid = draft !== null && CUSTOM_ROOM_CODE.test(draft) && draft !== view.roomId;
  // The server's answer arrives as a new view (or an error); either way the editor closes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: close once the code changes.
  useEffect(() => setDraft(null), [view.inviteCode]);
  const save = () => {
    if (!valid || !setCode) return;
    if (window.confirm(`Set the room code to ${draft}? It can't be changed again.`)) setCode(draft);
  };
  if (draft !== null)
    return (
      <form
        className="room-code-box room-code-edit"
        onSubmit={event => {
          event.preventDefault();
          save();
        }}
      >
        <input
          aria-label="New room code"
          value={draft}
          maxLength={12}
          autoCapitalize="characters"
          spellCheck={false}
          // biome-ignore lint/a11y/noAutofocus: the field opens on purpose from the edit button.
          autoFocus
          onChange={event => setDraft(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        />
        <button type="submit" className="button primary" disabled={busy || !valid}>
          Set
        </button>
        <button type="button" className="icon-button" aria-label="Cancel" onClick={() => setDraft(null)}>
          <X />
        </button>
        <small>4–12 letters and digits, starting with a letter. Can only be set once.</small>
      </form>
    );
  return (
    <div className="room-code-box">
      <span>Room code</span>
      <strong>{code}</strong>
      <span className="room-code-actions">
        {setCode && !view.inviteCode && (
          <button
            type="button"
            className="icon-button"
            aria-label="Set your own room code"
            data-tip="Set your own code"
            disabled={busy}
            onClick={() => setDraft('')}
          >
            <Pencil />
          </button>
        )}
        <button type="button" className="icon-button" onClick={copy} aria-label="Copy room code">
          {copied ? <Check /> : <Copy />}
        </button>
      </span>
    </div>
  );
}
