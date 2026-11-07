import { ArrowDown, ArrowRight, ArrowUp, Check, Landmark, Repeat2, Users, X } from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { playerVars } from '../../shared/colors';
import { emptyBag, resourceCount } from '../../shared/engine';
import {
  type GameAction,
  type GameView,
  RESOURCES,
  type Resource,
  type ResourceBag,
  type TradeOffer,
} from '../../shared/types';
import { ResourceIcon } from '../art';
import { cardStyle, RESOURCE_LABELS } from './ResourceHand';

export function GameDialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="modal game-dialog"
      aria-label={title}
      onCancel={e => {
        e.preventDefault();
        close();
      }}
      onClick={e => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-body">
        <div className="section-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close dialog" onClick={close}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>,
    document.body,
  );
}
export function Bundle({ bag }: { bag: ResourceBag }) {
  return (
    <span className="trade-bundle">
      {RESOURCES.filter(r => bag[r] > 0).map(r => (
        <span
          className="trade-chip"
          style={cardStyle(r)}
          key={r}
          aria-label={`${bag[r]} ${RESOURCE_LABELS[r]}`}
          title={`${bag[r]} ${RESOURCE_LABELS[r]}`}
        >
          <ResourceIcon resource={r} size={22} />
          <strong>{bag[r]}</strong>
        </span>
      ))}
    </span>
  );
}
/** An open offer, as seen by its author or by a player it was sent to. */
export function TradeNotice({
  view,
  busy,
  now,
  send,
  counter,
}: {
  view: GameView;
  busy: boolean;
  now: number;
  send: (a: GameAction) => void;
  counter: (offer: TradeOffer) => void;
}) {
  const offer = view.tradeOffer;
  if (!offer || view.role === 'spectator') return null;
  const mine = offer.fromId === view.selfId;
  if (!mine && (!offer.to.includes(view.selfId) || offer.declinedBy.includes(view.selfId))) return null;
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? 'Someone';
  const myCounter = offer.counters.find(c => c.fromId === view.selfId);
  const affordable = RESOURCES.every(r => view.hand[r] >= offer.want[r]);
  const clock = view.pausedAt ?? now;
  const progress = Math.max(0, Math.min(1, (offer.expiresAt - clock) / (offer.expiresAt - offer.createdAt)));
  if (!progress) return null;
  const paused = view.pausedAt !== null;
  const everyone = offer.to.length === view.players.length - 1;
  return (
    <div className="trade-notice" role="region" aria-label="Trade offer">
      <span
        className="offer-pie"
        role="img"
        aria-label="Offer time remaining"
        style={{ '--progress': `${progress * 360}deg` } as CSSProperties}
      />
      <div className="offer-content">
        <span className="offer-from">
          {mine ? `You offer${everyone ? '' : ` ${offer.to.map(name).join(', ')}`}` : `${name(offer.fromId)} offers`}
        </span>
        <div className="offer-exchange">
          <Bundle bag={offer.give} />
          <ArrowRight size={18} />
          <Bundle bag={offer.want} />
          <small>{mine ? 'requested' : 'you give'}</small>
        </div>
        {mine &&
          offer.counters.map(c => (
            <div className="offer-counter" key={c.id}>
              <span className="offer-from">{name(c.fromId)} counters</span>
              <div className="offer-exchange">
                <Bundle bag={c.give} />
                <ArrowRight size={18} />
                <Bundle bag={c.want} />
                <button
                  className="accept-trade"
                  aria-label={`Accept ${name(c.fromId)}'s counter-offer`}
                  disabled={busy || paused}
                  onClick={() => send({ type: 'accept-counter', offerId: offer.id, counterId: c.id })}
                >
                  <Check size={17} />
                  <span>Accept</span>
                </button>
              </div>
            </div>
          ))}
        {myCounter && <span className="offer-from">You countered. Waiting for an answer.</span>}
      </div>
      {mine ? (
        <button
          className="icon-button"
          aria-label="Withdraw offer"
          disabled={busy || paused}
          onClick={() => send({ type: 'cancel-trade', offerId: offer.id })}
        >
          <X size={20} />
        </button>
      ) : (
        <div className="offer-actions">
          {!myCounter && (
            <>
              <button
                className="accept-trade"
                aria-label="Accept trade"
                title={affordable ? 'Accept trade' : 'Not enough cards'}
                disabled={busy || !affordable || paused}
                onClick={() => send({ type: 'accept-trade', offerId: offer.id })}
              >
                <Check size={19} />
                <span>Accept</span>
              </button>
              <button
                className="icon-button"
                aria-label="Counter-offer"
                title="Propose different terms"
                disabled={busy || paused}
                onClick={() => counter(offer)}
              >
                <Repeat2 size={19} />
              </button>
            </>
          )}
          <button
            className="icon-button"
            aria-label="Decline trade"
            disabled={busy || paused}
            onClick={() => send({ type: 'decline-trade', offerId: offer.id })}
          >
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

export interface TradeDraft {
  give: ResourceBag;
  want: ResourceBag;
  bank: boolean;
  /** Recipients of a player offer; null means everyone. */
  to: string[] | null;
  /** Set when this draft is a counter to another player's offer. */
  counterOf: string | null;
}

export function addTradeResource(draft: TradeDraft | null, resource: Resource, view: GameView): TradeDraft {
  const next = draft ?? { give: emptyBag(), want: emptyBag(), bank: false, to: null, counterOf: null };
  return {
    ...next,
    give: next.bank
      ? { ...emptyBag(), [resource]: view.tradeRates[resource] }
      : { ...next.give, [resource]: Math.min(view.hand[resource], next.give[resource] + 1) },
    want: { ...next.want, [resource]: 0 },
  };
}

/** A counter starts from the offer reversed: give what they asked for, ask for what they offered. */
export function counterDraft(offer: TradeOffer): TradeDraft {
  return { give: { ...offer.want }, want: { ...offer.give }, bank: false, to: null, counterOf: offer.id };
}

export default function TradeComposer({
  view,
  draft,
  setDraft,
  busy,
  send,
  close,
}: {
  view: GameView;
  draft: TradeDraft;
  setDraft: (draft: TradeDraft) => void;
  busy: boolean;
  send: (a: GameAction) => void;
  close: () => void;
}) {
  const { give, want, bank, counterOf } = draft;
  const offer = view.tradeOffer;
  const countering = !!counterOf;
  const active = countering
    ? offer?.id === counterOf && view.phase === 'build' && view.pausedAt === null
    : view.phase === 'build' && view.activePlayerId === view.selfId && view.pausedAt === null;
  const giveResource = RESOURCES.find(r => give[r] > 0);
  const getResource = RESOURCES.find(r => want[r] > 0);
  const valid =
    resourceCount(give) > 0 &&
    resourceCount(want) > 0 &&
    RESOURCES.every(r => give[r] <= view.hand[r] && !(give[r] && want[r]));
  const bankValid =
    valid &&
    !!giveResource &&
    !!getResource &&
    give[giveResource] === view.tradeRates[giveResource] &&
    view.bank[getResource];
  const others = view.players.filter(p => p.id !== view.selfId);
  const recipients = draft.to ?? others.map(p => p.id);
  function choosePartner(bank: boolean) {
    setDraft({
      ...draft,
      bank,
      give: bank ? { ...emptyBag(), ...(giveResource ? { [giveResource]: view.tradeRates[giveResource] } : {}) } : give,
      want: bank ? { ...emptyBag(), ...(getResource ? { [getResource]: 1 } : {}) } : want,
    });
  }
  function toggleRecipient(id: string) {
    const next = recipients.includes(id) ? recipients.filter(r => r !== id) : [...recipients, id];
    setDraft({ ...draft, to: next.length === others.length ? null : next });
  }
  function submit() {
    if (countering) send({ type: 'counter-trade', offerId: counterOf!, give, want });
    else if (bank) send({ type: 'trade', give: giveResource!, receive: getResource! });
    else send({ type: 'offer-trade', give, want, ...(draft.to ? { to: draft.to } : {}) });
    close();
  }
  const status = !active
    ? countering
      ? 'This offer has closed'
      : 'Trade after rolling on your turn'
    : countering
      ? `Counter to ${view.players.find(p => p.id === offer?.fromId)?.name ?? 'the offer'}`
      : bank
        ? giveResource
          ? `${view.tradeRates[giveResource]}:1 · bank / harbor`
          : 'Select a card to give'
        : draft.to
          ? `Offer to ${recipients.length} of ${others.length}`
          : 'Offer to all players';
  return (
    <section
      className="trade-composer"
      role="dialog"
      aria-label="Trade resources"
      onKeyDown={event => {
        if (event.key === 'Escape') close();
      }}
    >
      <header>
        <strong>{countering ? 'Counter-offer' : 'Trade'}</strong>
        {!countering && (
          <div className="trade-partners">
            <button aria-pressed={!bank} onClick={() => choosePartner(false)}>
              <Users size={17} />
              Players
            </button>
            <button aria-pressed={bank} onClick={() => choosePartner(true)}>
              <Landmark size={17} />
              Bank
            </button>
          </div>
        )}
        <button className="icon-button" aria-label="Close trade" onClick={close}>
          <X size={18} />
        </button>
      </header>
      {!bank && !countering && others.length > 1 && (
        <div className="trade-recipients" role="group" aria-label="Send offer to">
          {others.map(p => (
            <button
              key={p.id}
              aria-pressed={recipients.includes(p.id)}
              aria-label={`Offer to ${p.name}`}
              style={playerVars(p.color) as CSSProperties}
              onClick={() => toggleRecipient(p.id)}
            >
              <span className="recipient-swatch" />
              {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="trade-palette" role="group" aria-label="Choose resources to receive">
        {RESOURCES.map(r => (
          <button
            className="trade-card"
            style={cardStyle(r)}
            key={r}
            aria-label={`Request one more ${RESOURCE_LABELS[r]}`}
            title={`Receive ${RESOURCE_LABELS[r]}`}
            disabled={busy || (bank && !view.bank[r]) || want[r] >= 19}
            onClick={() =>
              setDraft({
                ...draft,
                want: bank ? { ...emptyBag(), [r]: 1 } : { ...want, [r]: want[r] + 1 },
                give: { ...give, [r]: 0 },
              })
            }
          >
            <ResourceIcon resource={r} size={28} />
            <span>{RESOURCE_LABELS[r]}</span>
          </button>
        ))}
      </div>
      {(['want', 'give'] as const).map(row => (
        <div
          className={`trade-selection ${row}`}
          key={row}
          role="group"
          aria-label={row === 'want' ? 'You receive' : 'You give'}
        >
          <span className="trade-direction">
            {row === 'want' ? <ArrowDown size={25} /> : <ArrowUp size={25} />}
            <small>{row === 'want' ? 'Receive' : 'Give'}</small>
          </span>
          <div className="trade-selected-cards">
            {RESOURCES.filter(r => draft[row][r] > 0).map(r => (
              <button
                key={r}
                className="trade-card"
                style={cardStyle(r)}
                aria-label={`Remove one ${RESOURCE_LABELS[r]} from ${row === 'want' ? 'receive' : 'give'}`}
                onClick={() => setDraft({ ...draft, [row]: { ...draft[row], [r]: bank ? 0 : draft[row][r] - 1 } })}
              >
                <ResourceIcon resource={r} size={26} />
                <strong>{draft[row][r]}</strong>
              </button>
            ))}
            {!resourceCount(draft[row]) && (
              <span className="trade-hint">{row === 'want' ? 'Choose cards above' : 'Tap cards in your hand'}</span>
            )}
          </div>
        </div>
      ))}
      <footer>
        <span>{status}</span>
        <button
          className="button primary"
          disabled={busy || !active || !(bank && !countering ? bankValid : valid) || (!bank && !recipients.length)}
          onClick={submit}
        >
          <Check size={18} />
          {countering ? 'Send counter' : bank ? 'Exchange' : 'Send offer'}
        </button>
      </footer>
    </section>
  );
}
