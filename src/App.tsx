import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, Castle, Check, Clock3, Copy, Crown, Dices, FlaskConical, House, Layers, LoaderCircle, LogIn, LogOut, Maximize, Minus, Plus, Route, Sailboat, Settings2, Shield, Swords, Trophy, UserRound, Users, Wifi, X } from 'lucide-react';
import Board from './components/Board';
import ResourceHand, { ResourceIcon, RESOURCE_LABELS } from './components/ResourceHand';
import TradePanel from './components/TradePanel';
import { RESOURCES } from '../shared/types';
import type { GameAction, GameView, ResourceBag, Session } from '../shared/types';
import { enterRoom, roomFromLocation, savedSession, useRoom } from './hooks/useRoom';
import { useAccount } from './hooks/useAccount';

const COLORS = ['#ed805d', '#6db9bf', '#d9b55e', '#a696c8'];
const EMPTY: ResourceBag = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
type BuildMode = 'road' | 'settlement' | 'city' | 'robber' | null;
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
  const [mode, setMode] = useState<BuildMode>(null);
  const [followTurn, setFollowTurn] = useState(true);
  const [sideTab, setSideTab] = useState('trade');
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const busy = loading || room.pending || (Boolean(session) && room.connection !== 'online');
  const active = view?.players.find(p => p.id === view.activePlayerId);
  const isTurn = Boolean(view && view.selfId === view.activePlayerId);
  const hasGame = Boolean(view && view.phase !== 'lobby');

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, []);
  useEffect(() => { setMode(null); }, [view?.phase, view?.version]);
  useEffect(() => {
    const change = () => { const next = roomFromLocation(); setCode(next); setSession(savedSession(next)); };
    window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2500); return () => clearTimeout(timer); }, [copied]);
  useEffect(() => {
    if (!view?.testMode || !followTurn || busy || view.phase === 'lobby' || view.tradeOffer) return;
    const next = view.phase === 'discard' ? Object.keys(view.pendingDiscards).find(id => view.pendingDiscards[id] > 0) : view.activePlayerId;
    if (next && next !== view.selfId) room.viewAs(next);
  }, [view, followTurn, busy, room.viewAs]);

  async function enter(kind: 'create' | 'join' | 'test', roomCode = code) {
    setLoading(true); setError(null);
    try {
      const target = roomCode.trim().toUpperCase();
      const displayName = account.account?.username ?? (name.trim() || 'Player');
      const cached = kind === 'join' && !account.account ? savedSession(target) : null;
      const next = cached ?? await enterRoom(displayName, kind === 'join' ? target : undefined, account.account, kind === 'test');
      history.replaceState(null, '', `${location.pathname}${location.search}#room=${next.roomId}`);
      setSession(next); setFollowTurn(true); setSideTab('trade'); void account.refresh();
    } catch (err) { setError(err instanceof Error && err.name !== 'TypeError' ? err.message : 'Cannot reach the server. Check your connection and try again.'); }
    finally { setLoading(false); }
  }
  function home() {
    setSession(null); setMode(null); setError(null); setCode(''); setExpanded(false);
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
  const seconds = view?.rollDeadline ? Math.max(0, Math.ceil((view.rollDeadline - now) / 1000)) : null;
  const instruction = !view ? '' : view.phase === 'finished' ? `${view.players.find(p => p.id === view.winnerId)?.name} wins!`
    : view.phase === 'setup-settlement' ? isTurn ? 'Place a settlement on a highlighted corner.' : `${active?.name} is placing a settlement.`
    : view.phase === 'setup-road' ? isTurn ? 'Place a road beside your settlement.' : `${active?.name} is placing a road.`
    : view.phase === 'roll' ? isTurn ? 'Roll to collect resources.' : `${active?.name} is rolling.`
    : view.phase === 'discard' ? 'A seven! Players holding more than 7 cards must discard half.'
    : view.phase === 'robber' ? isTurn ? 'Select a tile for the robber.' : `${active?.name} is moving the robber.`
    : view.phase === 'steal' ? isTurn ? 'Choose a player to steal from.' : `${active?.name} is choosing a player.`
    : isTurn ? mode ? `Select a highlighted ${mode === 'road' ? 'edge' : 'corner'}.` : 'Build, trade, or end your turn.' : `${active?.name}’s turn`;

  return <div className={`app ${hasGame ? 'app-game' : ''} ${expanded ? 'board-expanded' : ''}`}>
    <header className="site-header"><button className="brand" onClick={home} aria-label="Islanders home"><Sailboat size={32} /><span>islanders<span className="brand-period">.</span></span></button><nav>{session && <button className="text-button" aria-label="Home" onClick={home}><ArrowLeft size={18} /><span>Home</span></button>}{account.account ? <><span className="account-name"><UserRound size={18} />{account.account.username}</span><button className="text-button" aria-label="Sign out" onClick={() => void signOut()} disabled={loading}><LogOut size={18} /><span>Sign out</span></button></> : <button className="button secondary" onClick={() => setAuthOpen(true)}><LogIn size={18} />Sign in</button>}</nav></header>
    {!session ? <main className="home-layout">
      <section className="home-heading"><span className="section-kicker"><Swords size={18} /> MULTIPLAYER STRATEGY</span><h1>Play Islanders</h1><p>Create a room, join friends, or test a game yourself.</p></section>
      <section className="panel home-play-panel"><div className="section-heading"><h2><Sailboat />Set up a game</h2><span className="subtle-badge">2–4 players</span></div>{!account.account ? <label className="field-label">Player name<input placeholder="Your name" maxLength={24} value={name} onChange={e => setName(e.target.value)} /></label> : <p>Playing as <strong>{account.account.username}</strong></p>}
        <button className="button primary create-button" disabled={loading} onClick={() => void enter('create')}>{loading ? <LoaderCircle className="spin" /> : <Plus />}Create room<ArrowRight className="push-right" /></button><div className="divider-label">or join a room</div>
        <form className="join-form" onSubmit={e => { e.preventDefault(); void enter('join'); }}><input aria-label="Room code" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="HARBOR42" minLength={5} maxLength={14} required /><button className="button secondary" disabled={loading || !code.trim()}>Join<ArrowRight size={20} /></button></form>
        <div className="home-note"><Shield size={20} /><span>{account.account ? 'Your rooms follow your account across devices.' : 'Play as a guest, or sign in to keep your seat across devices.'}</span></div>
      </section>
      <section className="panel home-test-panel"><div className="test-emblem"><FlaskConical size={45} /></div><h2>Solo playtest</h2><p>Create a real room with three seats under your control. Test building, trading, and turn changes without another device.</p><ul className="test-features"><li><Check size={18} />Switch between players</li><li><Check size={18} />Test incoming trade offers</li><li><Check size={18} />Same server and rules as multiplayer</li></ul><button className="button secondary full" disabled={loading} onClick={() => void enter('test')}><FlaskConical size={20} />Create solo test room<ArrowRight size={20} /></button></section>
      {account.account && <section className="recent-rooms panel"><div className="section-heading"><h2>My rooms</h2><button className="text-button" onClick={() => void account.refresh()}>Refresh</button></div>{account.rooms.length ? <div className="recent-room-list">{account.rooms.map(item => <button key={item.roomId} className="recent-room" disabled={loading} onClick={() => void enter('join', item.roomId)}><Sailboat size={22} /><strong>{item.roomId}</strong><span>Resume</span><ArrowRight size={18} /></button>)}</div> : <p className="muted">Rooms you create or join will appear here.</p>}{account.error && <p className="inline-alert">{account.error}</p>}</section>}
    </main> : !view ? <main className="connecting-screen"><LoaderCircle className="spin" size={40} /><h1>{room.connection === 'offline' ? 'Connection unavailable' : 'Connecting to your room'}</h1><button className="button secondary" onClick={home}>Return home</button></main> : view.phase === 'lobby' ? <main className="room-setup">
      <div className="page-heading"><div><span className="section-kicker">{view.testMode ? 'SOLO TEST ROOM' : 'GAME ROOM'}</span><h1>{view.roomId}</h1></div><div className="heading-actions"><Connection status={room.connection} /><button className="button secondary" onClick={() => setShareOpen(true)}><Users size={20} />Invite friends</button></div></div>
      {view.testMode && <div className="test-banner"><FlaskConical size={22} /><span><strong>Solo playtest.</strong> You control all three seats. This room is separate from regular multiplayer.</span></div>}
      <section className="setup-players panel"><div className="section-heading"><h2>Players</h2><span className="subtle-badge">{view.players.length} / 4</span></div>{view.players.map(p => <div className="lobby-player" key={p.id} style={{ '--player-color': COLORS[p.color] } as CSSProperties}><div className="player-avatar">{p.name.slice(0, 1).toUpperCase()}</div><div><strong>{p.name}</strong><span>{p.id === view.hostId ? 'Host' : view.testMode ? 'Test seat · controlled by you' : room.online.includes(p.id) ? 'Connected' : 'Offline'}</span></div>{p.id === view.hostId && <Crown className="gold" size={22} />}</div>)}{!view.testMode && Array.from({ length: 4 - view.players.length }, (_, i) => <button key={i} className="open-seat" onClick={() => setShareOpen(true)}><Plus size={23} />Invite a player</button>)}<div className="room-code-box"><span>Room code</span><strong>{view.roomId}</strong><button className="icon-button" onClick={copyInvite} aria-label="Copy invite link">{copied ? <Check /> : <Copy />}</button></div></section>
      <section className="setup-settings panel"><div className="section-heading"><h2><Settings2 size={22} />Game settings</h2><span className="subtle-badge">Standard island</span></div><div className="map-summary"><div className="map-hex"><Sailboat size={38} /></div><div><h3>Base game</h3><p>19 hexes · 10 victory points · Random board</p></div></div>
        <label className="setting-row"><span><Clock3 /><span><strong>Automatic dice roll</strong><small>Countdown at the start of each turn</small></span></span><select aria-label="Automatic dice roll" value={view.settings.autoRollSeconds} disabled={busy || session.playerId !== view.hostId} onChange={e => send({ type: 'configure', settings: { ...view.settings, autoRollSeconds: Number(e.target.value) } })}>{[0, 5, 10, 15, 30].map(n => <option key={n} value={n}>{n ? `${n} seconds` : 'Off'}</option>)}</select></label>
        <label className="setting-row"><span><BarChart3 /><span><strong>Dice results tracker</strong><small>Count how often each number is rolled</small></span></span><input className="switch-input" aria-label="Dice results tracker" type="checkbox" checked={view.settings.trackDice} disabled={busy || session.playerId !== view.hostId} onChange={e => send({ type: 'configure', settings: { ...view.settings, trackDice: e.target.checked } })} /></label>
        <div className="setting-row coming-soon"><span><Shield /><span><strong>Friendly robber</strong><small>Protect players with 2 victory points</small></span></span><span className="coming-badge">Coming soon</span></div><div className="setting-row coming-soon"><span><Layers /><span><strong>Discard limit</strong><small>Currently 7 cards</small></span></span><span className="coming-badge">Coming soon</span></div>
        <div className="setup-start"><p>{view.players.length < 2 ? 'Invite one more player, or create a solo test room.' : session.playerId === view.hostId ? 'Start to place your settlements.' : 'Waiting for the host to start.'}</p><button className="button primary" disabled={busy || session.playerId !== view.hostId || view.players.length < 2} onClick={() => send({ type: 'start' })}><Swords size={21} />Start game<ArrowRight size={21} /></button></div>
      </section>
    </main> : <main className="play-layout">
      <div className="game-topbar"><div className="game-ident"><strong>{view.roomId}</strong><span>Turn {view.turn || '—'}</span><span><Trophy size={17} />10 VP</span></div><div className="heading-actions"><Connection status={room.connection} /><button className="icon-button" aria-label="Invite friends" onClick={() => setShareOpen(true)}><Users size={20} /></button><button className="icon-button" aria-label={expanded ? 'Show game panels' : 'Expand board'} onClick={() => setExpanded(!expanded)}><Maximize size={20} /></button></div></div>
      <div className="scoreboard">{view.players.map(p => <div key={p.id} className={`score-player ${p.id === view.activePlayerId ? 'active' : ''}`} style={{ '--player-color': COLORS[p.color] } as CSSProperties}><div className="score-player-main"><span className="player-avatar">{p.name.slice(0, 1).toUpperCase()}</span><strong>{p.name}<small>{p.id === view.selfId ? 'YOU' : !view.testMode && !room.online.includes(p.id) ? 'OFFLINE' : p.id === view.activePlayerId ? 'PLAYING' : ''}</small></strong><span className="score-points"><Trophy size={16} />{p.points}</span></div><div className="score-stats"><span title="Resource cards"><Layers size={17} />{p.resourceCount}</span><span title="Settlements"><House size={17} />{5 - p.settlementsLeft}</span><span title="Cities"><Castle size={17} />{4 - p.citiesLeft}</span><span title="Roads"><Route size={17} />{15 - p.roadsLeft}</span></div></div>)}</div>
      {view.testMode && <div className="test-controls"><span><FlaskConical size={19} />Solo test controls</span><label>Play as<select aria-label="Play as" value={view.selfId} disabled={busy} onChange={e => { setFollowTurn(false); room.viewAs(e.target.value); }}>{view.players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="checkbox-label"><input type="checkbox" checked={followTurn} onChange={e => setFollowTurn(e.target.checked)} />Follow the current turn</label></div>}
      <section className="game-stage"><div className="board-wrap"><Board view={view} mode={view.phase === 'robber' ? 'robber' : mode} disabled={busy || !isTurn} onVertex={vertexId => send({ type: view.phase === 'setup-settlement' ? 'place-settlement' : mode === 'city' ? 'build-city' : 'build-settlement', vertexId })} onEdge={edgeId => send({ type: view.phase === 'setup-road' ? 'place-road' : 'build-road', edgeId })} onHex={hexId => send({ type: 'move-robber', hexId })} /></div><div className="turn-bar"><div className="turn-copy"><span className={isTurn ? 'gold' : 'muted'}>{view.phase === 'finished' ? 'GAME OVER' : isTurn ? `${view.testMode ? active?.name + ' · ' : ''}YOUR TURN` : `${active?.name ?? 'Players'}’s turn`}</span><p aria-live="polite">{instruction}</p></div><div className="turn-buttons"><DicePair dice={view.dice} />{view.phase === 'roll' && seconds !== null && <span className="roll-timer"><Clock3 size={18} /><strong>{seconds}s</strong></span>}{view.phase === 'roll' && isTurn && <button className="button primary" disabled={busy} onClick={() => send({ type: 'roll' })}><Dices size={21} />Roll dice</button>}{view.phase === 'build' && isTurn && <button className="button primary" disabled={busy} onClick={() => send({ type: 'end-turn' })}>End turn<ArrowRight size={20} /></button>}</div></div>
        {view.phase === 'discard' && view.pendingDiscards[view.selfId] > 0 && <Discard view={view} busy={busy} send={send} key={view.selfId + view.version} />}{view.phase === 'steal' && isTurn && <div className="steal-choices">{view.legal.stealTargets.map(id => <button key={id} className="button secondary" disabled={busy} onClick={() => send({ type: 'steal', playerId: id })}>Steal from {view.players.find(p => p.id === id)?.name}</button>)}</div>}
      </section>
      <aside className="game-sidebar"><div className="sidebar-tabs">{['trade', 'activity', 'dice'].map(tab => <button key={tab} className={sideTab === tab ? 'selected' : ''} onClick={() => setSideTab(tab)}>{tab}{tab === 'trade' && view.tradeOffer && <span className="notification-dot" />}</button>)}</div><div hidden={sideTab !== 'trade'}><TradePanel view={view} disabled={busy} send={send} /></div>{sideTab === 'activity' && <div className="activity-feed"><h2>Game activity</h2><ol>{[...view.log].reverse().map(entry => <li key={entry.id}>{entry.text}</li>)}</ol></div>}{sideTab === 'dice' && <DiceTracker view={view} />}</aside>
      <section className="hand-dock"><div className="hand-dock-heading"><h2>{view.testMode ? `${view.players.find(p => p.id === view.selfId)?.name}’s hand` : 'Your hand'}</h2><span>{Object.values(view.hand).reduce((sum, n) => sum + n, 0)} cards</span></div><ResourceHand hand={view.hand} playerName={view.players.find(p => p.id === view.selfId)?.name} /><div className="build-toolbar">{([{ id: 'road', label: 'Road', Icon: Route, costs: ['wood', 'brick'], legal: view.legal.roads }, { id: 'settlement', label: 'Settlement', Icon: House, costs: ['wood', 'brick', 'sheep', 'wheat'], legal: view.legal.settlements }, { id: 'city', label: 'City', Icon: Castle, costs: ['wheat', 'wheat', 'ore', 'ore', 'ore'], legal: view.legal.cities }] as const).map(item => <button key={item.id} className={`build-button ${mode === item.id ? 'selected' : ''}`} disabled={busy || view.phase !== 'build' || !isTurn || !item.legal.length} onClick={() => setMode(mode === item.id ? null : item.id)} aria-pressed={mode === item.id} title={`${item.label}: ${item.costs.map(r => RESOURCE_LABELS[r]).join(', ')}`}><item.Icon size={24} /><span><strong>{item.label}</strong><span className="build-cost">{item.costs.map((r, i) => <span className={`cost-dot cost-${r}`} key={i}><ResourceIcon resource={r} size={15} /></span>)}</span></span></button>)}</div></section>
    </main>}
    {(error ?? room.error) && <div className="toast" role="alert"><span>{error ?? room.error}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => { setError(null); room.clearError(); }}><X /></button></div>}
    {authOpen && <Modal title={authMode === 'login' ? 'Sign in to Islanders' : 'Create your account'} close={() => { setAuthOpen(false); setPassword(''); }}><div className="segmented"><button className={authMode === 'login' ? 'selected' : ''} onClick={() => setAuthMode('login')}>Sign in</button><button className={authMode === 'register' ? 'selected' : ''} onClick={() => setAuthMode('register')}>Create account</button></div><p className="muted">Use the same account on any device to return to your games.</p>{!window.isSecureContext && <p className="inline-alert">Use the HTTPS playtest link to sign in. Guest play still works here.</p>}<form className="stack-form" onSubmit={signIn}><label>Username<input autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" value={username} onChange={e => setUsername(e.target.value)} required /></label><label>Password<input type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={12} maxLength={128} placeholder="At least 12 characters" value={password} onChange={e => setPassword(e.target.value)} required /></label>{authError && <p role="alert" className="inline-alert">{authError}</p>}<button className="button primary full" disabled={loading || !window.isSecureContext}>{loading && <LoaderCircle className="spin" />}{authMode === 'login' ? 'Sign in' : 'Create account'}</button></form>{authMode === 'register' && <p className="form-note">Save your password. Password recovery is not available yet.</p>}</Modal>}
    {shareOpen && view && <Modal title={`Invite to ${view.roomId}`} close={() => setShareOpen(false)}><p>Share this link with another player.</p><label className="field-label">Invite link<input readOnly value={inviteUrl()} onFocus={e => e.target.select()} /></label><button className="button primary full" onClick={copyInvite}>{copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy invite link'}</button>{view.testMode && <p className="form-note">This is a solo room. Use the host account on another device to resume it.</p>}{location.protocol !== 'https:' && <p className="form-note">This address works on the same Wi-Fi. Use the HTTPS playtest link for other networks and cross-device sign-in.</p>}</Modal>}
  </div>;
}
function Connection({ status }: { status: string }) { return <span className={`connection-pill ${status !== 'online' ? 'disconnected' : ''}`}><Wifi size={16} />{status === 'online' ? 'Connected' : status === 'offline' ? 'Offline' : 'Connecting…'}</span>; }
function DicePair({ dice }: { dice: [number, number] | null }) {
  const patterns: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return <div className="dice-pair" aria-label={dice ? `Dice total ${dice[0] + dice[1]}` : 'Not yet rolled'}>{[0, 1].map(index => <div key={`${index}-${dice?.join('-')}`} className={`die ${dice ? 'rolled' : 'unrolled'}`}>{Array.from({ length: 9 }, (_, i) => <i key={i} className={dice && patterns[dice[index]].includes(i) ? 'pip' : ''} />)}{!dice && <span>?</span>}</div>)}</div>;
}
function DiceTracker({ view }: { view: GameView }) {
  const total = Object.values(view.diceCounts).reduce((sum, n) => sum + n, 0);
  const max = Math.max(1, ...Object.values(view.diceCounts));
  return <section className="dice-tracker"><div className="section-heading"><h2>Dice results</h2><span>{total} {total === 1 ? 'roll' : 'rolls'}</span></div>{!view.settings.trackDice ? <p>Dice tracking is off.</p> : <><div className="dice-chart" aria-label="Dice results histogram">{Array.from({ length: 11 }, (_, i) => i + 2).map(n => <div key={n} aria-label={`${n}: ${view.diceCounts[n] ?? 0} rolls`}><span>{view.diceCounts[n] ?? 0}</span><div className={`dice-bar ${n === 7 ? 'seven' : ''}`} style={{ height: `${Math.max(3, (view.diceCounts[n] ?? 0) / max * 125)}px` }} /><strong>{n}</strong></div>)}</div><p className="muted">Results are counted automatically for the whole table.</p></>}</section>;
}
function Discard({ view, busy, send }: { view: GameView; busy: boolean; send: (action: GameAction) => void }) {
  const [selected, setSelected] = useState<ResourceBag>({ ...EMPTY });
  const count = Object.values(selected).reduce((sum, n) => sum + n, 0);
  const needed = view.pendingDiscards[view.selfId];
  return <div className="discard-panel"><h3>Return {needed} resources <span>{count} / {needed}</span></h3><div className="discard-choices">{RESOURCES.map(r => <div key={r}><span><ResourceIcon resource={r} size={20} />{RESOURCE_LABELS[r]}</span><div><button className="icon-button" aria-label={`Discard one fewer ${RESOURCE_LABELS[r]}`} disabled={busy || selected[r] === 0} onClick={() => setSelected({ ...selected, [r]: selected[r] - 1 })}><Minus size={18} /></button><strong>{selected[r]}</strong><button className="icon-button" aria-label={`Discard one more ${RESOURCE_LABELS[r]}`} disabled={busy || selected[r] >= view.hand[r] || count >= needed} onClick={() => setSelected({ ...selected, [r]: selected[r] + 1 })}><Plus size={18} /></button></div></div>)}</div><button className="button primary" disabled={busy || count !== needed} onClick={() => send({ type: 'discard', resources: selected })}>Return resources</button></div>;
}
export default App;
