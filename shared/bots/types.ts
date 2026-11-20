import type { BotLevel, GameAction, GameView, TradeOffer } from '../types';
import type { TileTuning } from './charting';

export interface TurnOptions {
  /** Purchases already made this turn. Timed-out turns stop after two. */
  builds?: number;
  /** Whether the bot may offer trades to other players (off when finishing a timed-out turn). */
  allowOffers?: boolean;
  /** Work already done on this decision, in earlier requests (see `Brain.think`). */
  thought?: BotThought;
}

/**
 * A starting placement worked out over several requests, so that none exceeds the CPU budget. It
 * only saves work: the bot chooses the same corner with or without it.
 */
export interface BotThought {
  /** The draft's best corners, best first, with who owns what if each is taken. */
  picks: { corner: number; score: number; final: Int8Array }[];
  /** The forecast's verdict on the first few picks. */
  edges: number[];
}

export interface BotOptions extends TurnOptions {
  level?: BotLevel;
}

/** One bot level. Each method returns a single action for the current view. */
export interface Brain {
  /** The seat's own turn: setup, roll, robber, building, trading. */
  turn(view: GameView, options: TurnOptions): GameAction;
  /** One more piece of work on this decision, or null when `turn` can simply answer. */
  think?(view: GameView, done?: BotThought): BotThought | null;
  /** Choose cards to discard after a 7. */
  discard(view: GameView): GameAction;
  /** Answer another player's offer sent to this seat. */
  respond(view: GameView, offer: TradeOffer): GameAction;
  /** This seat's own offer: everyone has answered, so take a counter-offer or withdraw. */
  review(view: GameView, offer: TradeOffer): GameAction;
  /** Resources from gold or volcanoes (default: goldChoice in analysis.ts). */
  gold?(view: GameView): GameAction;
  /** Five or six players: the special build phase (default: specialBuild in analysis.ts). */
  specialBuild?(view: GameView): GameAction;
  /** Cartographers: how it judges tiles to chart and split (SIMPLE_TILES when absent). */
  tiles?: TileTuning;
}
