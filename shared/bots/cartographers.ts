import { BUILD_COSTS } from '../engine/core';
import { relaySpots } from '../engine/legal';
import { hexNumbers } from '../rules';
import { boardIndex } from '../seafaring';
import { type GameAction, type GameView, TILE_RESOURCES, type TradeOffer } from '../types';
import {
  bankTradeFor,
  chartMove,
  finishMove,
  finishTarget,
  SIMPLE_TILES,
  settleable,
  splitMove,
  tileDots,
} from './charting';

/**
 * Cartographers for every bot level, kept simple and cheap: chart toward a finished tile it alone
 * stands beside (a point), lodestone kept for that or a good relay spot, splits and charts on its
 * own tiles with the lodestone left over, and a relay station (or the trade that completes one)
 * before ending a turn. The trained Advanced bot's own plans don't know these moves.
 */

/** Fewest dots a relay station's two tiles must have between them to be worth building. */
const RELAY_MIN_DOTS = 5;

/** The best of these relay station spots for this seat, when its tiles pay enough and it blocks no settling. */
function bestRelay(view: GameView, spots: string[]): string | null {
  const index = boardIndex(view.board);
  let best: { edgeId: string; value: number } | null = null;
  for (const edgeId of spots) {
    const edge = index.edge.get(edgeId)!;
    if (settleable(view, edge.a) || settleable(view, edge.b)) continue;
    // Relay stations collect under the robber too.
    const value = index.edgeHexes.get(edgeId)!.reduce((sum, h) => sum + tileDots(hexNumbers(h)), 0);
    if (value >= RELAY_MIN_DOTS && (!best || value > best.value)) best = { edgeId, value };
  }
  return best?.edgeId ?? null;
}

/** A relay station on the legal spot whose tiles pay most. */
export function relayMove(view: GameView): GameAction | null {
  const edgeId = bestRelay(view, view.legal.relays);
  return edgeId ? { type: 'build-relay', edgeId } : null;
}

/**
 * What this seat would spend lodestone on, cards aside: a tile it can finish alone, else a relay
 * station on a spot that pays well. Null when it has no use for lodestone.
 */
function lodestoneUse(view: GameView): 'chart' | 'relay' | null {
  const self = view.players.find(p => p.id === view.selfId);
  if (!self) return null;
  if (finishTarget(view)) return 'chart';
  if (self.relaysLeft && bestRelay(view, relaySpots(view, view.selfId))) return 'relay';
  return null;
}

/** Does this move give lodestone away? */
function givesLodestone(action: GameAction): boolean {
  if (action.type === 'trade') return action.give === 'lodestone';
  if (action.type === 'bank-trade' || action.type === 'offer-trade') return (action.give.lodestone ?? 0) > 0;
  return false;
}

/** With the lodestone in hand, a bank trade for the one other card a piece still needs, paid with spares. */
function tradeToward(view: GameView, piece: 'chart' | 'relay'): GameAction | null {
  const cost = BUILD_COSTS[piece];
  const missing = TILE_RESOURCES.filter(r => view.hand[r] < cost[r]);
  const [want] = missing;
  if (missing.length !== 1 || !want || want === 'lodestone') return null;
  return bankTradeFor(view, want, cost);
}

/**
 * Cartographers on a bot's own turn: a chart toward a tile it can finish alone first, else a split
 * or chart on its tiles with lodestone it doesn't need for a relay station, judged by the level's
 * `tuning`; and before ending the turn, a relay station or the trade that completes one.
 */
export function cartographersTurn(view: GameView, planned: GameAction, tuning = SIMPLE_TILES): GameAction {
  if (!view.cartographers || view.phase !== 'build' || view.activePlayerId !== view.selfId) return planned;
  const finishing = finishMove(view);
  if (finishing) return finishing;
  const use = lodestoneUse(view);
  // Charts and splits are cheap, so only lodestone beyond the planned piece's goes on tiles.
  const spare = view.hand.lodestone - (use ? BUILD_COSTS[use].lodestone : 0);
  if (spare >= BUILD_COSTS.chart.lodestone) {
    const tile = splitMove(view, tuning) ?? chartMove(view, tuning);
    if (tile) return tile;
  }
  const lastStep = () =>
    (spare >= BUILD_COSTS.relay.lodestone ? relayMove(view) : null) ?? (use ? tradeToward(view, use) : null);
  if (use && givesLodestone(planned)) return lastStep() ?? { type: 'end-turn' };
  return planned.type === 'end-turn' ? (lastStep() ?? planned) : planned;
}

/** Turn down offers for lodestone while it has a use. */
export function keepsLodestone(view: GameView, offer: TradeOffer): boolean {
  return view.cartographers && (offer.want.lodestone ?? 0) > 0 && lodestoneUse(view) !== null;
}
