import { BUILD_COSTS } from '../engine/core';
import { relaySpots, surveySpots } from '../engine/legal';
import { hexNumbers } from '../rules';
import { boardIndex, isLandVertex } from '../seafaring';
import { type GameAction, type GameView, RESOURCES, type Resource, type TradeOffer } from '../types';
import { chartMove, splitMove, surveyTown, tileDots } from './charting';

/**
 * Cartographers for every bot level, kept simple and cheap: survey ships whenever affordable (a
 * point each), lodestone kept while there is a ship at sea or a good relay spot, splits and charts
 * on the bot's own tiles with the lodestone left over, and a relay station (or the trade that
 * completes one) before ending a turn. The trained Advanced bot's own plans don't know these pieces.
 */

/** A survey ship whenever one can be fitted out, charting around its best tied town. */
export function surveyMove(view: GameView): GameAction | null {
  const edgeId = view.legal.surveys[0];
  const vertexId = edgeId ? surveyTown(view, edgeId) : null;
  return edgeId && vertexId ? { type: 'build-survey', edgeId, vertexId } : null;
}

/** Fewest dots a relay station's two tiles must have between them to be worth building. */
const RELAY_MIN_DOTS = 5;

/**
 * A land corner a settlement could still go on: nothing on it or next to it. A relay station's
 * ends can never hold a settlement, so relays there would wall off the island.
 */
function settleable(view: GameView, vertexId: string): boolean {
  const index = boardIndex(view.board);
  if (!isLandVertex(view.board, vertexId) || view.buildings[vertexId]) return false;
  return index.vertex.get(vertexId)!.edgeIds.every(id => {
    const edge = index.edge.get(id)!;
    return !view.buildings[edge.a === vertexId ? edge.b : edge.a];
  });
}

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
 * What this seat would spend lodestone on, cards aside: a survey ship for a ship out at sea, else a
 * relay station on a spot that pays well. Null when it has no use for lodestone.
 */
function lodestoneUse(view: GameView): 'survey' | 'relay' | null {
  const self = view.players.find(p => p.id === view.selfId);
  if (!self) return null;
  if (self.surveysLeft && surveySpots(view, view.selfId).length) return 'survey';
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
function tradeToward(view: GameView, piece: 'survey' | 'relay'): GameAction | null {
  const cost = BUILD_COSTS[piece];
  const missing = RESOURCES.filter(r => view.hand[r] < cost[r]);
  const [want] = missing;
  if (missing.length !== 1 || !want || want === 'lodestone' || !view.bank[want]) return null;
  const spare = (r: Resource) => view.hand[r] - cost[r] - view.tradeRates[r];
  const give = RESOURCES.filter(r => r !== 'lodestone' && r !== want && spare(r) >= 0).sort(
    (a, b) => spare(b) - spare(a),
  );
  return give[0] ? { type: 'trade', give: give[0], receive: want } : null;
}

/**
 * Cartographers on a bot's own turn: a survey ship first (a point), else a split or chart on its
 * tiles with lodestone it doesn't need for a planned survey ship or relay station; and before
 * ending the turn, a relay station or the trade that completes one of the two.
 */
export function cartographersTurn(view: GameView, planned: GameAction): GameAction {
  if (!view.cartographers || view.phase !== 'build' || view.activePlayerId !== view.selfId) return planned;
  const survey = surveyMove(view);
  if (survey) return survey;
  const use = lodestoneUse(view);
  // Charts and splits are cheap, so only lodestone beyond the planned piece's goes on tiles.
  const spare = view.hand.lodestone - (use ? BUILD_COSTS[use].lodestone : 0);
  if (spare >= BUILD_COSTS.chart.lodestone) {
    const tile = splitMove(view) ?? chartMove(view);
    if (tile) return tile;
  }
  const finish = () => relayMove(view) ?? (use ? tradeToward(view, use) : null);
  if (use && givesLodestone(planned)) return finish() ?? { type: 'end-turn' };
  return planned.type === 'end-turn' ? (finish() ?? planned) : planned;
}

/** Turn down offers for lodestone while it has a use. */
export function keepsLodestone(view: GameView, offer: TradeOffer): boolean {
  return view.cartographers && (offer.want.lodestone ?? 0) > 0 && lodestoneUse(view) !== null;
}
