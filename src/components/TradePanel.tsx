import { ArrowDown, ArrowUp, Check, Landmark, Users, X } from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { playerVars } from '../../shared/colors';
import { emptyBag } from '../../shared/engine';
import { bankTradeSize } from '../../shared/rules';
import {
  type GameAction,
  type GameView,
  RESOURCES,
  type Resource,
  type ResourceBag,
  type Tradable,
  type TradeBag,
  type TradeOffer,
} from '../../shared/types';
import { Palette } from './game/CornerPanels';
import {
  bagHas,
  bagTotal,
  held,
  TradableIcon,
  tradableLabel,
  tradableStyle,
  tradablesFor,
  withItem,
} from './game/tradables';

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
export interface TradeDraft {
  give: TradeBag;
  want: TradeBag;
  /** Recipients of a player offer; null means everyone. */
  to: string[] | null;
  /** Set when this draft is a counter to another player's offer. */
  counterOf: string | null;
}

/** A card (or discovery) tapped in your hand goes into what you give. */
export function addTradeResource(draft: TradeDraft | null, item: Tradable, view: GameView): TradeDraft {
  const next = draft ?? { give: emptyBag(), want: emptyBag(), to: null, counterOf: null };
  if (!tradablesFor(view, 'trade').includes(item)) return next;
  const give = bagHas(next.give, item) < held(view, item) ? withItem(next.give, item, 1) : next.give;
  return { ...next, give, want: { ...next.want, [item]: 0 } };
}

/** A counter starts from the offer reversed: give what they asked for, ask for what they offered. */
export function counterDraft(offer: TradeOffer): TradeDraft {
  return { give: { ...offer.want }, want: { ...offer.give }, to: null, counterOf: offer.id };
}

/** A draft's cards as a plain resource bag (discoveries left out). */
const cardsOf = (bag: TradeBag): ResourceBag => ({
  ...emptyBag(),
  ...Object.fromEntries(RESOURCES.map(r => [r, bag[r]])),
});

/**
 * The bank trade this draft describes, if it is one: each kind given in a multiple of its harbor
 * rate, one card per multiple, mixing rates if need be (see bankTradeSize), from cards you hold
 * and that the bank still has.
 */
export function bankTrade(draft: TradeDraft, view: GameView): { give: ResourceBag; receive: ResourceBag } | null {
  if (draft.give.discovery || draft.want.discovery) return null;
  const give = cardsOf(draft.give);
  const receive = cardsOf(draft.want);
  if (bankTradeSize(give, receive, view.tradeRates) === null) return null;
  const enough = (r: Resource) => !receive[r] || (view.bankCounts ? view.bankCounts[r] >= receive[r] : view.bank[r]);
  if (!RESOURCES.every(r => give[r] <= view.hand[r] && enough(r))) return null;
  return { give, receive };
}

/** "2:1" or "2:1 + 3:1": the rates a bank trade uses. */
function ratesUsed(give: ResourceBag, view: GameView): string {
  const rates = [...new Set(RESOURCES.filter(r => give[r] > 0).map(r => view.tradeRates[r]))].sort();
  return rates.map(rate => `${rate}:1`).join(' + ');
}

const ALL: Tradable[] = [...RESOURCES, 'discovery'];

/**
 * The trade panel: tap cards in your hand to give, cards here to receive, then send it to players
 * (all, or the ones picked) or, when it matches your harbor rate, trade it with the bank.
 */
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
  const { give, want, counterOf } = draft;
  const offer = view.tradeOffer;
  const countering = !!counterOf;
  const active = countering
    ? offer?.id === counterOf && view.phase === 'build' && view.pausedAt === null
    : view.phase === 'build' && view.activePlayerId === view.selfId && view.pausedAt === null;
  const valid =
    bagTotal(give) > 0 &&
    bagTotal(want) > 0 &&
    ALL.every(r => bagHas(give, r) <= held(view, r) && !(bagHas(give, r) && bagHas(want, r)));
  const bank = countering ? null : bankTrade(draft, view);
  const others = view.players.filter(p => p.id !== view.selfId);
  const recipients = draft.to ?? others.map(p => p.id);
  function toggleRecipient(id: string) {
    const next = recipients.includes(id) ? recipients.filter(r => r !== id) : [...recipients, id];
    setDraft({ ...draft, to: next.length === others.length ? null : next });
  }
  function offerToPlayers() {
    if (countering) send({ type: 'counter-trade', offerId: counterOf!, give, want });
    else send({ type: 'offer-trade', give, want, ...(draft.to ? { to: draft.to } : {}) });
    close();
  }
  function tradeWithBank() {
    if (!bank) return;
    send({ type: 'bank-trade', give: bank.give, receive: bank.receive });
    close();
  }
  const status = !active
    ? countering
      ? 'This offer has closed'
      : 'Trade after rolling on your turn'
    : countering
      ? `Counter to ${view.players.find(p => p.id === offer?.fromId)?.name ?? 'the offer'}`
      : bank
        ? `Bank: ${ratesUsed(bank.give, view)}`
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
        <button className="icon-button" aria-label="Close trade" onClick={close}>
          <X size={18} />
        </button>
      </header>
      {!countering && others.length > 1 && (
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
      <Palette
        items={tradablesFor(view, 'trade')}
        label="Choose resources to receive"
        name={r => `Request one more ${tradableLabel(r)}`}
        disabled={r => busy || bagHas(want, r) >= 19}
        count={r => (r === 'discovery' ? null : (view.bankCounts?.[r] ?? null))}
        pick={r => setDraft({ ...draft, want: withItem(want, r, 1), give: { ...give, [r]: 0 } })}
      />
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
            {ALL.filter(r => bagHas(draft[row], r) > 0).map(r => (
              <button
                key={r}
                className="trade-card"
                style={tradableStyle(r)}
                aria-label={`Remove one ${tradableLabel(r)} from ${row === 'want' ? 'receive' : 'give'}`}
                onClick={() => setDraft({ ...draft, [row]: withItem(draft[row], r, -1) })}
              >
                <TradableIcon item={r} size={26} />
                <strong>{bagHas(draft[row], r)}</strong>
              </button>
            ))}
            {!bagTotal(draft[row]) && (
              <span className="trade-hint">{row === 'want' ? 'Choose cards above' : 'Tap cards in your hand'}</span>
            )}
          </div>
        </div>
      ))}
      <footer>
        <span>{status}</span>
        {!countering && (
          <button
            className="button secondary"
            disabled={busy || !active || !bank}
            data-tip={
              bank
                ? `Trade with the bank at ${ratesUsed(bank.give, view)}`
                : 'Give each kind in a multiple of its rate (4:1, 3:1, or 2:1), one card for each'
            }
            onClick={tradeWithBank}
          >
            <Landmark size={17} />
            Bank
          </button>
        )}
        <button
          className="button primary tip-end"
          disabled={busy || !active || !valid || (!countering && !recipients.length)}
          aria-label={countering ? 'Send counter' : 'Offer to players'}
          data-tip={countering ? 'Send these terms back' : 'Offer this trade to the chosen players'}
          onClick={offerToPlayers}
        >
          {countering ? <Check size={18} /> : <Users size={17} />}
          {countering ? 'Send counter' : 'Players'}
        </button>
      </footer>
    </section>
  );
}
