import { BUILD_COSTS } from '../engine/core';
import { relaySpots, surveySpots } from '../engine/legal';
import { chartedNumbers, hexNumbers } from '../rules';
import { boardIndex } from '../seafaring';
import { type GameAction, type GameView, type Hex, RESOURCES, type Resource, type TradeOffer } from '../types';

/**
 * Cartographers for every bot level, kept simple and cheap: survey ships whenever affordable (a
 * point each), lodestone kept while there is a ship at sea or a good relay spot, a relay station
 * (or the trade that completes one) before ending a turn, and charts on the tiles that pay the bot
 * most. The trained Advanced bot's own plans don't know these pieces.
 */

/** Dots on a number token: how many of the 36 rolls hit it. */
const dots = (n: number) => 6 - Math.abs(7 - n);
const tileDots = (numbers: number[]) => numbers.reduce((sum, n) => sum + dots(n), 0);

/** How much of a tile's payout goes to this seat: 1 per settlement or relay station, 2 per city. */
function share(view: GameView, hex: Hex): number {
  const index = boardIndex(view.board);
  let owned = 0;
  for (const id of hex.vertexIds) {
    const building = view.buildings[id];
    if (building?.playerId === view.selfId) owned += building.kind === 'city' ? 2 : 1;
  }
  for (const id of view.relays)
    if (view.roads[id] === view.selfId && index.edgeHexes.get(id)!.some(h => h.id === hex.id)) owned++;
  return owned;
}

/** The charts this seat makes after a 7: its best tiles, or none (a pass) when nothing pays it. */
export function chartChoice(view: GameView): GameAction {
  const owed = view.pendingCharts[view.selfId] ?? 0;
  const index = boardIndex(view.board);
  // Numbers as they would read after the picks so far (a tile may be picked more than once).
  const numbers = new Map(view.legal.chartHexes.map(id => [id, hexNumbers(index.hex.get(id)!)]));
  const picks: string[] = [];
  for (let i = 0; i < owed; i++) {
    let best: { id: string; gain: number } | null = null;
    for (const [id, now] of numbers) {
      // A new number is a 2 or a 12 either way, so `low` doesn't change the gain.
      const after = chartedNumbers(now, true);
      if (!after) continue;
      const gain = (tileDots(after) - tileDots(now)) * share(view, index.hex.get(id)!);
      if (gain > 0 && (!best || gain > best.gain)) best = { id, gain };
    }
    if (!best) break;
    picks.push(best.id);
    numbers.set(best.id, chartedNumbers(numbers.get(best.id)!, true)!);
  }
  return { type: 'chart-hexes', hexIds: picks };
}

/** A survey ship whenever one can be fitted out. */
export function surveyMove(view: GameView): GameAction | null {
  const edgeId = view.legal.surveys[0];
  return edgeId ? { type: 'build-survey', edgeId } : null;
}

/** Fewest dots a relay station's two tiles must have between them to be worth building. */
const RELAY_MIN_DOTS = 5;

/** The best of these relay station spots for this seat, when its tiles pay enough. */
function bestRelay(view: GameView, spots: string[]): string | null {
  const index = boardIndex(view.board);
  let best: { edgeId: string; value: number } | null = null;
  for (const edgeId of spots) {
    const value = index.edgeHexes
      .get(edgeId)!
      .filter(h => h.id !== view.robber)
      .reduce((sum, h) => sum + tileDots(hexNumbers(h)), 0);
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
 * Cartographers on a bot's own turn: a survey ship first (a point); lodestone kept while it has a
 * use; and before ending the turn, a relay station or the trade that completes one of the two.
 */
export function cartographersTurn(view: GameView, planned: GameAction): GameAction {
  if (!view.cartographers || view.phase !== 'build' || view.activePlayerId !== view.selfId) return planned;
  const survey = surveyMove(view);
  if (survey) return survey;
  const use = lodestoneUse(view);
  const finish = () => relayMove(view) ?? (use ? tradeToward(view, use) : null);
  if (use && givesLodestone(planned)) return finish() ?? { type: 'end-turn' };
  return planned.type === 'end-turn' ? (finish() ?? planned) : planned;
}

/** Turn down offers for lodestone while it has a use. */
export function keepsLodestone(view: GameView, offer: TradeOffer): boolean {
  return view.cartographers && (offer.want.lodestone ?? 0) > 0 && lodestoneUse(view) !== null;
}
