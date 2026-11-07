import type { BotLevel, GameAction, GameView, TradeOffer } from '../types';

export interface TurnOptions {
  /** Purchases already made this turn. Timed-out turns stop after two. */
  builds?: number;
  /** Whether the bot may offer trades to other players (off when finishing a timed-out turn). */
  allowOffers?: boolean;
}

export interface BotOptions extends TurnOptions {
  level?: BotLevel;
}

/** One bot level. Each method returns a single action for the current view. */
export interface Brain {
  /** The seat's own turn: setup, roll, robber, building, trading. */
  turn(view: GameView, options: TurnOptions): GameAction;
  /** Choose cards to discard after a 7. */
  discard(view: GameView): GameAction;
  /** Answer another player's offer sent to this seat. */
  respond(view: GameView, offer: TradeOffer): GameAction;
  /** This seat's own offer: everyone has answered, so take a counter-offer or withdraw. */
  review(view: GameView, offer: TradeOffer): GameAction;
}
