import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ArrowRight, Check, Landmark, Minus, Plus, Users, X } from 'lucide-react';
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
export interface TradeDraft { give: ResourceBag; want: ResourceBag; bank: boolean }
export function addTradeResource(draft: TradeDraft | null, resource: Resource, view: GameView): TradeDraft {
  const next = draft ?? { give: emptyBag(), want: emptyBag(), bank: false };
  return { ...next,
    give: next.bank ? { ...emptyBag(), [resource]: view.tradeRates[resource] } : { ...next.give, [resource]: Math.min(view.hand[resource], next.give[resource]+1) },
    want: { ...next.want, [resource]: 0 },
  };
}
export default function TradeComposer({ view, draft, setDraft, busy, send, close }: { view: GameView; draft: TradeDraft; setDraft: (draft: TradeDraft) => void; busy: boolean; send: (a: GameAction) => void; close: () => void }) {
  const {give,want,bank}=draft;
  const active=view.phase==='build' && view.activePlayerId===view.selfId && view.pausedAt===null;
  const giveResource=RESOURCES.find(r=>give[r]>0), getResource=RESOURCES.find(r=>want[r]>0);
  const valid=resourceCount(give)>0 && resourceCount(want)>0 && RESOURCES.every(r=>give[r]<=view.hand[r] && !(give[r] && want[r]));
  const bankValid=valid && !!giveResource && !!getResource && give[giveResource]===view.tradeRates[giveResource] && view.bank[getResource];
  function choosePartner(bank: boolean) {
    setDraft({bank,
      give: bank ? {...emptyBag(),...(giveResource ? {[giveResource]:view.tradeRates[giveResource]} : {})} : give,
      want: bank ? {...emptyBag(),...(getResource ? {[getResource]:1} : {})} : want,
    });
  }
  return <section className="trade-composer" role="dialog" aria-label="Trade resources" onKeyDown={event=>{if(event.key==='Escape') close();}}>
    <header><strong>Trade</strong><div className="trade-partners"><button aria-pressed={!bank} onClick={()=>choosePartner(false)}><Users size={17} />Players</button><button aria-pressed={bank} onClick={()=>choosePartner(true)}><Landmark size={17} />Bank</button></div><button className="icon-button" aria-label="Close trade" onClick={close}><X size={18} /></button></header>
    <div className="trade-palette" aria-label="Choose resources to receive">{RESOURCES.map(r=><button className={`trade-card cards-${r}`} key={r} aria-label={`Request one more ${RESOURCE_LABELS[r]}`} title={`Receive ${RESOURCE_LABELS[r]}`} disabled={busy || (bank && !view.bank[r]) || want[r]>=19} onClick={()=>setDraft({...draft,want:bank?{...emptyBag(),[r]:1}:{...want,[r]:want[r]+1},give:{...give,[r]:0}})}><ResourceIcon resource={r} size={28} /><span>{RESOURCE_LABELS[r]}</span></button>)}</div>
    {(['want','give'] as const).map(row=><div className={`trade-selection ${row}`} key={row} aria-label={row==='want'?'You receive':'You give'}><span className="trade-direction">{row==='want'?<ArrowDown size={25}/>:<ArrowUp size={25}/>}<small>{row==='want'?'Receive':'Give'}</small></span><div className="trade-selected-cards">{RESOURCES.filter(r=>draft[row][r]>0).map(r=><button key={r} className={`trade-card cards-${r}`} aria-label={`Remove one ${RESOURCE_LABELS[r]} from ${row==='want'?'receive':'give'}`} onClick={()=>setDraft({...draft,[row]:{...draft[row],[r]:bank?0:draft[row][r]-1}})}><ResourceIcon resource={r} size={26}/><strong>{draft[row][r]}</strong></button>)}{!resourceCount(draft[row]) && <span className="trade-hint">{row==='want'?'Choose cards above':'Click cards in your hand'}</span>}</div></div>)}
    <footer><span>{!active?'Trade after rolling on your turn':bank ? giveResource ? `${view.tradeRates[giveResource]}:1 · bank / harbor`:'Select a card to give' : 'Offer to all players'}</span><button className="button primary" disabled={busy || !active || !(bank?bankValid:valid)} onClick={()=>{send(bank?{type:'trade',give:giveResource!,receive:getResource!}:{type:'offer-trade',give,want});close();}}><Check size={18}/>{bank?'Exchange':'Send offer'}</button></footer>
  </section>;
}
