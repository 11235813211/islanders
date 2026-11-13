// Panels that open in the board's corner, like the trade panel: discarding on a 7, choosing
// gold, Year of Plenty, and Monopoly. Each picks resources by tapping cards, then confirms with one button.
import { ArrowDown, ArrowUp, Check, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { emptyBag, resourceCount } from '../../../shared/engine';
import {
  type GameAction,
  type GameView,
  RESOURCES,
  type Resource,
  type Tradable,
  type TradeBag,
} from '../../../shared/types';
import { blockedReason, cardToPlay } from './DevelopmentHand';
import {
  bagHas,
  bagTotal,
  held,
  resourcesIn,
  TradableIcon,
  tradableLabel,
  tradableStyle,
  tradablesFor,
  withItem,
} from './tradables';

/** Header, body and footer shared by every corner panel (and the discovery purchase panel). */
export function Panel({
  title,
  close,
  status,
  action,
  children,
}: {
  title: string;
  close?: () => void;
  status: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="trade-composer"
      role="dialog"
      aria-label={title}
      onKeyDown={event => {
        if (event.key === 'Escape') close?.();
      }}
    >
      <header>
        <strong>{title}</strong>
        {close && (
          <button className="icon-button" aria-label={`Close ${title}`} onClick={close}>
            <X size={18} />
          </button>
        )}
      </header>
      {children}
      <footer>
        <span>{status}</span>
        {action}
      </footer>
    </section>
  );
}

const ALL: Tradable[] = [...RESOURCES, 'discovery'];

/** A row of chosen cards; tapping one takes it back out. */
function Chosen({
  bag,
  label,
  direction,
  hint,
  remove,
}: {
  bag: TradeBag;
  label: string;
  direction: 'in' | 'out';
  hint: string;
  remove: (item: Tradable) => void;
}) {
  return (
    <div className={`trade-selection ${direction === 'in' ? 'want' : 'give'}`} role="group" aria-label={label}>
      <span className="trade-direction">
        {direction === 'in' ? <ArrowDown size={25} /> : <ArrowUp size={25} />}
        <small>{label}</small>
      </span>
      <div className="trade-selected-cards">
        {ALL.filter(r => bagHas(bag, r) > 0).map(r => (
          <button
            key={r}
            className="trade-card"
            style={tradableStyle(r)}
            aria-label={`Put back one ${tradableLabel(r)}`}
            onClick={() => remove(r)}
          >
            <TradableIcon item={r} size={26} />
            <strong>{bagHas(bag, r)}</strong>
          </button>
        ))}
        {!bagTotal(bag) && <span className="trade-hint">{hint}</span>}
      </div>
    </div>
  );
}

/** One button per item (resources, and discoveries where allowed), as in the trade panel's "receive" row. */
export function Palette({
  items,
  label,
  name,
  disabled,
  pressed,
  count,
  pick,
}: {
  items: Tradable[];
  label: string;
  name: (item: Tradable) => string;
  disabled: (item: Tradable) => boolean;
  pressed?: (item: Tradable) => boolean;
  /** A small number on each card, such as how many the bank has left. */
  count?: (item: Tradable) => number | null;
  pick: (item: Tradable) => void;
}) {
  return (
    <div className="trade-palette" role="group" aria-label={label}>
      {items.map(r => (
        <button
          className="trade-card"
          style={tradableStyle(r)}
          key={r}
          aria-label={name(r)}
          aria-pressed={pressed?.(r)}
          disabled={disabled(r)}
          onClick={() => pick(r)}
        >
          <TradableIcon item={r} size={28} />
          <span>{tradableLabel(r)}</span>
          {count?.(r) != null && <strong className="bank-badge">{count(r)}</strong>}
        </button>
      ))}
    </div>
  );
}

const without = (bag: TradeBag, r: Tradable): TradeBag => withItem(bag, r, -1);

/** Add one card (or discovery, where it counts) from your hand to a discard, within what you hold and owe. */
export function addDiscard(bag: TradeBag, item: Tradable, view: GameView): TradeBag {
  const owed = view.pendingDiscards[view.selfId] ?? 0;
  if (!tradablesFor(view, 'discard').includes(item)) return bag;
  if (bagHas(bag, item) >= held(view, item) || bagTotal(bag) >= owed) return bag;
  return withItem(bag, item, 1);
}

/** On a 7: tap cards in your hand to set them aside, tap them here to keep them. */
export function DiscardPanel({
  view,
  bag,
  setBag,
  busy,
  send,
}: {
  view: GameView;
  bag: TradeBag;
  setBag: (bag: TradeBag) => void;
  busy: boolean;
  send: (a: GameAction) => void;
}) {
  const owed = view.pendingDiscards[view.selfId] ?? 0;
  const count = bagTotal(bag);
  return (
    <Panel
      title="Discard resources"
      status={`${count} / ${owed} chosen`}
      action={
        <button
          className="button primary"
          disabled={busy || count !== owed}
          onClick={() => send({ type: 'discard', resources: bag })}
        >
          <Check size={18} />
          Discard {owed}
        </button>
      }
    >
      <Chosen
        bag={bag}
        label="Discard"
        direction="out"
        hint={`Tap ${owed} cards in your hand`}
        remove={r => setBag(without(bag, r))}
      />
    </Panel>
  );
}

/** Year of Plenty: pick up to two cards the bank still has. */
export function PlentyPanel({
  view,
  busy,
  send,
  close,
}: {
  view: GameView;
  busy: boolean;
  send: (a: GameAction) => void;
  close: () => void;
}) {
  const [bag, setBag] = useState<TradeBag>(emptyBag);
  const picked = bagTotal(bag);
  const reason = blockedReason(view, 'year-of-plenty');
  return (
    <Panel
      title="Year of Plenty"
      close={close}
      status={reason ?? 'Take any two from the bank'}
      action={
        <button
          className="button primary"
          disabled={busy || reason !== null || picked < 1}
          onClick={() => {
            send({ type: 'play-plenty', cardId: cardToPlay(view, 'year-of-plenty'), resources: bag });
            close();
          }}
        >
          <Check size={18} />
          Take {picked === 1 ? '1 resource' : `${picked} resources`}
        </button>
      }
    >
      <Palette
        items={tradablesFor(view, 'take')}
        label="Choose resources to take"
        name={r => `Take one more ${tradableLabel(r)}`}
        disabled={r => busy || picked >= 2 || !(r === 'discovery' ? view.discoveryInSupply : view.bank[r])}
        count={r => (r === 'discovery' ? view.discoveryBank : (view.bankCounts?.[r] ?? null))}
        pick={r => setBag(withItem(bag, r, 1))}
      />
      <Chosen bag={bag} label="Take" direction="in" hint="Choose cards above" remove={r => setBag(without(bag, r))} />
    </Panel>
  );
}

/** Monopoly: name one resource; every opponent hands over all of it. */
export function MonopolyPanel({
  view,
  busy,
  send,
  close,
}: {
  view: GameView;
  busy: boolean;
  send: (a: GameAction) => void;
  close: () => void;
}) {
  const [choice, setChoice] = useState<Tradable | null>(null);
  const reason = blockedReason(view, 'monopoly');
  return (
    <Panel
      title="Monopoly"
      close={close}
      status={reason ?? 'Every opponent gives you all of it'}
      action={
        <button
          className="button primary"
          disabled={busy || reason !== null || !choice}
          onClick={() => {
            if (!choice) return;
            send({ type: 'play-monopoly', cardId: cardToPlay(view, 'monopoly'), resource: choice });
            close();
          }}
        >
          <Check size={18} />
          {choice ? `Take all ${tradableLabel(choice)}` : 'Choose a resource'}
        </button>
      }
    >
      <Palette
        items={tradablesFor(view, 'take')}
        label="Choose a resource"
        name={tradableLabel}
        disabled={() => busy}
        pressed={r => choice === r}
        pick={setChoice}
      />
    </Panel>
  );
}

/** Gold fields and volcanoes: pick the resources you are owed (everyone owed picks at once). */
export function GoldPanel({
  view,
  busy,
  send,
  secondsLeft,
}: {
  view: GameView;
  busy: boolean;
  send: (a: GameAction) => void;
  /** Seconds before an Advanced bot picks for you. */
  secondsLeft: number | null;
}) {
  const [bag, setBag] = useState(emptyBag);
  // The engine pays no more than the bank holds (exact counts are known only when the room shows them).
  const stock = view.bankCounts;
  const owed = Math.min(view.pendingGold[view.selfId] ?? 0, stock ? resourceCount(stock) : Number.POSITIVE_INFINITY);
  const picked = resourceCount(bag);
  const outOf = (r: Resource) => (stock ? bag[r] >= stock[r] : !view.bank[r]);
  return (
    <Panel
      title="Gold"
      status={`${picked} / ${owed} chosen${secondsLeft === null ? '' : ` · ${secondsLeft}s`}`}
      action={
        <button
          className="button primary"
          disabled={busy || picked !== owed}
          onClick={() => send({ type: 'choose-gold', resources: bag })}
        >
          <Check size={18} />
          Take {owed === 1 ? '1 resource' : `${owed} resources`}
        </button>
      }
    >
      <Palette
        items={resourcesIn(view)}
        label="Choose resources from gold"
        name={r => `Take one more ${tradableLabel(r)}`}
        disabled={r => busy || picked >= owed || (r !== 'discovery' && outOf(r))}
        count={r => (r === 'discovery' ? null : (view.bankCounts?.[r] ?? null))}
        pick={r => setBag(withItem(bag, r, 1))}
      />
      <Chosen bag={bag} label="Take" direction="in" hint="Choose cards above" remove={r => setBag(without(bag, r))} />
    </Panel>
  );
}
