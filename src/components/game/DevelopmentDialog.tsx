import { useState } from 'react';
import { emptyBag, resourceCount } from '../../../shared/engine';
import {
  type DevelopmentCard,
  type GameAction,
  type GameView,
  RESOURCES,
  type ResourceBag,
} from '../../../shared/types';
import { ResourceIcon } from '../../art';
import { RESOURCE_LABELS } from '../ResourceHand';
import { GameDialog, ResourcePicker } from '../TradePanel';
import { KnightIcon } from './icons';

const DEV_NAMES = {
  knight: 'Knight',
  'road-building': 'Road Building',
  'year-of-plenty': 'Year of Plenty',
  monopoly: 'Monopoly',
  'victory-point': 'Victory Point',
};

function cardHint(view: GameView, card: DevelopmentCard): string {
  if (card.kind === 'victory-point') return '1 private victory point · revealed when you win';
  if (card.boughtTurn === view.turn) return 'Available next turn';
  return view.playableDevelopment.includes(card.id) ? 'Play this card' : 'Play one card on your turn';
}

/** Your development cards. Monopoly and Year of Plenty ask for a choice before playing. */
export default function DevelopmentDialog({
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
  const [selection, setSelection] = useState<DevelopmentCard | null>(null);
  const [bag, setBag] = useState(emptyBag);
  function play(c: DevelopmentCard) {
    if (c.kind === 'knight' || c.kind === 'road-building') {
      send({ type: c.kind === 'knight' ? 'play-knight' : 'play-road-building', cardId: c.id });
      close();
    } else setSelection(c);
  }
  return (
    <GameDialog title={selection ? DEV_NAMES[selection.kind] : 'Development cards'} close={close}>
      {!selection ? (
        <div className="development-list">
          {view.development.length ? (
            view.development.map(c => (
              <button key={c.id} disabled={busy || !view.playableDevelopment.includes(c.id)} onClick={() => play(c)}>
                <span className="development-emblem">
                  {c.kind === 'knight' ? <KnightIcon /> : c.kind === 'victory-point' ? '★' : '✦'}
                </span>
                <span>
                  <strong>{DEV_NAMES[c.kind]}</strong>
                  <small>{cardHint(view, c)}</small>
                </span>
              </button>
            ))
          ) : (
            <p>No development cards yet.</p>
          )}
        </div>
      ) : selection.kind === 'monopoly' ? (
        <>
          <p>Choose one resource. Every opponent gives you all of that type.</p>
          <div className="monopoly-options">
            {RESOURCES.map(r => (
              <button
                key={r}
                disabled={busy}
                onClick={() => {
                  send({ type: 'play-monopoly', cardId: selection.id, resource: r });
                  close();
                }}
              >
                <ResourceIcon resource={r} size={30} />
                {RESOURCE_LABELS[r]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p>Choose two resources from the bank.</p>
          <ResourcePicker
            value={bag}
            setValue={setBag}
            prefix="Take"
            limit={Object.fromEntries(RESOURCES.map(r => [r, view.bank[r] ? 2 : 0])) as ResourceBag}
          />
          <button
            className="button primary full"
            disabled={busy || resourceCount(bag) < 1 || resourceCount(bag) > 2}
            onClick={() => {
              send({ type: 'play-plenty', cardId: selection.id, resources: bag });
              close();
            }}
          >
            Take resources
          </button>
        </>
      )}
    </GameDialog>
  );
}
