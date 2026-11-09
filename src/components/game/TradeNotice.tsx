import { ArrowDown, ArrowUp, Check, Repeat2, X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { playerVars } from '../../../shared/colors';
import {
  type GameAction,
  type GameView,
  RESOURCES,
  type Tradable,
  type TradeBag,
  type TradeOffer,
} from '../../../shared/types';
import { bagHas, held, TradableIcon, tradableLabel, tradableStyle } from './tradables';

const ITEMS: Tradable[] = [...RESOURCES, 'discovery'];

/** The cards on one side of a trade, outlined green (you get them) or red (you give them). */
export function Bundle({ bag, side }: { bag: TradeBag; side: 'get' | 'give' }) {
  return (
    <span className="trade-bundle">
      {ITEMS.filter(r => bagHas(bag, r) > 0).map(r => (
        <span
          className={`trade-chip ${side}`}
          style={tradableStyle(r)}
          key={r}
          role="img"
          aria-label={`${bagHas(bag, r)} ${tradableLabel(r)}`}
        >
          <TradableIcon item={r} size={22} />
          <strong>{bagHas(bag, r)}</strong>
        </span>
      ))}
    </span>
  );
}

/** "You get" (green, arrow down) or "You give" (red, arrow up), from the viewer's side of the trade. */
function Side({ bag, side }: { bag: TradeBag; side: 'get' | 'give' }) {
  return (
    <span className={`offer-side ${side}`}>
      <span className="offer-arrow" aria-hidden="true">
        {side === 'get' ? <ArrowDown size={17} /> : <ArrowUp size={17} />}
      </span>
      <small>{side === 'get' ? 'You get' : 'You give'}</small>
      <Bundle bag={bag} side={side} />
    </span>
  );
}

type Answer = 'yes' | 'no' | 'counter' | 'waiting';
function answerOf(offer: TradeOffer, id: string): Answer {
  if (offer.acceptedBy.includes(id)) return 'yes';
  if (offer.declinedBy.includes(id)) return 'no';
  if (offer.counters.some(c => c.fromId === id)) return 'counter';
  return 'waiting';
}
const ANSWER_ICON: Record<Answer, ReactNode> = {
  yes: <Check size={15} strokeWidth={3} />,
  no: <X size={15} strokeWidth={3} />,
  counter: <Repeat2 size={15} strokeWidth={2.5} />,
  waiting: <span className="answer-wait">?</span>,
};
const ANSWER_TEXT: Record<Answer, string> = {
  yes: 'accepted',
  no: 'declined',
  counter: 'countered',
  waiting: 'has not answered',
};

/** One square per recipient in their color: ?, ✓, ✗, or a counter. The offering player taps a ✓ to trade. */
function Answers({
  view,
  offer,
  canConfirm,
  send,
}: {
  view: GameView;
  offer: TradeOffer;
  canConfirm: boolean;
  send: (a: GameAction) => void;
}) {
  return (
    <fieldset className="offer-answers" aria-label="Answers">
      {offer.to.map(id => {
        const player = view.players.find(p => p.id === id);
        if (!player) return null;
        const answer = answerOf(offer, id);
        const style = playerVars(player.color) as CSSProperties;
        const label = `${player.name} ${ANSWER_TEXT[answer]}`;
        return canConfirm && answer === 'yes' ? (
          <button
            key={id}
            type="button"
            className={`offer-answer ${answer} confirm`}
            style={style}
            aria-label={`Trade with ${player.name}`}
            data-tip={`Trade with ${player.name}`}
            onClick={() => send({ type: 'confirm-trade', offerId: offer.id, playerId: id })}
          >
            {ANSWER_ICON[answer]}
          </button>
        ) : (
          <span
            key={id}
            className={`offer-answer ${answer}`}
            style={style}
            role="img"
            aria-label={label}
            data-tip={label}
          >
            {ANSWER_ICON[answer]}
          </span>
        );
      })}
    </fieldset>
  );
}

/** Yes (its pie shows the time left), no, and counter: three matching buttons. */
function AnswerButtons({
  view,
  offer,
  progress,
  disabled,
  send,
  counter,
}: {
  view: GameView;
  offer: TradeOffer;
  progress: number;
  disabled: boolean;
  send: (a: GameAction) => void;
  counter: (offer: TradeOffer) => void;
}) {
  const answer = answerOf(offer, view.selfId);
  const affordable = ITEMS.every(r => held(view, r) >= bagHas(offer.want, r));
  return (
    <div className="offer-actions">
      <button
        type="button"
        className="answer-button yes"
        style={{ '--progress': `${progress * 360}deg` } as CSSProperties}
        aria-label="Accept trade"
        aria-pressed={answer === 'yes'}
        data-tip={affordable ? 'Accept' : 'Not enough cards'}
        disabled={disabled || !affordable}
        onClick={() => send({ type: 'accept-trade', offerId: offer.id })}
      >
        <Check size={19} strokeWidth={3} />
      </button>
      <button
        type="button"
        className="answer-button no"
        aria-label="Decline trade"
        aria-pressed={answer === 'no'}
        data-tip="Decline"
        disabled={disabled}
        onClick={() => send({ type: 'decline-trade', offerId: offer.id })}
      >
        <X size={19} strokeWidth={3} />
      </button>
      <button
        type="button"
        className="answer-button counter tip-end"
        aria-label="Counter-offer"
        aria-pressed={answer === 'counter'}
        data-tip="Propose different terms"
        disabled={disabled}
        onClick={() => counter(offer)}
      >
        <Repeat2 size={19} strokeWidth={2.5} />
      </button>
    </div>
  );
}

/**
 * An open offer, as seen by its author or by a player it was sent to, always from the viewer's
 * side: what you get (green, down) and what you give (red, up). Recipients keep seeing it after
 * answering, so they can change their answer until it closes.
 */
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
  if (!mine && !offer.to.includes(view.selfId)) return null;
  const name = (id: string) => view.players.find(p => p.id === id)?.name ?? 'Someone';
  const clock = view.pausedAt ?? now;
  const progress = Math.max(0, Math.min(1, (offer.expiresAt - clock) / (offer.expiresAt - offer.createdAt)));
  if (!progress) return null;
  const paused = view.pausedAt !== null;
  const everyone = offer.to.length === view.players.length - 1;
  const answer = answerOf(offer, view.selfId);
  return (
    <section className="trade-notice" aria-label="Trade offer">
      <div className="offer-content">
        <span className="offer-from">
          {mine
            ? `Your offer${everyone ? '' : ` to ${offer.to.map(name).join(', ')}`}`
            : `${name(offer.fromId)} offers`}
        </span>
        <div className="offer-exchange">
          <Side bag={mine ? offer.want : offer.give} side="get" />
          <Side bag={mine ? offer.give : offer.want} side="give" />
        </div>
        <Answers view={view} offer={offer} canConfirm={mine && !busy && !paused} send={send} />
        {mine && offer.acceptedBy.length > 0 && <span className="offer-from">Tap a ✓ to trade with that player.</span>}
        {mine &&
          offer.counters.map(c => (
            <div className="offer-counter" key={c.id}>
              <span className="offer-from">{name(c.fromId)} counters</span>
              <div className="offer-exchange">
                <Side bag={c.give} side="get" />
                <Side bag={c.want} side="give" />
                <button
                  type="button"
                  className="answer-button yes"
                  aria-label={`Accept ${name(c.fromId)}'s counter-offer`}
                  data-tip="Accept this counter-offer"
                  disabled={busy || paused}
                  onClick={() => send({ type: 'accept-counter', offerId: offer.id, counterId: c.id })}
                >
                  <Check size={19} strokeWidth={3} />
                </button>
              </div>
            </div>
          ))}
        {!mine && answer === 'yes' && <span className="offer-from">Waiting for {name(offer.fromId)}.</span>}
        {!mine && answer === 'counter' && <span className="offer-from">You countered. Waiting for an answer.</span>}
      </div>
      {mine ? (
        <div className="offer-actions">
          <span
            className="offer-pie"
            role="img"
            aria-label="Offer time remaining"
            style={{ '--progress': `${progress * 360}deg` } as CSSProperties}
          />
          <button
            type="button"
            className="answer-button no tip-end"
            aria-label="Withdraw offer"
            data-tip="Withdraw"
            disabled={busy || paused}
            onClick={() => send({ type: 'cancel-trade', offerId: offer.id })}
          >
            <X size={19} strokeWidth={3} />
          </button>
        </div>
      ) : (
        <AnswerButtons
          view={view}
          offer={offer}
          progress={progress}
          disabled={busy || paused}
          send={send}
          counter={counter}
        />
      )}
    </section>
  );
}
