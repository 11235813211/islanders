import { Check, Copy, Eye, UserPlus } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { MAX_PLAYERS } from '../../shared/engine';
import type { GameView } from '../../shared/types';
import { Modal } from './AccountDialogs';

export type InviteKind = 'player' | 'spectator';

/** Whether a player link can still seat someone, and if not, why. */
function seatNote(view: GameView): string | null {
  if (view.testMode) return 'Solo test rooms have no open seats.';
  if (view.phase !== 'lobby') return 'The game has started, so new arrivals watch.';
  if (view.players.length >= MAX_PLAYERS) return 'All seats are taken, so new arrivals watch.';
  return null;
}

/** Copy text, falling back to selecting it when the clipboard is blocked. */
async function copyText(text: string, field: HTMLInputElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    field?.select();
    return false;
  }
}

function InviteRow({
  kind,
  icon,
  title,
  note,
  url,
}: {
  kind: InviteKind;
  icon: ReactNode;
  title: string;
  note: string;
  url: string;
}) {
  const [copied, setCopied] = useState(false);
  const [field, setField] = useState<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <section className={`invite-row invite-${kind}`} aria-label={title}>
      <span className="invite-icon">{icon}</span>
      <div className="invite-text">
        <strong>{title}</strong>
        <small>{note}</small>
        <input ref={setField} readOnly value={url} aria-label={`${title} URL`} onFocus={e => e.target.select()} />
      </div>
      <button
        className="button secondary invite-copy"
        aria-label={`Copy ${title.toLowerCase()}`}
        onClick={() => void copyText(url, field).then(setCopied)}
      >
        {copied ? <Check size={18} /> : <Copy size={18} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </section>
  );
}

/** Share the room: a link that takes a seat and a link that only watches, each with its own copy button. */
export default function InviteDialog({
  view,
  url,
  close,
}: {
  view: GameView;
  url: (kind: InviteKind) => string;
  close: () => void;
}) {
  const full = seatNote(view);
  return (
    <Modal title={`Invite to ${view.roomId}`} close={close}>
      <div className="invite-rows">
        {!full && (
          <InviteRow
            kind="player"
            icon={<UserPlus size={22} />}
            title="Player link"
            note="Takes an open seat at the table."
            url={url('player')}
          />
        )}
        <InviteRow
          kind="spectator"
          icon={<Eye size={22} />}
          title="Spectator link"
          note="Watches the game. Hands stay private."
          url={url('spectator')}
        />
      </div>
      {full && <p className="form-note">{full}</p>}
      {location.protocol !== 'https:' && (
        <p className="form-note">This address works on the same Wi-Fi. Use the HTTPS link for other networks.</p>
      )}
    </Modal>
  );
}
