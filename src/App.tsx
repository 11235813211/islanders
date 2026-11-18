import { ArrowLeft, LoaderCircle, LogIn, LogOut, Sailboat, UserRound, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { isBotGame, nameTaken } from '../shared/settings';
import type { AccountSession, GameAction, Session } from '../shared/types';
import { AccountDialog, RecoveryCodeDialog, SignInDialog } from './components/AccountDialogs';
import BoardEditor from './components/editor/BoardEditor';
import GameTable from './components/GameTable';
import HomeScreen from './components/HomeScreen';
import InviteDialog, { type InviteKind } from './components/InviteDialog';
import { roomCodeOf } from './components/lobby/RoomCode';
import RoomLobby from './components/RoomLobby';
import { useAccount } from './hooks/useAccount';
import { enterRoom, rememberRoomCode, roomFromLocation, savedSession, useRoom } from './hooks/useRoom';
import { ApiError } from './lib/api';

declare const __LAN_ORIGIN__: string;

/** Put a room code in the address bar without reloading or firing hashchange. */
function showRoomInAddress(code: string) {
  history.replaceState(null, '', `${location.pathname}${location.search}#room=${code}`);
}

function App() {
  const account = useAccount();
  const [session, setSession] = useState<Session | null>(() => savedSession(roomFromLocation()));
  const room = useRoom(session, Boolean(account.account));
  const view = room.view;
  const [name, setName] = useState('');
  const [code, setCode] = useState(roomFromLocation);
  const [inviteCode, setInviteCode] = useState(roomFromLocation);
  const attemptedInvite = useRef('');
  const entryRequest = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'sign-in' | 'account' | 'share' | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [spectate, setSpectate] = useState(false);
  const [leavingGame, setLeavingGame] = useState(false);
  const [editing, setEditing] = useState(() => location.hash === '#editor');
  /** The board editor's "discard unsaved changes?" check, for the header's Home button. */
  const editorLeave = useRef<(() => boolean) | null>(null);
  const busy = loading || room.pending || (Boolean(session) && room.connection !== 'online');
  const hasGame = Boolean(view && view.phase !== 'lobby');
  // Solo test rooms are a developer tool: local dev, or accounts listed in PLAYTEST_USERS.
  const canPlaytest = import.meta.env.DEV || account.playtest;

  useEffect(() => {
    const change = () => {
      const next = roomFromLocation();
      entryRequest.current++;
      attemptedInvite.current = '';
      setInviteCode(next);
      setCode(next);
      setSession(savedSession(next));
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: follow an invite link once per account.
  useEffect(() => {
    const key = `${inviteCode}:${account.account?.username ?? 'guest'}`;
    if (!inviteCode || session || attemptedInvite.current === key) return;
    attemptedInvite.current = key;
    void enter('join', inviteCode, true);
  }, [inviteCode, session, account.account?.username]);
  // The address follows the room's code, so an old link lands on the new one.
  const currentCode = session && view?.roomId === session.roomId ? roomCodeOf(view) : null;
  useEffect(() => {
    if (!session || !currentCode) return;
    rememberRoomCode(session, currentCode);
    if (roomFromLocation() !== currentCode) showRoomInAddress(currentCode);
  }, [session, currentCode]);
  // Left, removed, or the room closed: go home and say why.
  // biome-ignore lint/correctness/useExhaustiveDependencies: react only to the room ending.
  useEffect(() => {
    if (!room.left) return;
    home();
    setNotice(room.left);
  }, [room.left]);

  async function enter(kind: 'create' | 'join' | 'test', roomCode = code, directInvite = false, mapId?: string) {
    const request = ++entryRequest.current;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const target = roomCode.trim().toUpperCase();
      // A blank guest name is filled in by the server from shared/guest-names.ts.
      const displayName = account.account?.displayName ?? account.account?.username ?? name.trim();
      const saved = kind === 'join' ? savedSession(target) : null;
      const cached = account.account ? null : saved;
      const watching =
        kind === 'join' &&
        (directInvite ? new URLSearchParams(location.hash.slice(1)).get('spectate') === '1' : spectate);
      const next =
        cached ??
        (await enterRoom(
          displayName,
          kind === 'join' ? target : undefined,
          account.account,
          kind === 'test',
          watching,
          directInvite,
          mapId,
          // Signed in since playing here as a guest: that guest seat becomes the account's.
          saved?.token,
        ));
      if (entryRequest.current !== request) return;
      showRoomInAddress(kind === 'join' ? target : next.roomId);
      setEditing(false);
      setSession(next);
      void account.refresh();
    } catch (err) {
      if (entryRequest.current !== request) return;
      // The room is gone: drop it from the address so a refresh doesn't try again.
      if (kind === 'join' && err instanceof ApiError && err.status === 404) {
        home();
        setNotice(err.message);
        return;
      }
      setError(
        err instanceof Error && err.name !== 'TypeError'
          ? err.message
          : 'Cannot reach the server. Check your connection and try again.',
      );
    } finally {
      if (entryRequest.current === request) setLoading(false);
    }
  }
  function home() {
    setLeavingGame(false);
    setEditing(false);
    entryRequest.current++;
    attemptedInvite.current = '';
    setInviteCode('');
    setLoading(false);
    setSession(null);
    setError(null);
    setCode('');
    setDialog(null);
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    void account.refresh();
  }
  async function afterSignIn(signedIn: AccountSession & { recoveryCode?: string }) {
    setDialog(null);
    if (signedIn.recoveryCode) setRecoveryCode(signedIn.recoveryCode);
    if (session) {
      try {
        // The guest seat becomes the account's (host role included) rather than a second seat.
        setSession(
          await enterRoom(signedIn.username, session.roomId, signedIn, false, false, true, undefined, session.token),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not reconnect your account to this room.');
      }
    }
  }
  async function signOut() {
    setLoading(true);
    try {
      await account.logout();
      home();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out.');
    } finally {
      setLoading(false);
    }
  }
  /** A link to this room. Spectator links watch even when a seat is open. */
  function inviteUrl(kind: InviteKind = 'player') {
    const url = new URL(location.href);
    if (['localhost', '127.0.0.1'].includes(url.hostname) && typeof __LAN_ORIGIN__ !== 'undefined' && __LAN_ORIGIN__) {
      const lan = new URL(__LAN_ORIGIN__);
      url.host = lan.host;
      url.protocol = lan.protocol;
    }
    url.hash = `room=${view ? roomCodeOf(view) : ''}${kind === 'spectator' ? '&spectate=1' : ''}`;
    return url.href;
  }
  /** Home from the header. Leaving a game against bots first asks whether to save it or end it. */
  function goHome() {
    if (view && hasGame && view.role === 'player' && isBotGame(view)) setLeavingGame(true);
    else if (!editing || (editorLeave.current?.() ?? true)) home();
  }
  function send(action: GameAction) {
    setError(null);
    room.send(action);
  }
  /** Use this name in the room in progress, when it is new there and nobody else has it. */
  function renameInRoom(name: string) {
    if (!view) return;
    const members = [...view.players, ...view.spectators];
    const self = members.find(member => member.id === view.selfId);
    if (self && self.name !== name && !nameTaken(members, name, self.id)) send({ type: 'set-name', name });
  }
  /** A name change from the table or lobby. Signed-in players keep it for later rooms too. */
  function changeName(name: string) {
    renameInRoom(name);
    if (account.account && !view?.testMode)
      account.rename(name).catch(err => setError(err instanceof Error ? err.message : 'Could not save your name.'));
  }

  const header = (
    <header className="site-header">
      <button className="brand" onClick={home} aria-label="Islanders home">
        <Sailboat size={32} />
        <span>
          islanders<span className="brand-period">.</span>
        </span>
      </button>
      <nav>
        {(session || editing) && (
          <button className="text-button" aria-label="Home" onClick={goHome}>
            <ArrowLeft size={18} />
            <span>Home</span>
          </button>
        )}
        {account.account ? (
          <>
            <button
              className="text-button account-name"
              aria-label="Account settings"
              onClick={() => setDialog('account')}
            >
              <UserRound size={18} />
              <span>{account.account.displayName ?? account.account.username}</span>
              {!account.hasRecoveryCode && <span className="attention-dot" title="Make a recovery code" />}
            </button>
            <button className="text-button" aria-label="Sign out" onClick={() => void signOut()} disabled={loading}>
              <LogOut size={18} />
              <span>Sign out</span>
            </button>
          </>
        ) : (
          <button className="button secondary" onClick={() => setDialog('sign-in')}>
            <LogIn size={18} />
            Sign in
          </button>
        )}
      </nav>
    </header>
  );

  let screen: ReactNode;
  if (!session && inviteCode)
    screen = (
      <main className="connecting-screen">
        {loading && <LoaderCircle className="spin" size={40} />}
        <h1>{loading ? `Joining ${inviteCode}…` : `Join ${inviteCode}`}</h1>
        {error && <p role="status">{error}</p>}
        {!loading && (
          <button className="button primary" onClick={() => void enter('join', inviteCode, true)}>
            {error ? 'Try again' : 'Join here'}
          </button>
        )}
        <button className="button secondary" onClick={home}>
          Return home
        </button>
      </main>
    );
  else if (!session && editing && canPlaytest)
    screen = (
      <BoardEditor
        account={account.account}
        close={home}
        playtest={mapId => void enter('test', undefined, false, mapId)}
        leaveCheck={editorLeave}
      />
    );
  else if (!session)
    screen = (
      <HomeScreen
        account={account}
        canPlaytest={canPlaytest}
        loading={loading}
        name={name}
        setName={setName}
        code={code}
        setCode={setCode}
        spectate={spectate}
        setSpectate={setSpectate}
        enter={(kind, roomId) => void enter(kind, roomId)}
        openEditor={() => {
          history.replaceState(null, '', `${location.pathname}${location.search}#editor`);
          setEditing(true);
        }}
      />
    );
  else if (!view)
    screen = (
      <main className="connecting-screen">
        <LoaderCircle className="spin" size={40} />
        <h1>{room.connection === 'offline' ? 'Connection unavailable' : 'Connecting to your room'}</h1>
        <button className="button secondary" onClick={home}>
          Return home
        </button>
      </main>
    );
  else if (view.phase === 'lobby')
    screen = (
      <RoomLobby
        view={view}
        playerId={session.playerId}
        connection={room.connection}
        online={room.online}
        busy={busy}
        send={send}
        saveName={changeName}
        recording={room.recording}
        setRecordingChoice={room.setRecordingChoice}
        invite={() => setDialog('share')}
        setCode={canPlaytest ? room.setInviteCode : undefined}
      />
    );
  else
    screen = (
      <GameTable
        room={room}
        invite={() => setDialog('share')}
        home={home}
        leaving={leavingGame}
        setLeaving={setLeavingGame}
        signedIn={Boolean(account.account)}
        signIn={() => setDialog('sign-in')}
        saveName={changeName}
      />
    );

  const message = error ?? room.error;
  return (
    <div className={`app ${hasGame ? 'app-game' : ''}`}>
      {header}
      {screen}
      {(message || notice) && (
        <div className={`toast${message ? '' : ' toast-info'}`} role={message ? 'alert' : 'status'}>
          <span>{message ?? notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => {
              setError(null);
              setNotice(null);
              room.clearError();
            }}
          >
            <X />
          </button>
        </div>
      )}
      {dialog === 'sign-in' && (
        <SignInDialog
          account={account}
          close={() => setDialog(null)}
          onSignedIn={signedIn => void afterSignIn(signedIn)}
        />
      )}
      {dialog === 'account' && account.account && (
        <AccountDialog
          account={account}
          close={() => setDialog(null)}
          onCode={codeValue => {
            setDialog(null);
            setRecoveryCode(codeValue);
          }}
          onDeleted={() => {
            home();
            setNotice('Your account was deleted.');
          }}
          onRenamed={renameInRoom}
        />
      )}
      {recoveryCode && <RecoveryCodeDialog code={recoveryCode} close={() => setRecoveryCode(null)} />}
      {dialog === 'share' && view && <InviteDialog view={view} url={inviteUrl} close={() => setDialog(null)} />}
    </div>
  );
}
export default App;
