import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, BarChart3, Check, ChevronDown, ChevronUp, Clock3, Dices, Eye, FlaskConical, House, MessageCircle, Pause, Play, Route, ScrollText, Send, Undo2, UserRound, Users, Wifi, X } from 'lucide-react';
import { emptyBag, resourceCount } from '../../shared/engine';
import { RESOURCES, type DevelopmentCard, type GameAction, type GameView, type Resource, type ResourceBag } from '../../shared/types';
import type { useRoom } from '../hooks/useRoom';
import BoardViewport from './BoardViewport';
import ResourceHand, { RESOURCE_LABELS, ResourceIcon } from './ResourceHand';
import TradeComposer, { addTradeResource, GameDialog, ResourcePicker, TradeNotice, type TradeDraft } from './TradePanel';
import './GameTable.css';
import { PLAYER_COLORS as COLORS } from '../lib/palette';
type BuildKind = 'road' | 'settlement' | 'city';
const RECIPES: Record<BuildKind | 'development', Resource[]> = { road: ['wood', 'brick'], settlement: ['wood', 'brick', 'sheep', 'wheat'], city: ['wheat', 'wheat', 'ore', 'ore', 'ore'], development: ['sheep', 'wheat', 'ore'] };
export function CityIcon({ size = 24 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M3 21V7l5-5 5 5v7l4-4 5 4v7ZM3 8h10M8 12v4m9 0v5" /></svg>; }
function KnightIcon() { return <svg width="20" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21h14l-2-4 1-7-5-6-4-2-1 5-5 6 4 3 4-4-2 5Z" fill="currentColor" /><circle cx="14" cy="8" r="1.2" fill="#fff" /></svg>; }
function CardCount({ count, development = false }: { count: number; development?: boolean }) { return <span className={`stat-card ${development ? 'stat-dev' : ''}`}><strong>{count}</strong></span>; }
function PlayerPanel({ view, online }: { view: GameView; online: string[] }) {
  return <section className="player-panel" aria-label="Player scoreboard"><table className="player-table"><thead><tr><th>Players</th><th title="Resource cards"><span className="mini-card" /><span className="sr-only">Resources</span></th><th title="Development cards"><span className="mini-card dev" /><span className="sr-only">Development cards</span></th><th title="Longest road length"><Route size={16} /><span className="sr-only">Road</span></th><th title="Knights played"><KnightIcon /><span className="sr-only">Knights</span></th><th title="Victory points">VP</th></tr></thead><tbody>{view.players.map(p => <tr className={view.activePlayerId === p.id ? 'active' : ''} key={p.id} style={{ '--player-color': COLORS[p.color] } as CSSProperties} aria-label={`${p.name}${view.selfId === p.id ? ', you' : ''}`}>
    <th><span className="player-dot" /><span className="player-name" title={`${p.name}${!view.testMode && !online.includes(p.id) ? ' · disconnected' : ''}. ${p.settlementsLeft} settlements, ${p.citiesLeft} cities and ${p.roadsLeft} roads remaining.`}>{p.name}{p.id === view.selfId && <small>you</small>}</span>{!view.testMode && !online.includes(p.id) && <span className="offline-dot" title="Disconnected" />}</th>
    <td aria-label={`${p.resourceCount} resource cards`}><CardCount count={p.resourceCount} /></td><td aria-label={`${p.developmentCount} development cards`}>{p.developmentCount > 0 && <CardCount count={p.developmentCount} development />}</td><td className={view.longestRoadId === p.id ? 'award' : ''} title={view.longestRoadId === p.id ? 'Longest Road · 2 points' : 'Longest road length'}>{p.longestRoad}</td><td className={view.largestArmyId === p.id ? 'award' : ''} title={view.largestArmyId === p.id ? 'Largest Army · 2 points' : 'Knights played'}>{p.knights}</td><td className="points" title={p.points !== p.publicPoints ? `${p.publicPoints} public points · ${p.points} including victory cards` : `${p.points} public points`}>{p.publicPoints}{p.points !== p.publicPoints && <span className="private-points"> ({p.points})</span>}</td>
  </tr>)}</tbody></table></section>;
}
function BuildButton({ kind, remaining, disabled, selected, onClick }: { kind: BuildKind | 'development'; remaining: number; disabled: boolean; selected?: boolean; onClick: () => void }) {
  const [tip, setTip] = useState(false), held = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const label = kind === 'development' ? 'Buy development card' : `Build ${kind}`;
  const icon = kind === 'road' ? <Route size={23} /> : kind === 'settlement' ? <House size={23} /> : kind === 'city' ? <CityIcon size={23} /> : <span className="development-icon">✦</span>;
  return <span className={`recipe-control ${tip ? 'show-recipe' : ''}`} onMouseLeave={() => setTip(false)} onPointerDown={() => { clearTimeout(timer.current); held.current = false; timer.current = setTimeout(() => { held.current = true; setTip(true); }, 420); }} onPointerUp={() => { clearTimeout(timer.current); setTip(false); }} onPointerCancel={() => { clearTimeout(timer.current); setTip(false); }} onContextMenu={e => e.preventDefault()}><button aria-label={label} aria-pressed={!!selected} className={`build-compact ${selected ? 'selected' : ''}`} disabled={disabled} onClick={() => { if (held.current) { held.current = false; return; } setTip(false); onClick(); }}>{icon}<span className="build-label">{kind === 'development' ? 'Dev Card' : kind}</span><small>{remaining}</small></button><span className="recipe-tooltip" role="tooltip">{label}<span>{RECIPES[kind].map((r, i) => <span key={i} title={RESOURCE_LABELS[r]}><ResourceIcon resource={r} size={20} /></span>)}</span></span></span>;
}
function Dice({ dice }: { dice: [number, number] | null }) { return <span className="compact-dice" aria-label={dice ? `Dice total ${dice[0]+dice[1]}` : 'Not rolled'}>{dice ? dice.map((n,i) => <span key={i}>{['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][n]}</span>) : <Dices size={25} />}</span>; }
function DiceTracker({ view }: { view: GameView }) {
  const total = Object.values(view.diceCounts).reduce((a,b) => a+b,0), max = Math.max(1,...Object.values(view.diceCounts));
  return <div className="compact-tracker"><p>{total} {total === 1 ? 'roll' : 'rolls'}</p>{view.settings.trackDice ? <div className="dice-chart" aria-label="Dice results histogram">{Array.from({ length: 11 }, (_,i) => i+2).map(n => <div key={n}><span>{view.diceCounts[n] ?? 0}</span><i style={{ height: `${Math.max(2,(view.diceCounts[n] ?? 0)/max*90)}px` }} /><strong>{n}</strong></div>)}</div> : <p>Tracking is off.</p>}</div>;
}
function TablePanel({ view, busy, send, panel, setPanel }: { view: GameView; busy: boolean; send: (a: GameAction) => void; panel: string | null; setPanel: (s: string | null) => void }) {
  const [text, setText] = useState(''); const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [view.chat.at(-1)?.id, panel]);
  useEffect(() => { const message = view.chat.at(-1); if (message?.senderId === view.selfId && message.text === text.trim()) setText(''); }, [view.chat.at(-1)?.id, view.selfId]);
  return <section className={`chat-panel ${panel ? 'is-open' : ''}`} aria-label="Room conversation"><header><div className="panel-tabs">{[{ id: 'chat', Icon: MessageCircle }, { id: 'activity', Icon: ScrollText }, { id: 'dice', Icon: BarChart3 }].map(({id,Icon}) => <button key={id} aria-label={id} aria-pressed={panel === id} className={panel === id ? 'selected' : ''} onClick={() => setPanel(panel === id ? null : id)}><Icon size={17} /><span>{id}</span></button>)}</div><button className="icon-button" aria-label={panel ? 'Collapse chat panel' : 'Expand chat panel'} onClick={() => setPanel(panel ? null : 'chat')}>{panel ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button></header>
    {panel && <div className="panel-body">{panel === 'chat' ? <><div className="chat-messages" role="log" aria-live="polite">{view.chat.length ? view.chat.map(m => <p key={m.id}><strong>{m.name}{m.spectator ? ' · watching' : ''}</strong><span>{m.text}</span></p>) : <p className="chat-empty">Room chat. Only people with this code can join.</p>}<div ref={end} /></div><form className="chat-form" onSubmit={e => { e.preventDefault(); if (!text.trim()) return; send({ type: 'chat', text: text.trim() }); }}><input aria-label="Chat message" placeholder="Message the room…" maxLength={280} value={text} onChange={e => setText(e.target.value)} /><button aria-label="Send message" className="icon-button" disabled={busy || !text.trim()}><Send size={18} /></button></form></> : panel === 'activity' ? <ol className="activity-list">{[...view.log].reverse().map(e => <li key={e.id}>{e.text}</li>)}</ol> : <DiceTracker view={view} />}</div>}
  </section>;
}
const DEV_NAMES = { knight: 'Knight', 'road-building': 'Road Building', 'year-of-plenty': 'Year of Plenty', monopoly: 'Monopoly', 'victory-point': 'Victory Point' };
function DevelopmentDialog({ view, busy, send, close }: { view: GameView; busy: boolean; send: (a: GameAction) => void; close: () => void }) {
  const [selection, setSelection] = useState<DevelopmentCard | null>(null), [bag, setBag] = useState(emptyBag);
  function play(c: DevelopmentCard) {
    if (c.kind === 'knight' || c.kind === 'road-building') { send({ type: c.kind === 'knight' ? 'play-knight' : 'play-road-building', cardId: c.id }); close(); }
    else setSelection(c);
  }
  return <GameDialog title={selection ? DEV_NAMES[selection.kind] : 'Development cards'} close={close}>{!selection ? <div className="development-list">{view.development.length ? view.development.map(c => <button key={c.id} disabled={busy || !view.playableDevelopment.includes(c.id)} onClick={() => play(c)}><span className="development-emblem">{c.kind === 'knight' ? <KnightIcon /> : c.kind === 'victory-point' ? '★' : '✦'}</span><span><strong>{DEV_NAMES[c.kind]}</strong><small>{c.kind === 'victory-point' ? '1 private victory point · revealed when you win' : c.boughtTurn === view.turn ? 'Available next turn' : view.playableDevelopment.includes(c.id) ? 'Play this card' : 'Play one card on your turn'}</small></span></button>) : <p>No development cards yet.</p>}</div> : selection.kind === 'monopoly' ? <><p>Choose one resource. Every opponent gives you all of that type.</p><div className="monopoly-options">{RESOURCES.map(r => <button key={r} disabled={busy} onClick={() => { send({ type: 'play-monopoly', cardId: selection.id, resource: r }); close(); }}><ResourceIcon resource={r} size={30} />{RESOURCE_LABELS[r]}</button>)}</div></> : <><p>Choose two resources from the bank.</p><ResourcePicker value={bag} setValue={setBag} prefix="Take" limit={Object.fromEntries(RESOURCES.map(r => [r, view.bank[r] ? 2 : 0])) as ResourceBag} /><button className="button primary full" disabled={busy || resourceCount(bag) < 1 || resourceCount(bag) > 2} onClick={() => { send({ type: 'play-plenty', cardId: selection.id, resources: bag }); close(); }}>Take resources</button></>}</GameDialog>;
}
function DiscardPanel({ view, busy, send }: { view: GameView; busy: boolean; send: (a: GameAction) => void }) {
  const [bag, setBag] = useState(emptyBag), needed = view.pendingDiscards[view.selfId];
  return <section className="discard-overlay" aria-label="Discard resources"><h3>Discard {needed} resources</h3><ResourcePicker value={bag} setValue={setBag} limit={view.hand} prefix="Discard" /><button className="button primary full" disabled={busy || resourceCount(bag) !== needed} onClick={() => send({ type: 'discard', resources: bag })}>Return {resourceCount(bag)} / {needed}</button></section>;
}
function ProposalNotice({ view, busy, send }: { view: GameView; busy: boolean; send: (a: GameAction) => void }) {
  const p = view.proposal; if (!p) return null;
  const canVote = !p.rejected.length && p.required.includes(view.selfId) && !p.accepted.includes(view.selfId);
  return <div className="proposal-notice" role="region" aria-label="Game proposal"><div><strong>{p.kind === 'undo' ? 'Undo move?' : p.kind === 'pause' ? 'Pause game?' : 'Resume game?'}</strong><span>{p.description}</span><div className="proposal-voters">{p.required.map(id=>{const player=view.players.find(player=>player.id===id)!;const yes=p.accepted.includes(id),no=p.rejected.includes(id);return <span key={id} className={yes?'yes':no?'no':'pending'} aria-label={`${player.name}: ${yes?'yes':no?'no':'not yet approved'}`}><span className="vote-avatar" style={{background:COLORS[player.color]}}>{player.name.slice(0,1)}</span>{yes?<Check size={15}/>:<X size={15}/>}<span>{player.name}</span></span>;})}</div></div>{canVote ? <><button className="accept-trade" aria-label="Approve proposal" disabled={busy} onClick={() => send({ type: 'vote', proposalId: p.id, accept: true })}><Check size={18} /></button><button className="icon-button" aria-label="Reject proposal" disabled={busy} onClick={() => send({ type: 'vote', proposalId: p.id, accept: false })}><X size={18} /></button></> : <small>{p.rejected.length ? 'Declined' : 'Waiting for votes'}</small>}</div>;
}
export default function GameTable({ room, invite }: { room: ReturnType<typeof useRoom>; invite: () => void }) {
  const view = room.view!, send = room.send;
  const [mode, setMode] = useState<BuildKind | null>(null), [selected, setSelected] = useState<{ kind: BuildKind; id: string } | null>(null);
  const [trade, setTrade] = useState<TradeDraft | null>(null), [devOpen, setDevOpen] = useState(false);
  const [follow, setFollow] = useState(true), [now, setNow] = useState(Date.now());
  const [panel, setPanel] = useState<string | null>(() => matchMedia('(min-width: 721px)').matches ? 'chat' : null);
  const busy = room.pending || room.connection !== 'online';
  const ownTurn = view.activePlayerId === view.selfId, spectator = view.role === 'spectator', paused = view.pausedAt !== null;
  const self = view.players.find(p => p.id === view.selfId), active = view.players.find(p => p.id === view.activePlayerId);
  const blocked = busy || paused || spectator || !ownTurn;
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(id); }, []);
  useEffect(() => {
    const portrait = matchMedia('(max-width: 720px) and (orientation: portrait)');
    const collapse = () => { if (portrait.matches) setPanel(null); };
    collapse(); portrait.addEventListener('change', collapse);
    return () => portrait.removeEventListener('change', collapse);
  }, []);
  useEffect(() => {
    if (!view.testMode || spectator || !follow || busy || view.proposal || view.tradeOffer || paused) return;
    const next = view.phase === 'discard' ? Object.keys(view.pendingDiscards).find(id => view.pendingDiscards[id] > 0) : view.activePlayerId;
    if (next && next !== view.selfId) room.viewAs(next);
  }, [view, follow, busy, room.viewAs, spectator, paused]);
  useEffect(() => { setMode(null); setSelected(null); setTrade(null); setDevOpen(false); }, [view.selfId, view.phase]);
  useEffect(() => { if (selected && !(selected.kind === 'road' ? view.legal.roads : selected.kind === 'city' ? view.legal.cities : view.legal.settlements).includes(selected.id)) setSelected(null); }, [view.legal, selected]);
  const clock = view.pausedAt ?? now;
  const remaining = view.turnDeadline === null ? 0 : Math.max(0, Math.ceil((view.turnDeadline - clock)/1000));
  const rollIn = view.rollDeadline === null ? null : Math.max(0, Math.ceil((view.rollDeadline - clock)/1000));
  function place(selection: {kind: BuildKind; id: string}) {
    if (blocked) return;
    send(selection.kind === 'road' ? { type: view.phase === 'setup-road' ? 'place-road' : 'build-road', edgeId: selection.id } : { type: view.phase === 'setup-settlement' ? 'place-settlement' : selection.kind === 'city' ? 'build-city' : 'build-settlement', vertexId: selection.id });
    setSelected(null); setMode(null);
  }
  function pick(kind: BuildKind, id: string) { if (mode) place({kind,id}); else setSelected({kind,id}); }
  useEffect(() => {
    if (!selected) return;
    const cancel=(event: PointerEvent)=>{if (!(event.target instanceof Element) || !event.target.closest('.map-confirm, .board-target')) setSelected(null);};
    const escape=(event: KeyboardEvent)=>{if(event.key==='Escape') setSelected(null);};
    document.addEventListener('pointerdown',cancel); document.addEventListener('keydown',escape);
    return ()=>{document.removeEventListener('pointerdown',cancel);document.removeEventListener('keydown',escape);};
  },[selected]);
  const instruction = paused ? 'Game paused' : view.phase === 'finished' ? `${view.players.find(p => p.id === view.winnerId)?.name} wins!` : view.phase === 'setup-settlement' ? 'Placing settlement…' : view.phase === 'setup-road' ? 'Placing road…' : view.phase === 'free-roads' ? 'Placing free roads…' : view.phase === 'roll' ? `Roll dice${rollIn === null ? '' : ` · auto ${rollIn}s`}` : view.phase === 'robber' ? 'Moving robber…' : view.phase === 'steal' ? 'Choosing a player…' : view.phase === 'discard' ? 'Discarding resources…' : ownTurn ? 'Build or trade' : `${active?.name}’s turn`;
  let turnAction: ReactNode = null;
  if (ownTurn && view.phase === 'roll') turnAction = <button className="button primary turn-action" disabled={blocked} onClick={() => send({ type: 'roll' })}><Dices size={19} /><span>Roll dice</span></button>;
  if (ownTurn && view.phase === 'build') turnAction = <button className="button primary turn-action" disabled={blocked} onClick={() => send({ type: 'end-turn' })}><span>End turn</span><ArrowRight size={18} /></button>;
  if (ownTurn && view.phase === 'free-roads') turnAction = <button className="button secondary turn-action" disabled={blocked} onClick={() => send({ type: 'finish-free-roads' })}>Finish roads</button>;
  return <main className="game-table" style={{'--self-color': self ? COLORS[self.color] : COLORS[0]} as CSSProperties}>
    <div className="table-toolbar"><strong className="table-code">{view.roomId}</strong><span className={`table-connection ${room.connection}`} title={room.connection}><Wifi size={15} /><span className="sr-only">{room.connection === 'online' ? 'Connected' : room.connection}</span></span>{view.spectators.length > 0 && <span className="spectator-count" title="Spectators"><Eye size={15} />{view.spectators.length}</span>}
      {view.testMode && !spectator && <div className="solo-compact"><FlaskConical size={16} /><select aria-label="Play as" disabled={busy} value={view.selfId} onChange={e => { setFollow(false); room.viewAs(e.target.value); }}>{view.players.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select><label title="Automatically control the active player"><input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} aria-label="Follow current turn" /><span>Follow</span></label></div>}
      <div className="table-tools"><button className="icon-button" aria-label="Open chat" onClick={() => setPanel(panel ? null : 'chat')}><MessageCircle size={19} /></button><button className="icon-button" aria-label="Invite friends or spectators" onClick={invite}><Users size={19} /></button>{!spectator && <><button className="icon-button" aria-label="Propose undo" title={view.undoAvailable?.description ?? 'Undo is available after a build or trade; random reveals cannot be undone.'} disabled={busy || paused || !!view.proposal && !view.proposal.rejected.length || view.undoAvailable?.actorId !== view.selfId} onClick={() => send({ type: 'propose', kind: 'undo' })}><Undo2 size={19} /></button><button className="icon-button" aria-label={paused ? 'Propose resume' : 'Propose pause'} disabled={busy || !!view.proposal && !view.proposal.rejected.length || view.phase === 'finished'} onClick={() => send({ type: 'propose', kind: paused ? 'resume' : 'pause' })}>{paused ? <Play size={18} /> : <Pause size={18} />}</button></>}</div>
    </div>
    <PlayerPanel view={view} online={room.online} />
    <BoardViewport view={view} mode={view.phase === 'robber' ? 'robber' : mode} disabled={blocked} selected={selected} onConfirm={() => selected && place(selected)} onVertex={id => pick(view.legal.cities.includes(id) ? 'city' : 'settlement', id)} onEdge={id => pick('road', id)} corner={trade && <TradeComposer view={view} draft={trade} setDraft={setTrade} busy={busy} send={send} close={() => setTrade(null)} />} onHex={hexId => send({ type: 'move-robber', hexId })}>
      {view.phase === 'discard' && view.pendingDiscards[view.selfId] > 0 && !paused && <DiscardPanel key={view.selfId} view={view} busy={busy} send={send} />}
      <ProposalNotice view={view} busy={busy} send={send} /><TradeNotice view={view} busy={busy} now={now} send={send} />
      {paused && !view.proposal && <div className="paused-notice"><Pause size={18} />Paused · clocks are stopped</div>}
      {view.phase === 'steal' && ownTurn && <section className="steal-choices" aria-label="Choose a player to steal from"><strong>Take a random resource from…</strong><div>{view.legal.stealTargets.map(id=>{const player=view.players.find(p=>p.id===id)!;return <button key={id} aria-label={`Steal from ${player.name}`} style={{'--victim-color':COLORS[player.color]} as CSSProperties} disabled={blocked} onClick={()=>send({type:'steal',playerId:id})}><span className="victim-avatar"><UserRound size={28}/></span><span>{player.name}</span><CardCount count={player.resourceCount}/></button>;})}</div></section>}
    </BoardViewport>
    <div className="table-turn"><span className="turn-owner" style={{ color: active ? COLORS[active.color] : undefined }}>{spectator ? 'Spectating' : ownTurn ? 'Your turn' : active?.name}</span><span className="turn-instruction" role="status">{instruction}</span><Dice dice={view.dice} /><span className={`turn-clock ${view.turnExpired ? 'expired' : ''}`} aria-label={`Turn time remaining ${remaining} seconds`}><Clock3 size={15} />{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</span></div>
    <section className="table-hand" aria-label="Your hand">{spectator ? <p className="spectator-hand"><Eye size={20} />Watching · hands stay private</p> : <><ResourceHand hand={view.hand} playerName={self?.name} compact onSelect={resource => setTrade(previous => addTradeResource(previous,resource,view))} disabled={busy || paused} />{view.development.length > 0 && <button className="development-pile" aria-label={`Your development cards (${view.development.length})`} onClick={() => setDevOpen(true)}><span>✦</span><strong>{view.development.length}</strong><small>Dev Card</small></button>}</>}</section>
    <div className="table-actions">{!spectator && self && <><BuildButton kind="road" remaining={self.roadsLeft} selected={mode === 'road'} disabled={blocked || !view.legal.roads.length} onClick={() => { setMode(mode === 'road' ? null : 'road'); setSelected(null); }} /><BuildButton kind="settlement" remaining={self.settlementsLeft} selected={mode === 'settlement'} disabled={blocked || !view.legal.settlements.length} onClick={() => { setMode(mode === 'settlement' ? null : 'settlement'); setSelected(null); }} /><BuildButton kind="city" remaining={self.citiesLeft} selected={mode === 'city'} disabled={blocked || !view.legal.cities.length} onClick={() => { setMode(mode === 'city' ? null : 'city'); setSelected(null); }} /><BuildButton kind="development" remaining={view.developmentRemaining} disabled={blocked || view.phase !== 'build' || !view.developmentRemaining || !['sheep','wheat','ore'].every(r => view.hand[r as Resource] > 0)} onClick={() => send({ type: 'buy-development' })} /></>}{turnAction}</div>
    <TablePanel view={view} busy={busy} send={send} panel={panel} setPanel={setPanel} />
    {devOpen && <DevelopmentDialog view={view} busy={busy} send={send} close={() => setDevOpen(false)} />}
  </main>;
}
