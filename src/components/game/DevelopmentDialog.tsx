import { X } from 'lucide-react';
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameAction, GameView } from '../../../shared/types';
import { useDismiss } from '../../hooks/useDismiss';
import { blockedReason, cardToPlay, DEV_CARDS } from './DevelopmentHand';

/** Cards played from a confirm popup. Year of Plenty and Monopoly use corner panels (CornerPanels.tsx). */
export type DialogCard = 'knight' | 'road-building' | 'victory-point';

/** Knight and Road Building ask to confirm, just above the card; a Victory Point card just explains itself. */
export default function DevelopmentDialog({
  view,
  kind,
  busy,
  send,
  close,
}: {
  view: GameView;
  kind: DialogCard;
  busy: boolean;
  send: (a: GameAction) => void;
  close: () => void;
}) {
  const card = DEV_CARDS[kind];
  const reason = kind === 'victory-point' ? null : blockedReason(view, kind);
  const cardId = cardToPlay(view, kind);
  const play = (action: GameAction) => {
    send(action);
    close();
  };
  return (
    <CardPopover kind={kind} title={card.name} close={close}>
      <div className="development-summary">
        <span className="development-emblem">{card.icon(30)}</span>
        <p>{card.effect}</p>
      </div>
      {reason && <p className="form-note">{reason}</p>}
      <div className="dialog-actions">
        {kind === 'victory-point' ? (
          <button className="button primary" onClick={close}>
            OK
          </button>
        ) : (
          <>
            <button className="button secondary" onClick={close}>
              Cancel
            </button>
            <button
              className="button primary"
              disabled={busy || reason !== null}
              onClick={() =>
                play(kind === 'knight' ? { type: 'play-knight', cardId } : { type: 'play-road-building', cardId })
              }
            >
              Play {card.name}
            </button>
          </>
        )}
      </div>
    </CardPopover>
  );
}

/** A small popup just above the card in your hand (or centered low on the screen if it can't be found). */
function CardPopover({
  kind,
  title,
  close,
  children,
}: {
  kind: DialogCard;
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  const [place, setPlace] = useState<CSSProperties>({ left: '50%', bottom: 140 });
  useDismiss(true, close, root);
  useLayoutEffect(() => {
    const anchor = document.querySelector(`.cards-dev-${kind}`)?.getBoundingClientRect();
    if (!anchor) return;
    const half = Math.min(170, window.innerWidth / 2 - 8);
    const center = Math.max(half + 8, Math.min(window.innerWidth - half - 8, anchor.left + anchor.width / 2));
    setPlace({ left: center, bottom: window.innerHeight - anchor.top + 10 });
  }, [kind]);
  return createPortal(
    <section ref={root} className="card-popover" role="dialog" aria-label={title} style={place}>
      <div className="section-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={close}>
          <X size={18} />
        </button>
      </div>
      {children}
    </section>,
    document.body,
  );
}
