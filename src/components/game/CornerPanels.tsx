// Panels that open in the board's corner, like the trade panel: discarding on a 7, Year of
// Plenty, and Monopoly. Each picks resources by tapping cards, then confirms with one button.
import { ArrowDown, ArrowUp, Check, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { emptyBag, resourceCount } from '../../../shared/engine';
import { type GameAction, type GameView, RESOURCES, type Resource, type ResourceBag } from '../../../shared/types';
import { ResourceIcon } from '../../art';
import { cardStyle, RESOURCE_LABELS } from '../ResourceHand';
import { blockedReason, cardToPlay } from './DevelopmentHand';

/** Header, body and footer shared by every corner panel. */
function Panel({
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

/** A row of chosen cards; tapping one takes it back out. */
function Chosen({
  bag,
  label,
  direction,
  hint,
  remove,
}: {
  bag: ResourceBag;
  label: string;
  direction: 'in' | 'out';
  hint: string;
  remove: (resource: Resource) => void;
}) {
  return (
    <div className={`trade-selection ${direction === 'in' ? 'want' : 'give'}`} role="group" aria-label={label}>
      <span className="trade-direction">
        {direction === 'in' ? <ArrowDown size={25} /> : <ArrowUp size={25} />}
        <small>{label}</small>
      </span>
      <div className="trade-selected-cards">
        {RESOURCES.filter(r => bag[r] > 0).map(r => (
          <button
            key={r}
            className="trade-card"
            style={cardStyle(r)}
            aria-label={`Put back one ${RESOURCE_LABELS[r]}`}
            onClick={() => remove(r)}
          >
            <ResourceIcon resource={r} size={26} />
            <strong>{bag[r]}</strong>
          </button>
        ))}
        {!resourceCount(bag) && <span className="trade-hint">{hint}</span>}
      </div>
    </div>
  );
}

/** One button per resource, as in the trade panel's "receive" row. */
function Palette({
  label,
  name,
  disabled,
  pressed,
  pick,
}: {
  label: string;
  name: (resource: Resource) => string;
  disabled: (resource: Resource) => boolean;
  pressed?: (resource: Resource) => boolean;
  pick: (resource: Resource) => void;
}) {
  return (
    <div className="trade-palette" role="group" aria-label={label}>
      {RESOURCES.map(r => (
        <button
          className="trade-card"
          style={cardStyle(r)}
          key={r}
          aria-label={name(r)}
          aria-pressed={pressed?.(r)}
          disabled={disabled(r)}
          onClick={() => pick(r)}
        >
          <ResourceIcon resource={r} size={28} />
          <span>{RESOURCE_LABELS[r]}</span>
        </button>
      ))}
    </div>
  );
}

const without = (bag: ResourceBag, r: Resource): ResourceBag => ({ ...bag, [r]: Math.max(0, bag[r] - 1) });

/** Add one card from your hand to a discard, within what you hold and what you owe. */
export function addDiscard(bag: ResourceBag, resource: Resource, view: GameView): ResourceBag {
  const owed = view.pendingDiscards[view.selfId] ?? 0;
  if (bag[resource] >= view.hand[resource] || resourceCount(bag) >= owed) return bag;
  return { ...bag, [resource]: bag[resource] + 1 };
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
  bag: ResourceBag;
  setBag: (bag: ResourceBag) => void;
  busy: boolean;
  send: (a: GameAction) => void;
}) {
  const owed = view.pendingDiscards[view.selfId] ?? 0;
  const count = resourceCount(bag);
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
  const [bag, setBag] = useState(emptyBag);
  const picked = resourceCount(bag);
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
        label="Choose resources to take"
        name={r => `Take one more ${RESOURCE_LABELS[r]}`}
        disabled={r => busy || picked >= 2 || !view.bank[r]}
        pick={r => setBag({ ...bag, [r]: bag[r] + 1 })}
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
  const [choice, setChoice] = useState<Resource | null>(null);
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
          {choice ? `Take all ${RESOURCE_LABELS[choice]}` : 'Choose a resource'}
        </button>
      }
    >
      <Palette
        label="Choose a resource"
        name={r => RESOURCE_LABELS[r]}
        disabled={() => busy}
        pressed={r => choice === r}
        pick={setChoice}
      />
    </Panel>
  );
}
