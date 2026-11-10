import {
  ArrowRight,
  Check,
  Eye,
  FlaskConical,
  Hexagon,
  LoaderCircle,
  Plus,
  Sailboat,
  Shield,
  Swords,
} from 'lucide-react';
import { useEffect } from 'react';
import type { AccountRoomStatus } from '../../shared/types';
import type { useAccount } from '../hooks/useAccount';
import { parseJoinInput } from '../hooks/useRoom';

function roomStatusLabel(room: AccountRoomStatus): string {
  if (room.phase === 'lobby') return 'In the lobby';
  if (room.phase === 'finished') return room.winner ? `Finished · ${room.winner} won` : 'Finished';
  return room.yourTurn ? 'Your turn' : 'In progress';
}

/** Landing page: create or join a room, the solo playtest (developers only), and "My rooms". */
export default function HomeScreen({
  account,
  canPlaytest,
  loading,
  name,
  setName,
  code,
  setCode,
  spectate,
  setSpectate,
  enter,
  openEditor,
}: {
  account: ReturnType<typeof useAccount>;
  canPlaytest: boolean;
  loading: boolean;
  name: string;
  setName: (name: string) => void;
  code: string;
  setCode: (code: string) => void;
  spectate: boolean;
  setSpectate: (spectate: boolean) => void;
  enter: (kind: 'create' | 'join' | 'test', roomId?: string) => void;
  /** Open the board editor (shown with the solo playtest, to the same accounts). */
  openEditor: () => void;
}) {
  /** A pasted whole invite link joins straight away; a spectator link only fills the box (it shows "Watch"). */
  const pasteInvite = (text: string): boolean => {
    const input = parseJoinInput(text);
    if (input.spectate === null || !input.code) return false;
    setCode(input.code);
    setSpectate(input.spectate);
    if (!input.spectate && !loading) enter('join', input.code);
    return true;
  };
  // ⌘V / Ctrl+V anywhere on the home screen (not while typing in another field).
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-bound when what a join needs changes.
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if (pasteInvite(event.clipboardData?.getData('text') ?? '')) event.preventDefault();
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  }, [loading, name]);
  return (
    <main className={`home-layout${canPlaytest ? '' : ' single'}`}>
      <section className="home-heading">
        <span className="section-kicker">
          <Swords size={18} /> MULTIPLAYER STRATEGY
        </span>
        <h1>Play Islanders</h1>
        <p>Create a room, or join one with a code.</p>
      </section>
      <section className="panel home-play-panel">
        <div className="section-heading">
          <h2>
            <Sailboat />
            Set up a game
          </h2>
          <span className="subtle-badge">2–6 players</span>
        </div>
        {!account.account ? (
          <label className="field-label">
            Player name
            <input
              placeholder="Optional"
              autoComplete="nickname"
              maxLength={24}
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </label>
        ) : (
          <p>
            Playing as <strong>{account.account.username}</strong>
          </p>
        )}
        <button className="button primary create-button" disabled={loading} onClick={() => enter('create')}>
          {loading ? <LoaderCircle className="spin" /> : <Plus />}Create room
          <ArrowRight className="push-right" />
        </button>
        <div className="divider-label">or join a room</div>
        <form
          className="join-form"
          onSubmit={e => {
            e.preventDefault();
            enter('join');
          }}
        >
          <input
            aria-label="Room code or invite link"
            value={code}
            autoCapitalize="characters"
            autoComplete="off"
            onPaste={e => {
              if (pasteInvite(e.clipboardData.getData('text'))) e.preventDefault();
            }}
            onChange={e => {
              const input = parseJoinInput(e.target.value);
              setCode(input.code);
              if (input.spectate !== null) setSpectate(input.spectate);
            }}
            placeholder="Code or invite link"
            minLength={5}
            required
          />
          <button className="button secondary" disabled={loading || !code.trim()}>
            {spectate ? 'Watch' : 'Join'}
            <ArrowRight size={20} />
          </button>
        </form>
        <label className="spectate-choice">
          <input type="checkbox" checked={spectate} onChange={e => setSpectate(e.target.checked)} />
          <Eye size={17} />
          Join as a spectator
        </label>
        <div className="home-note">
          <Shield size={20} />
          <span>
            {account.account
              ? 'Your rooms follow your account across devices.'
              : 'Play as a guest, or sign in to keep your seat across devices.'}
          </span>
        </div>
      </section>
      {canPlaytest && (
        <section className="panel home-test-panel">
          <div className="test-emblem">
            <FlaskConical size={45} />
          </div>
          <h2>Solo playtest</h2>
          <p>A real room with three seats under your control, for testing without another device.</p>
          <ul className="test-features">
            <li>
              <Check size={18} />
              Switch between players
            </li>
            <li>
              <Check size={18} />
              Test incoming trade offers
            </li>
            <li>
              <Check size={18} />
              Same server and rules as multiplayer
            </li>
          </ul>
          <button className="button secondary full" disabled={loading} onClick={() => enter('test')}>
            <FlaskConical size={20} />
            Create solo test room
            <ArrowRight size={20} />
          </button>
          <button className="button secondary full home-editor-button" disabled={loading} onClick={openEditor}>
            <Hexagon size={20} />
            Board editor
            <ArrowRight size={20} />
          </button>
        </section>
      )}
      {account.account && (
        <section className="recent-rooms panel">
          <div className="section-heading">
            <h2>My rooms</h2>
            <button className="text-button" onClick={() => void account.refresh()}>
              Refresh
            </button>
          </div>
          {account.rooms.length ? (
            <div className="recent-room-list">
              {account.rooms.map(item => (
                <button
                  key={item.roomId}
                  className={`recent-room${item.yourTurn ? ' your-turn' : ''}`}
                  disabled={loading}
                  onClick={() => enter('join', item.roomId)}
                >
                  <Sailboat size={22} />
                  <span className="recent-room-text">
                    <strong>{item.roomId}</strong>
                    <small>
                      {roomStatusLabel(item)} · {item.players.join(', ')}
                    </small>
                  </span>
                  <ArrowRight size={18} />
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">Rooms you create or join will appear here.</p>
          )}
          {account.error && <p className="inline-alert">{account.error}</p>}
        </section>
      )}
    </main>
  );
}
