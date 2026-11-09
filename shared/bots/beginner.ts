import { emptyBag } from '../engine/core';
import { type GameAction, type GameView, RESOURCES, type ResourceBag, type TradeOffer } from '../types';
import { Board, COSTS, canPay, linkAction, pips, roadPaths } from './analysis';
import type { Brain, TurnOptions } from './types';

/**
 * Beginner: solid but simple. Rates corners by dice odds and variety, builds
 * whatever it can afford (city, then settlement), trades with the bank only
 * when that completes a purchase, and accepts trades that let it build.
 */
function cornerScore(board: Board, id: string): number {
  const hexes = board.hexesAt(id);
  return (
    hexes.reduce((n, h) => n + pips(h.number), 0) +
    new Set(hexes.filter(h => h.terrain !== 'desert').map(h => h.terrain)).size * 1.5 +
    (board.harborAt(id) ? 1.5 : 0)
  );
}

const best = (board: Board, ids: string[]) =>
  [...ids].sort((a, b) => cornerScore(board, b) - cornerScore(board, a) || a.localeCompare(b))[0]!;

/** First road or ship toward the best open corner, weighing value against distance. */
function expansionRoad(board: Board): string | undefined {
  const { view } = board;
  let choice: { edge: string; value: number } | undefined;
  for (const [vertexId, path] of roadPaths(board)) {
    if (!path.firstEdge || !board.isOpenSpot(vertexId) || !linkAction(view, path.firstEdge)) continue;
    const value = cornerScore(board, vertexId) / (1 + path.distance ** 1.5);
    if (!choice || value > choice.value) choice = { edge: path.firstEdge, value };
  }
  return choice?.edge;
}

function setupRoad(board: Board): GameAction {
  const { view } = board;
  const edges = [...view.legal.roads, ...view.legal.ships].map(id => board.edge.get(id)!);
  const reach = (e: (typeof edges)[number]) =>
    Math.max(0, ...[e.a, e.b].filter(id => !view.buildings[id]).map(id => cornerScore(board, id)));
  edges.sort((a, b) => reach(b) - reach(a));
  return linkAction(view, edges[0]!.id)!;
}

/** Does the hand pay for something it couldn't before? */
function enablesPurchase(before: ResourceBag, after: ResourceBag): boolean {
  return Object.values(COSTS).some(cost => !canPay(before, cost) && canPay(after, cost));
}

export const beginner: Brain = {
  turn(view: GameView, { builds = 0 }: TurnOptions): GameAction {
    const board = new Board(view);
    if (view.phase === 'setup-settlement')
      return { type: 'place-settlement', vertexId: best(board, view.legal.settlements) };
    if (view.phase === 'setup-road') return setupRoad(board);
    if (view.phase === 'roll') return { type: 'roll' };
    if (view.phase === 'robber') {
      const pressure = (hexId: string) => {
        const hex = board.hex.get(hexId)!;
        return hex.vertexIds.reduce((n, id) => {
          const b = view.buildings[id];
          if (!b) return n;
          const owner = view.players.find(p => p.id === b.playerId)!;
          const weight = b.playerId === view.selfId ? -5 : 1 + owner.points / 10;
          return n + weight * (b.kind === 'city' ? 2 : 1) * pips(hex.number);
        }, 0);
      };
      return { type: 'move-robber', hexId: [...view.legal.robberHexes].sort((a, b) => pressure(b) - pressure(a))[0]! };
    }
    if (view.phase === 'steal') {
      const target = view.players
        .filter(p => view.legal.stealTargets.includes(p.id))
        .sort((a, b) => b.resourceCount - a.resourceCount || b.points - a.points)[0]!;
      return { type: 'steal', playerId: target.id };
    }
    if (view.phase === 'free-roads')
      return (
        linkAction(view, expansionRoad(board) ?? view.legal.roads[0] ?? view.legal.ships[0]) ?? {
          type: 'finish-free-roads',
        }
      );
    if (view.phase !== 'build' || builds >= 2) return { type: 'end-turn' };
    if (view.legal.cities.length) return { type: 'build-city', vertexId: best(board, view.legal.cities) };
    if (view.legal.settlements.length)
      return { type: 'build-settlement', vertexId: best(board, view.legal.settlements) };

    // Exchange only when the resulting set of maritime trades can pay for a useful purchase.
    const self = view.players.find(p => p.id === view.selfId)!;
    const plans: ResourceBag[] = [];
    if (
      self.citiesLeft &&
      Object.values(view.buildings).some(b => b.playerId === view.selfId && b.kind === 'settlement')
    )
      plans.push(COSTS.city);
    if (self.settlementsLeft) plans.push(COSTS.settlement);
    if (view.developmentRemaining) plans.push(COSTS.development);
    for (const cost of plans) {
      const missing = RESOURCES.filter(r => view.hand[r] < cost[r]);
      const credits = RESOURCES.reduce(
        (n, r) => n + Math.floor(Math.max(0, view.hand[r] - cost[r]) / view.tradeRates[r]),
        0,
      );
      if (
        missing.length &&
        missing.every(r => view.bank[r]) &&
        missing.reduce((n, r) => n + cost[r] - view.hand[r], 0) <= credits
      ) {
        const give = RESOURCES.find(r => view.hand[r] - cost[r] >= view.tradeRates[r])!;
        return { type: 'trade', give, receive: missing[0]! };
      }
    }
    if (view.developmentRemaining && canPay(view.hand, COSTS.development)) return { type: 'buy-development' };
    const link = linkAction(view, expansionRoad(board));
    if (link) return link;
    return { type: 'end-turn' };
  },

  discard(view: GameView): GameAction {
    const hand = { ...view.hand };
    const bag = emptyBag();
    for (let i = 0; i < (view.pendingDiscards[view.selfId] ?? 0); i++) {
      const resource = [...RESOURCES].sort((a, b) => hand[b] - hand[a])[0]!;
      hand[resource]--;
      bag[resource]++;
    }
    return { type: 'discard', resources: bag };
  },

  respond(view: GameView, offer: TradeOffer): GameAction {
    const after = { ...view.hand };
    for (const r of RESOURCES) after[r] += offer.give[r] - offer.want[r];
    const affordable = RESOURCES.every(r => after[r] >= 0);
    return affordable && enablesPurchase(view.hand, after)
      ? { type: 'accept-trade', offerId: offer.id }
      : { type: 'decline-trade', offerId: offer.id };
  },

  review(view: GameView, offer: TradeOffer): GameAction {
    const partner = offer.acceptedBy[0];
    if (partner) return { type: 'confirm-trade', offerId: offer.id, playerId: partner };
    const good = offer.counters.find(counter => {
      const after = { ...view.hand };
      for (const r of RESOURCES) after[r] += counter.give[r] - counter.want[r];
      return RESOURCES.every(r => after[r] >= 0) && enablesPurchase(view.hand, after);
    });
    return good
      ? { type: 'accept-counter', offerId: offer.id, counterId: good.id }
      : { type: 'cancel-trade', offerId: offer.id };
  },
};
