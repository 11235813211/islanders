import { useState } from 'react';
import { emptyBag, resourceCount } from '../../../shared/engine';
import {
  type DevelopmentType,
  type GameAction,
  type GameView,
  RESOURCES,
  type ResourceBag,
} from '../../../shared/types';
import { ResourceIcon } from '../../art';
import { RESOURCE_LABELS } from '../ResourceHand';
import { GameDialog, ResourcePicker } from '../TradePanel';
import { DEV_CARDS } from './DevelopmentHand';

/** Why no card of this kind can be played now, or null when one can. */
function blockedReason(view: GameView, kind: DevelopmentType): string | null {
  const cards = view.development.filter(card => card.kind === kind);
  if (cards.some(card => view.playableDevelopment.includes(card.id))) return null;
  if (view.pausedAt !== null) return 'The game is paused.';
  if (view.activePlayerId !== view.selfId || !['roll', 'build'].includes(view.phase))
    return 'You can play this on your turn.';
  if (cards.every(card => card.boughtTurn === view.turn)) return 'You bought this card this turn. Play it next turn.';
  return 'You already played a development card this turn.';
}

/** Monopoly: tap a resource to play the card. */
function MonopolyChoice({
  disabled,
  play,
}: {
  disabled: boolean;
  play: (resource: (typeof RESOURCES)[number]) => void;
}) {
  return (
    <div className="monopoly-options">
      {RESOURCES.map(resource => (
        <button key={resource} disabled={disabled} onClick={() => play(resource)}>
          <ResourceIcon resource={resource} size={30} />
          {RESOURCE_LABELS[resource]}
        </button>
      ))}
    </div>
  );
}

/** Year of Plenty: pick up to two cards the bank still has. */
function PlentyChoice({
  view,
  disabled,
  play,
}: {
  view: GameView;
  disabled: boolean;
  play: (bag: ResourceBag) => void;
}) {
  const [bag, setBag] = useState(emptyBag);
  const picked = resourceCount(bag);
  const limit = Object.fromEntries(
    RESOURCES.map(resource => [resource, view.bank[resource] ? Math.min(2, bag[resource] + 2 - picked) : 0]),
  ) as ResourceBag;
  return (
    <>
      <ResourcePicker value={bag} setValue={setBag} prefix="Take" limit={limit} />
      <button className="button primary full" disabled={disabled || picked < 1} onClick={() => play(bag)}>
        Take {picked === 1 ? '1 resource' : `${picked} resources`}
      </button>
    </>
  );
}

/** Play one development card. Knight and Road Building ask to confirm; Monopoly and Year of Plenty ask what to take. */
export default function DevelopmentDialog({
  view,
  kind,
  busy,
  send,
  close,
}: {
  view: GameView;
  kind: DevelopmentType;
  busy: boolean;
  send: (a: GameAction) => void;
  close: () => void;
}) {
  const card = DEV_CARDS[kind];
  const reason = kind === 'victory-point' ? null : blockedReason(view, kind);
  const cardId =
    view.development.find(c => c.kind === kind && view.playableDevelopment.includes(c.id))?.id ??
    view.development.find(c => c.kind === kind)?.id;
  const disabled = busy || reason !== null || !cardId;
  const play = (action: GameAction) => {
    send(action);
    close();
  };
  const confirm = (label: string, action: GameAction) => (
    <div className="dialog-actions">
      <button className="button secondary" onClick={close}>
        Cancel
      </button>
      <button className="button primary" disabled={disabled} onClick={() => play(action)}>
        {label}
      </button>
    </div>
  );
  return (
    <GameDialog title={card.name} close={close}>
      <div className="development-summary">
        <span className="development-emblem">{card.icon(30)}</span>
        <p>{card.effect}</p>
      </div>
      {reason && <p className="form-note">{reason}</p>}
      {kind === 'knight' && confirm('Play Knight', { type: 'play-knight', cardId: cardId ?? '' })}
      {kind === 'road-building' && confirm('Play Road Building', { type: 'play-road-building', cardId: cardId ?? '' })}
      {kind === 'monopoly' && (
        <MonopolyChoice
          disabled={disabled}
          play={resource => play({ type: 'play-monopoly', cardId: cardId ?? '', resource })}
        />
      )}
      {kind === 'year-of-plenty' && (
        <PlentyChoice
          view={view}
          disabled={disabled}
          play={resources => play({ type: 'play-plenty', cardId: cardId ?? '', resources })}
        />
      )}
      {kind === 'victory-point' && (
        <div className="dialog-actions">
          <button className="button primary" onClick={close}>
            OK
          </button>
        </div>
      )}
    </GameDialog>
  );
}
