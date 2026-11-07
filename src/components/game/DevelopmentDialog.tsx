import type { GameAction, GameView } from '../../../shared/types';
import { GameDialog } from '../TradePanel';
import { blockedReason, cardToPlay, DEV_CARDS } from './DevelopmentHand';

/** Cards played from a confirm popup. Year of Plenty and Monopoly use corner panels (CornerPanels.tsx). */
export type DialogCard = 'knight' | 'road-building' | 'victory-point';

/** Knight and Road Building ask to confirm; a Victory Point card just explains itself. */
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
    <GameDialog title={card.name} close={close}>
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
    </GameDialog>
  );
}
