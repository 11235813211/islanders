import { shuffled } from './board';
import {
  type DevelopmentCard,
  type DevelopmentType,
  type GameSettings,
  type GameState,
  RESOURCES,
  type Resource,
  type TradeOffer,
} from './types';

/** The shuffled development deck: 25 cards, or 34 for five and six players. */
export function developmentDeck(random: () => number, large = false): DevelopmentCard[] {
  const kinds: DevelopmentType[] = [
    ...Array<DevelopmentType>(large ? 20 : 14).fill('knight'),
    ...Array<DevelopmentType>(5).fill('victory-point'),
    ...Array<DevelopmentType>(large ? 3 : 2).fill('road-building'),
    ...Array<DevelopmentType>(large ? 3 : 2).fill('year-of-plenty'),
    ...Array<DevelopmentType>(large ? 3 : 2).fill('monopoly'),
  ];
  return shuffled(kinds, random).map((kind, i) => ({ id: `dev-${i}`, kind, boughtTurn: -1 }));
}

export function tradeRates(state: GameState, playerId: string): Record<Resource, number> {
  const owned = state.board.harbors.filter(port =>
    port.vertices.some(id => state.buildings[id]?.playerId === playerId),
  );
  return Object.fromEntries(
    RESOURCES.map(resource => [
      resource,
      owned.some(p => p.resource === resource) ? 2 : owned.some(p => p.resource === 'any') ? 3 : 4,
    ]),
  ) as Record<Resource, number>;
}

/**
 * Longest trade route: a trail of roads and ships that never repeats an edge. Opponent buildings
 * break it, and it may switch between road and ship only at its owner's settlement or city.
 */
/**
 * Roads and ships join at any corner of your route (the room default), or, under the published
 * Seafarers rule, only at your own settlement or city.
 */
export const linksAnywhere = (state: { settings: Pick<GameSettings, 'routeLinks'> }): boolean =>
  state.settings.routeLinks !== 'settlement';

/** A player's longest route. Takes a view too (bots try out roads with it). */
export function longestRoad(
  state: Pick<GameState, 'board' | 'roads' | 'ships' | 'buildings' | 'settings'>,
  playerId: string,
): number {
  const own = (id: string): 'road' | 'ship' | null =>
    state.roads[id] === playerId ? 'road' : state.ships?.[id] === playerId ? 'ship' : null;
  const edges = state.board.edges.filter(edge => own(edge.id));
  const incident = new Map<string, typeof edges>();
  for (const edge of edges) for (const id of [edge.a, edge.b]) incident.set(id, [...(incident.get(id) ?? []), edge]);
  const walk = (vertex: string, used: Set<string>, kind: 'road' | 'ship' | null): number => {
    const building = state.buildings[vertex];
    if (used.size && building && building.playerId !== playerId) return 0;
    let best = 0;
    for (const edge of incident.get(vertex) ?? []) {
      if (used.has(edge.id)) continue;
      const next = own(edge.id)!;
      if (kind && next !== kind && building?.playerId !== playerId && !linksAnywhere(state)) continue;
      used.add(edge.id);
      best = Math.max(best, 1 + walk(edge.a === vertex ? edge.b : edge.a, used, next));
      used.delete(edge.id);
    }
    return best;
  };
  return Math.max(0, ...[...incident.keys()].map(vertex => walk(vertex, new Set(), null)));
}

export function updateAwards(state: GameState): void {
  const award = (holder: string | null, threshold: number, score: (id: string) => number) => {
    const scores = state.players.map(p => ({ id: p.id, score: score(p.id) }));
    const maximum = Math.max(threshold, ...scores.map(p => p.score));
    const tied = scores.filter(p => p.score === maximum);
    return tied.some(p => p.id === holder) ? holder : tied.length === 1 ? tied[0].id : null;
  };
  state.longestRoadId = award(state.longestRoadId, 5, id => longestRoad(state, id));
  state.largestArmyId = award(state.largestArmyId, 3, id => state.players.find(p => p.id === id)!.knights);
}

export function victoryPoints(state: GameState, playerId: string, hidden = true): number {
  const structures = Object.values(state.buildings)
    .filter(b => b.playerId === playerId)
    .reduce((sum, b) => sum + (b.kind === 'city' ? 2 : 1), 0);
  const cards = hidden
    ? (state.players.find(p => p.id === playerId)?.development.filter(c => c.kind === 'victory-point').length ?? 0)
    : 0;
  const awards = (state.longestRoadId === playerId ? 2 : 0) + (state.largestArmyId === playerId ? 2 : 0);
  return structures + cards + awards + (state.bonusPoints?.[playerId] ?? 0);
}

/** Has this recipient answered the offer (yes, no, or a counter)? */
export function hasAnswered(offer: TradeOffer, playerId: string): boolean {
  return (
    offer.acceptedBy.includes(playerId) ||
    offer.declinedBy.includes(playerId) ||
    offer.counters.some(c => c.fromId === playerId)
  );
}
