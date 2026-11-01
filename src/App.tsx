import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, Check, Clock3, Copy, Crown, Eye, FlaskConical, LoaderCircle, LogIn, LogOut, Plus, Sailboat, Settings2, Shield, Swords, UserRound, Users, Wifi, X } from 'lucide-react';
import GameTable from './components/GameTable';
import type { GameAction, Session } from '../shared/types';
import { enterRoom, roomFromLocation, savedSession, useRoom } from './hooks/useRoom';
import { useAccount } from './hooks/useAccount';

const COLORS = ['#ed5831', '#167fce', '#dfaa0b', '#8f49c6'];
declare const __LAN_ORIGIN__: string;

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="modal" onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }}><div className="modal-body"><div className="section-heading"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Close dialog"><X /></button></div>{children}</div></dialog>;
}

function App() {
  const account = useAccount();
  const [session, setSession] = useState<Session | null>(() => savedSession(roomFromLocation()));
  const room = useRoom(session);
  const view = room.view;
  const [name, setName] = useState('');
  const [code, setCode] = useState(roomFromLocation);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [spectate, setSpectate] = useState(false);
  const busy = loading || room.pending || (Boolean(session) && room.connection !== 'online');
  const hasGame = Boolean(view && view.phase !== 'lobby');

  useEffect(() => {
    const change = () => { const next = roomFromLocation(); setCode(next); setSession(savedSession(next)); };
    window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2500); return () => clearTimeout(timer); }, [copied]);
  async function enter(kind: 'create' | 'join' | 'test', roomCode = code) {
    setLoading(true); setError(null);
    try {
      const target = roomCode.trim().toUpperCase();
      const displayName = account.account?.username ?? (name.trim() || 'Player');
      const cached = kind === 'join' && !account.account ? savedSession(target) : null;
      const next = cached ?? await enterRoom(displayName, kind === 'join' ? target : undefined, account.account, kind === 'test', kind === 'join' && spectate);
      history.replaceState(null, '', `${location.pathname}${location.search}#room=${next.roomId}`);
      setSession(next); void account.refresh();
    } catch (err) { setError(err instanceof Error && err.name !== 'TypeError' ? err.message : 'Cannot reach the server. Check your connection and try again.'); }
    finally { setLoading(false); }
  }
  function home() {
    setSession(null); setError(null); setCode('');
    history.replaceState(null, '', `${location.pathname}${location.search}`); void account.refresh();
  }
  async function signIn(event: FormEvent) {
    event.preventDefault(); setLoading(true); setAuthError('');
    try { await account.authenticate(authMode, username, password); setPassword(''); setAuthOpen(false); }
    catch (err) { setAuthError(err instanceof Error ? err.message : 'Sign-in failed.'); }
    finally { setLoading(false); }
  }
  async function signOut() {
    setLoading(true);
    try { await account.logout(); home(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not sign out.'); }
    finally { setLoading(false); }
  }
  function inviteUrl() {
    const url = new URL(location.href);
    if (['localhost', '127.0.0.1'].includes(url.hostname) && typeof __LAN_ORIGIN__ !== 'undefined' && __LAN_ORIGIN__) {
      const lan = new URL(__LAN_ORIGIN__); url.host = lan.host; url.protocol = lan.protocol;
    }
    url.hash = `room=${view?.roomId ?? ''}`; return url.href;
  }
  async function copyInvite() {
    try { await navigator.clipboard.writeText(inviteUrl()); setCopied(true); }
    catch { setShareOpen(true); }
  }
  function send(action: GameAction) { setError(null); room.send(action); }
  return <div className={`app ${hasGame ? 'app-game' : ''} `}>
    <header className="site-header"><button className="brand" onClick={home} aria-label="Islanders home"><Sailboat size={32} /><span>islanders<span className="brand-period">.</span></span></button><nav>{session && <button className="text-button" aria-label="Home" onClick={home}><ArrowLeft size={18} /><span>Home</span></button>}{account.account ? <><span className="account-name"><UserRound size={18} />{account.account.username}</span><button className="text-button" aria-label="Sign out" onClick={() => void signOut()} disabled={loading}><LogOut size={18} /><span>Sign out</span></button></> : <button className="button secondary" onClick={() => setAuthOpen(true)}><LogIn size={18} />Sign in</button>}</nav></header>
    {!session ? <main className="home-layout">
      <section className="home-heading"><span className="section-kicker"><Swords size={18} /> MULTIPLAYER STRATEGY</span><h1>Play Islanders</h1><p>Create a room, join friends, or test a game yourself.</p></section>
      <section className="panel home-play-panel"><div className="section-heading"><h2><Sailboat />Set up a game</h2><span className="subtle-badge">2–4 players</span></div>{!account.account ? <label className="field-label">Player name<input placeholder="Your name" maxLength={24} value={name} onChange={e => setName(e.target.value)} /></label> : <p>Playing as <strong>{account.account.username}</strong></p>}
        <button className="button primary create-button" disabled={loading} onClick={() => void enter('create')}>{loading ? <LoaderCircle className="spin" /> : <Plus />}Create room<ArrowRight className="push-right" /></button><div className="divider-label">or join a room</div>
        <form className="join-form" onSubmit={e => { e.preventDefault(); void enter('join'); }}><input aria-label="Room code" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="HARBOR42" minLength={5} maxLength={14} required /><button className="button secondary" disabled={loading || !code.trim()}>{spectate ? 'Watch' : 'Join'}<ArrowRight size={20} /></button></form>
        <label className="spectate-choice"><input type="checkbox" checked={spectate} onChange={e => setSpectate(e.target.checked)} /><Eye size={17} />Join as a spectator</label><div className="home-note"><Shield size={20} /><span>{account.account ? 'Your rooms follow your account across devices.' : 'Play as a guest, or sign in to keep your seat across devices.'}</span></div>
      </section>
      <section className="panel home-test-panel"><div className="test-emblem"><FlaskConical size={45} /></div><h2>Solo playtest</h2><p>Create a real room with three seats under your control. Test building, trading, and turn changes without another device.</p><ul className="test-features"><li><Check size={18} />Switch between players</li><li><Check size={18} />Test incoming trade offers</li><li><Check size={18} />Same server and rules as multiplayer</li></ul><button className="button secondary full" disabled={loading} onClick={() => void enter('test')}><FlaskConical size={20} />Create solo test room<ArrowRight size={20} /></button></section>
      {account.account && <section className="recent-rooms panel"><div className="section-heading"><h2>My rooms</h2><button className="text-button" onClick={() => void account.refresh()}>Refresh</button></div>{account.rooms.length ? <div className="recent-room-list">{account.rooms.map(item => <button key={item.roomId} className="recent-room" disabled={loading} onClick={() => void enter('join', item.roomId)}><Sailboat size={22} /><strong>{item.roomId}</strong><span>Resume</span><ArrowRight size={18} /></button>)}</div> : <p className="muted">Rooms you create or join will appear here.</p>}{account.error && <p className="inline-alert">{account.error}</p>}</section>}
    </main> : !view ? <main className="connecting-screen"><LoaderCircle className="spin" size={40} /><h1>{room.connection === 'offline' ? 'Connection unavailable' : 'Connecting to your room'}</h1><button className="button secondary" onClick={home}>Return home</button></main> : view.phase === 'lobby' ? <main className="room-setup">
      <div className="page-heading"><div><span className="section-kicker">{view.testMode ? 'SOLO TEST ROOM' : 'GAME ROOM'}</span><h1>{view.roomId}</h1></div><div className="heading-actions"><Connection status={room.connection} /><button className="button secondary" onClick={() => setShareOpen(true)}><Users size={20} />Invite friends</button></div></div>
      {view.role === 'spectator' && <div className="test-banner"><Eye size={20} />You are spectating. Player hands stay private.</div>}{view.testMode && <div className="test-banner"><FlaskConical size={22} /><span><strong>Solo playtest.</strong> You control all three seats. This room is separate from regular multiplayer.</span></div>}
      <section className="setup-players panel"><div className="section-heading"><h2>Players</h2><span className="subtle-badge">{view.players.length} / 4</span></div>{view.players.map(p => <div className="lobby-player" key={p.id} style={{ '--player-color': COLORS[p.color] } as CSSProperties}><div className="player-avatar">{p.name.slice(0, 1).toUpperCase()}</div><div><strong>{p.name}</strong><span>{p.id === view.hostId ? 'Host' : view.testMode ? 'Test seat · controlled by you' : room.online.includes(p.id) ? 'Connected' : 'Offline'}</span></div>{p.id === view.hostId && <Crown className="gold" size={22} />}</div>)}{!view.testMode && Array.from({ length: 4 - view.players.length }, (_, i) => <button key={i} className="open-seat" onClick={() => setShareOpen(true)}><Plus size={23} />Invite a player</button>)}<div className="room-code-box"><span>Room code</span><strong>{view.roomId}</strong><button className="icon-button" onClick={copyInvite} aria-label="Copy invite link">{copied ? <Check /> : <Copy />}</button></div></section>
      <section className="setup-settings panel"><div className="section-heading"><h2><Settings2 size={22} />Game settings</h2><span className="subtle-badge">Standard island</span></div><div className="map-summary"><div className="map-hex"><Sailboat size={38} /></div><div><h3>Base game</h3><p>19 hexes · 9 harbors · 10 victory points</p></div></div>
        <label className="setting-row"><span><Clock3 /><span><strong>Automatic dice roll</strong><small>Countdown at the start of each turn</small></span></span><select aria-label="Automatic dice roll" value={view.settings.autoRollSeconds} disabled={busy || session.playerId !== view.hostId} onChange={e => send({ type: 'configure', settings: { ...view.settings, autoRollSeconds: Number(e.target.value) } })}>{[0, 5, 10, 15, 30].map(n => <option key={n} value={n}>{n ? `${n} seconds` : 'Off'}</option>)}</select></label>
        <label className="setting-row"><span><BarChart3 /><span><strong>Dice results tracker</strong><small>Count how often each number is rolled</small></span></span><input className="switch-input" aria-label="Dice results tracker" type="checkbox" checked={view.settings.trackDice} disabled={busy || session.playerId !== view.hostId} onChange={e => send({ type: 'configure', settings: { ...view.settings, trackDice: e.target.checked } })} /></label>
        <label className="setting-row"><span><Settings2 size={21} /><span><strong>Number layout</strong><small>Classic order is available for the base game.</small></span></span><select aria-label="Number layout" value={view.settings.numberLayout} disabled={busy || session.playerId !== view.hostId} onChange={e => send({ type: 'configure', settings: { ...view.settings, numberLayout: e.target.value as 'ordered' | 'random' } })}><option value="random">Random</option><option value="ordered">Classic · 5–2–6…</option></select></label>
        <label className="setting-row"><span><Clock3 size={21} /><span><strong>Turn time limit</strong><small>Seconds per turn; expiry waits for the player.</small></span></span><input className="setting-number" aria-label="Turn time limit" type="number" min={15} max={900} defaultValue={view.settings.turnSeconds} key={view.settings.turnSeconds} disabled={busy || session.playerId !== view.hostId} onBlur={e => { const value = Number(e.target.value); if (value !== view.settings.turnSeconds && value >= 15 && value <= 900 && Number.isInteger(value)) send({ type: 'configure', settings: { ...view.settings, turnSeconds: value } }); }} /></label>
        <label className="setting-row"><span><Shield size={21} /><span><strong>Friendly robber</strong><small>Protect players with 2 visible points or fewer.</small></span></span><input type="checkbox" checked={view.settings.friendlyRobber} disabled={busy || session.playerId !== view.hostId} onChange={e => send({ type: 'configure', settings: { ...view.settings, friendlyRobber: e.target.checked } })} /></label>
        <label className="setting-row"><span><Shield size={21} /><span><strong>Discard limit</strong><small>Discard half when holding more than this.</small></span></span><select aria-label="Discard limit" value={view.settings.discardLimit} disabled={busy || session.playerId !== view.hostId} onChange={e => send({ type: 'configure', settings: { ...view.settings, discardLimit: Number(e.target.value) } })}>{[7,8,9,10,12].map(n => <option value={n} key={n}>{n} cards</option>)}</select></label>
        <div className="setup-start"><p>{view.players.length < 2 ? 'Invite one more player, or create a solo test room.' : session.playerId === view.hostId ? 'Start to place your settlements.' : 'Waiting for the host to start.'}</p><button className="button primary" disabled={busy || session.playerId !== view.hostId || view.players.length < 2} onClick={() => send({ type: 'start' })}><Swords size={21} />Start game<ArrowRight size={21} /></button></div>
      </section>
    </main> : <GameTable room={room} invite={() => setShareOpen(true)} />}
    {(error ?? room.error) && <div className="toast" role="alert"><span>{error ?? room.error}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => { setError(null); room.clearError(); }}><X /></button></div>}
    {authOpen && <Modal title={authMode === 'login' ? 'Sign in to Islanders' : 'Create your account'} close={() => { setAuthOpen(false); setPassword(''); }}><div className="segmented"><button className={authMode === 'login' ? 'selected' : ''} onClick={() => setAuthMode('login')}>Sign in</button><button className={authMode === 'register' ? 'selected' : ''} onClick={() => setAuthMode('register')}>Create account</button></div><p className="muted">Use the same account on any device to return to your games.</p>{!window.isSecureContext && <p className="inline-alert">Use the HTTPS playtest link to sign in. Guest play still works here.</p>}<form className="stack-form" onSubmit={signIn}><label>Username<input autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" value={username} onChange={e => setUsername(e.target.value)} required /></label><label>Password<input type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={12} maxLength={128} placeholder="At least 12 characters" value={password} onChange={e => setPassword(e.target.value)} required /></label>{authError && <p role="alert" className="inline-alert">{authError}</p>}<button className="button primary full" disabled={loading || !window.isSecureContext}>{loading && <LoaderCircle className="spin" />}{authMode === 'login' ? 'Sign in' : 'Create account'}</button></form>{authMode === 'register' && <p className="form-note">Save your password. Password recovery is not available yet.</p>}</Modal>}
    {shareOpen && view && <Modal title={`Invite to ${view.roomId}`} close={() => setShareOpen(false)}><p>Share this private room link. Friends can join as players or choose “Join as a spectator.”</p><label className="field-label">Invite link<input readOnly value={inviteUrl()} onFocus={e => e.target.select()} /></label><button className="button primary full" onClick={copyInvite}>{copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy invite link'}</button>{view.testMode && <p className="form-note">This is a solo room. Use the host account on another device to resume it.</p>}{location.protocol !== 'https:' && <p className="form-note">This address works on the same Wi-Fi. Use the HTTPS playtest link for other networks and cross-device sign-in.</p>}</Modal>}
  </div>;
}
function Connection({ status }: { status: string }) { return <span className={`connection-pill ${status !== 'online' ? 'disconnected' : ''}`}><Wifi size={16} />{status === 'online' ? 'Connected' : status === 'offline' ? 'Offline' : 'Connecting…'}</span>; }
export default App;
