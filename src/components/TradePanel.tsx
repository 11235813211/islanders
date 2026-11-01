import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftRight, ArrowRight, Check, Minus, Plus, X } from 'lucide-react';
import { RESOURCES, type GameAction, type GameView, type Resource, type ResourceBag } from '../../shared/types';
import { RESOURCE_LABELS, ResourceIcon } from './ResourceHand';
import { emptyBag, resourceCount } from '../../shared/engine';

export function GameDialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current; el?.showModal(); return () => el?.close(); }, []);
  return createPortal(<dialog ref={ref} className="modal game-dialog" aria-label={title} onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) close(); }}><div className="modal-body"><div className="section-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={20} /></button></div>{children}</div></dialog>, document.body);
}
export function Bundle({ bag }: { bag: ResourceBag }) {
  return <span className="trade-bundle">{RESOURCES.filter(r => bag[r] > 0).map(r => <span className={`trade-chip cards-${r}`} key={r} aria-label={`${bag[r]} ${RESOURCE_LABELS[r]}`} title={`${bag[r]} ${RESOURCE_LABELS[r]}`}><ResourceIcon resource={r} size={22} /><strong>{bag[r]}</strong></span>)}</span>;
}
export function ResourcePicker({ value, setValue, limit, opposite, prefix }: { value: ResourceBag; setValue: (v: ResourceBag) => void; limit?: ResourceBag; opposite?: ResourceBag; prefix: string }) {
  return <div className="resource-picker">{RESOURCES.map(r => <div key={r} className={`picker-cell cards-${r}`}><ResourceIcon resource={r} size={26} /><span>{RESOURCE_LABELS[r]}</span><div className="stepper"><button aria-label={`${prefix} one fewer ${RESOURCE_LABELS[r]}`} disabled={!value[r]} onClick={() => setValue({ ...value, [r]: value[r]-1 })}><Minus size={15} /></button><output>{value[r]}</output><button aria-label={`${prefix} one more ${RESOURCE_LABELS[r]}`} disabled={!!opposite?.[r] || value[r] >= (limit?.[r] ?? 19)} onClick={() => setValue({ ...value, [r]: value[r]+1 })}><Plus size={15} /></button></div></div>)}</div>;
}
export function TradeNotice({ view, busy, now, send }: { view: GameView; busy: boolean; now: number; send: (a: GameAction) => void }) {
  const offer = view.tradeOffer;
  if (!offer || view.role === 'spectator' || offer.declinedBy.includes(view.selfId)) return null;
  const mine = offer.fromId === view.selfId;
  const affordable = RESOURCES.every(r => view.hand[r] >= offer.want[r]);
  const clock = view.pausedAt ?? now;
  const progress = Math.max(0, Math.min(1, (offer.expiresAt - clock) / (offer.expiresAt - offer.createdAt)));
  if (!progress) return null;
  return <div className="trade-notice" role="region" aria-label="Trade offer">
    <span className="offer-pie" role="img" aria-label="Offer time remaining" style={{ '--progress': `${progress*360}deg` } as CSSProperties} />
    <div className="offer-content"><span className="offer-from">{mine ? 'You offer' : `${view.players.find(p => p.id === offer.fromId)?.name} offers`}</span><div className="offer-exchange"><Bundle bag={offer.give} /><ArrowRight size={18} /><Bundle bag={offer.want} /><small>{mine ? 'requested' : 'you give'}</small></div></div>
    {mine ? <button className="icon-button" aria-label="Withdraw offer" disabled={busy || view.pausedAt !== null} onClick={() => send({ type: 'cancel-trade', offerId: offer.id })}><X size={20} /></button> : <div className="offer-actions"><button className="accept-trade" aria-label="Accept trade" title={affordable ? 'Accept trade' : 'Not enough cards'} disabled={busy || !affordable || view.pausedAt !== null} onClick={() => send({ type: 'accept-trade', offerId: offer.id })}><Check size={19} /><span>Accept</span></button><button className="icon-button" aria-label="Decline trade" disabled={busy || view.pausedAt !== null} onClick={() => send({ type: 'decline-trade', offerId: offer.id })}><X size={20} /></button></div>}
  </div>;
}
export default function TradeComposer({ view, resource, busy, send, close }: { view: GameView; resource: Resource; busy: boolean; send: (a: GameAction) => void; close: () => void }) {
  const [give, setGive] = useState<ResourceBag>(() => ({ ...emptyBag(), [resource]: view.hand[resource] ? 1 : 0 }));
  const [want, setWant] = useState<ResourceBag>(() => ({ ...emptyBag(), [resource]: view.hand[resource] ? 0 : 1 }));
  const [bank, setBank] = useState(false);
  const [bankGive, setBankGive] = useState(resource);
  const [bankGet, setBankGet] = useState<Resource>(resource === 'wood' ? 'brick' : 'wood');
  const active = view.phase === 'build' && view.activePlayerId === view.selfId && view.pausedAt === null;
  const valid = resourceCount(give) > 0 && resourceCount(want) > 0 && RESOURCES.every(r => give[r] <= view.hand[r] && !(give[r] && want[r]));
  const ratio = view.tradeRates[bankGive];
  return <GameDialog title="Trade resources" close={close}><div className="segmented"><button className={!bank ? 'selected' : ''} onClick={() => setBank(false)}>Players</button><button className={bank ? 'selected' : ''} onClick={() => setBank(true)}>Bank & harbors</button></div>
    {bank ? <><div className="maritime-rate"><ResourceIcon resource={bankGive} size={35} /><strong>{ratio}:1</strong><ArrowRight size={24} /><ResourceIcon resource={bankGet} size={35} /></div><div className="maritime-fields"><label>Give<select value={bankGive} onChange={e => setBankGive(e.target.value as Resource)}>{RESOURCES.map(r => <option value={r} key={r}>{RESOURCE_LABELS[r]} ({view.hand[r]}) · {view.tradeRates[r]}:1</option>)}</select></label><label>Receive<select value={bankGet} onChange={e => setBankGet(e.target.value as Resource)}>{RESOURCES.map(r => <option value={r} key={r} disabled={!view.bank[r]}>{RESOURCE_LABELS[r]}</option>)}</select></label></div><button className="button primary full" disabled={busy || !active || bankGive === bankGet || view.hand[bankGive] < ratio || !view.bank[bankGet]} onClick={() => { send({ type: 'trade', give: bankGive, receive: bankGet }); close(); }}>Exchange {ratio} for 1</button></> : <><h3>You give</h3><ResourcePicker value={give} setValue={setGive} limit={view.hand} opposite={want} prefix="Offer" /><h3>You want</h3><ResourcePicker value={want} setValue={setWant} opposite={give} prefix="Request" /><button className="button primary full" disabled={busy || !active || !valid} onClick={() => { send({ type: 'offer-trade', give, want }); close(); }}><ArrowLeftRight size={19} />Send offer</button></>}
    {!active && <p className="form-note">Offer a trade after rolling on your turn.</p>}
  </GameDialog>;
}
