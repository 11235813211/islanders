import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftRight, ArrowRight, Check, Minus, Plus, Send, X } from 'lucide-react';
import { RESOURCES, type GameAction, type GameView, type Resource, type ResourceBag, type TradeOffer } from '../../shared/types';
import { RESOURCE_LABELS, ResourceArt, ResourceIcon } from './ResourceHand';
import './Cards.css';

const empty = (): ResourceBag => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
const count = (bag: ResourceBag) => RESOURCES.reduce((sum, resource) => sum + bag[resource], 0);

function TradeDialog({ title, children, close, className = '' }: { title: string; children: ReactNode; close: () => void; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return createPortal(<dialog className={`trade-dialog ${className}`} ref={dialog} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="trade-dialog-content"><header><h2>{title}</h2><button type="button" className="trade-icon-button" aria-label="Close trade dialog" onClick={close}><X size={22} /></button></header>{children}</div>
  </dialog>, document.body);
}

function Bundle({ bag, label }: { bag: ResourceBag; label: string }) {
  return <div className="trade-bundle"><span className="trade-bundle-label">{label}</span><div className="trade-bundle-items">{RESOURCES.filter(resource => bag[resource] > 0).map(resource => <span className={`trade-resource-chip cards-${resource}`} key={resource} title={`${bag[resource]} ${RESOURCE_LABELS[resource]}`}><ResourceIcon resource={resource} size={22} /><strong>{bag[resource]}</strong><span>{RESOURCE_LABELS[resource]}</span></span>)}</div></div>;
}

function OfferSummary({ offer, recipient }: { offer: TradeOffer; recipient: boolean }) {
  return <div className="trade-offer-summary"><Bundle label={recipient ? 'You receive' : 'You offer'} bag={offer.give} /><ArrowLeftRight className="trade-summary-arrow" size={23} /><Bundle label={recipient ? 'You give' : 'You request'} bag={offer.want} /></div>;
}

function QuantityPicker({ label, value, opposite, limit, setValue, prefix }: { label: string; value: ResourceBag; opposite: ResourceBag; limit?: ResourceBag; setValue: (bag: ResourceBag) => void; prefix: string }) {
  return <fieldset className="trade-quantity-picker"><legend>{label}</legend><div className="trade-quantity-grid">{RESOURCES.map(resource => <div className={`trade-quantity-card cards-${resource} ${value[resource] ? 'trade-quantity-selected' : ''}`} key={resource}>
    <div className="trade-quantity-art"><ResourceArt resource={resource} /></div>
    <span>{RESOURCE_LABELS[resource]}</span>
    <div className="trade-stepper"><button type="button" aria-label={`${prefix} one fewer ${RESOURCE_LABELS[resource]}`} disabled={value[resource] === 0} onClick={() => setValue({ ...value, [resource]: value[resource] - 1 })}><Minus size={17} /></button><output aria-label={`${prefix} ${RESOURCE_LABELS[resource]} quantity`}>{value[resource]}</output><button type="button" aria-label={`${prefix} one more ${RESOURCE_LABELS[resource]}`} disabled={opposite[resource] > 0 || value[resource] >= (limit?.[resource] ?? 19)} onClick={() => setValue({ ...value, [resource]: value[resource] + 1 })}><Plus size={17} /></button></div>
    {limit && <small>{limit[resource]} in hand</small>}
  </div>)}</div></fieldset>;
}

export default function TradePanel({ view, disabled, send }: { view: GameView; disabled: boolean; send: (action: GameAction) => void }) {
  const [tab, setTab] = useState<'players' | 'bank'>('players');
  const [compose, setCompose] = useState(false);
  const [incoming, setIncoming] = useState(false);
  const [give, setGive] = useState<ResourceBag>(empty);
  const [want, setWant] = useState<ResourceBag>(empty);
  const [bankGive, setBankGive] = useState<Resource>('wood');
  const [bankGet, setBankGet] = useState<Resource>('brick');
  const openedOffers = useRef(new Set<string>());
  const offer = view.tradeOffer;
  const isActive = view.selfId === view.activePlayerId && view.phase === 'build';
  const recipient = !!offer && offer.fromId !== view.selfId;
  const declined = !!offer?.declinedBy.includes(view.selfId);
  const affordable = !!offer && RESOURCES.every(resource => view.hand[resource] >= offer.want[resource]);
  const validComposition = count(give) > 0 && count(want) > 0 && RESOURCES.every(resource => give[resource] <= view.hand[resource] && !(give[resource] && want[resource]));
  const offerer = view.players.find(player => player.id === offer?.fromId);

  useEffect(() => {
    if (!offer || !recipient || declined || view.phase !== 'build') { setIncoming(false); return; }
    const key = `${offer.id}:${view.selfId}`;
    if (!openedOffers.current.has(key)) {
      openedOffers.current.add(key);
      setIncoming(true);
      setTab('players');
    }
  }, [offer?.id, recipient, declined, view.selfId, view.phase]);

  useEffect(() => {
    if (!isActive) setCompose(false);
  }, [isActive]);

  function respond(type: 'accept-trade' | 'decline-trade') {
    if (!offer || disabled) return;
    send({ type, offerId: offer.id });
    if (type === 'decline-trade') setIncoming(false);
  }

  return <section className="trade-panel" aria-label="Trading">
    <div className="trade-panel-heading"><h2><ArrowLeftRight size={20} /> Trade</h2><span>Negotiate or exchange</span></div>
    <div className="trade-tabs" role="tablist" aria-label="Trade partner"><button type="button" role="tab" aria-selected={tab === 'players'} onClick={() => setTab('players')}>Players{offer && <span className="trade-notification-dot" />}</button><button type="button" role="tab" aria-selected={tab === 'bank'} onClick={() => setTab('bank')}>Bank <small>4:1</small></button></div>
    {tab === 'players' ? <div className="trade-player-content">
      {offer ? <div className="trade-live-offer"><div className="trade-offer-heading"><span className="trade-live-indicator" /><strong>{recipient ? `${offerer?.name ?? 'A player'} offers a trade` : 'Your offer is open'}</strong></div><OfferSummary offer={offer} recipient={recipient} />
        {recipient ? declined ? <div className="trade-response-note"><X size={17} /> You declined this offer.</div> : <div className="trade-response-actions"><button type="button" className="trade-decline" disabled={disabled} onClick={() => respond('decline-trade')}>Decline</button><button type="button" className="trade-accept" disabled={disabled || !affordable} onClick={() => respond('accept-trade')}><Check size={18} /> Accept</button>{!affordable && <p>You don’t have the requested cards.</p>}</div> : <><p className="trade-status-text">{offer.declinedBy.length ? `${offer.declinedBy.length} player${offer.declinedBy.length === 1 ? '' : 's'} declined.` : 'Waiting for another player to accept.'}</p><button type="button" className="trade-cancel" disabled={disabled} onClick={() => send({ type: 'cancel-trade', offerId: offer.id })}>Withdraw offer</button></>}
      </div> : <><p className="trade-empty-message">Offer cards from your hand and ask for what you need.</p><button type="button" className="trade-propose" disabled={disabled || !isActive || count(view.hand) === 0} onClick={() => { setGive(empty()); setWant(empty()); setCompose(true); }}><Plus size={20} /> Propose a trade</button>{!isActive && <p className="trade-status-text">New offers open after you roll on your turn.</p>}</>}
    </div> : <div className="trade-bank-content"><div className="trade-bank-visual" aria-hidden="true"><div className={`trade-mini-stack cards-${bankGive}`}>{[0, 1, 2, 3].map(index => <div key={index} style={{ transform: `translate(${index * 6 - 9}px, ${index * -2}px) rotate(${index * 5 - 8}deg)` }}><ResourceIcon resource={bankGive} size={26} /></div>)}<strong>4</strong></div><ArrowRight size={24} /><div className={`trade-mini-single cards-${bankGet}`}><ResourceIcon resource={bankGet} size={29} /><strong>1</strong></div></div><div className="trade-bank-fields"><label>You give<select value={bankGive} onChange={event => setBankGive(event.target.value as Resource)}>{RESOURCES.map(resource => <option key={resource} value={resource}>{RESOURCE_LABELS[resource]} ({view.hand[resource]})</option>)}</select></label><label>You receive<select value={bankGet} onChange={event => setBankGet(event.target.value as Resource)}>{RESOURCES.map(resource => <option key={resource} value={resource} disabled={!view.bank[resource]}>{RESOURCE_LABELS[resource]}{view.bank[resource] ? '' : ' · empty'}</option>)}</select></label></div><button type="button" className="trade-propose" disabled={disabled || !isActive || bankGive === bankGet || view.hand[bankGive] < 4 || !view.bank[bankGet]} onClick={() => send({ type: 'trade', give: bankGive, receive: bankGet })}><ArrowLeftRight size={19} /> Exchange with bank</button></div>}

    {compose && <TradeDialog title="Make an offer" close={() => setCompose(false)} className="trade-compose-dialog"><p className="trade-dialog-description">Choose the cards you’ll give and the cards you want. Any other player can accept.</p><QuantityPicker label="You give" prefix="Offer" value={give} opposite={want} limit={view.hand} setValue={setGive} /><QuantityPicker label="You want" prefix="Request" value={want} opposite={give} setValue={setWant} /><div className="trade-compose-footer"><span>{count(give)} offered <ArrowLeftRight size={16} /> {count(want)} requested</span><button type="button" className="trade-propose" disabled={disabled || !validComposition || !isActive} onClick={() => { send({ type: 'offer-trade', give, want }); setCompose(false); }}><Send size={19} /> Send offer</button></div></TradeDialog>}
    {incoming && offer && recipient && !declined && <TradeDialog title={`${offerer?.name ?? 'A player'} wants to trade`} close={() => setIncoming(false)} className="trade-incoming-dialog"><div className="trade-incoming-emblem"><ArrowLeftRight size={30} /></div><OfferSummary offer={offer} recipient /><p className="trade-dialog-description">{affordable ? 'Accept to exchange these cards immediately.' : 'You don’t have all the requested cards.'}</p><div className="trade-response-actions"><button type="button" className="trade-decline" disabled={disabled} onClick={() => respond('decline-trade')}>Decline</button><button type="button" className="trade-accept" disabled={disabled || !affordable} onClick={() => respond('accept-trade')}><Check size={20} /> Accept trade</button></div><button type="button" className="trade-later" onClick={() => setIncoming(false)}>Review later</button></TradeDialog>}
  </section>;
}
