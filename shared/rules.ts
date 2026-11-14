import { shuffled } from './board';
import { routeFinished } from './maps/special';
import { boardIndex } from './seafaring';
import {
  type DevelopmentCard,
  type DevelopmentType,
  type Edge,
  type GameSettings,
  type GameState,
  type Hex,
  RESOURCES,
  type Resource,
  type ResourceBag,
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
  // Cartographers: a relay station built on a harbor's edge uses that harbor too.
  const relayCorners = new Set(
    (state.relays ?? [])
      .filter(id => state.roads[id] === playerId)
      .map(id => boardIndex(state.board).edge.get(id))
      .map(edge => (edge ? [edge.a, edge.b].sort().join(':') : '')),
  );
  const owned = state.board.harbors.filter(
    port =>
      port.vertices.some(id => state.buildings[id]?.playerId === playerId) ||
      relayCorners.has([...port.vertices].sort().join(':')),
  );
  return Object.fromEntries(
    RESOURCES.map(resource => [
      resource,
      owned.some(p => p.resource === resource) ? 2 : owned.some(p => p.resource === 'any') ? 3 : 4,
    ]),
  ) as Record<Resource, number>;
}

/**
 * How many cards a bank trade buys, or null when it doesn't fit the rates. Each kind given must be
 * a whole multiple of its rate (each multiple buys one card), so one trade can mix harbors:
 * 2 sheep + 3 ore at 2:1 and 3:1 buy two cards. Nothing may be both given and received.
 */
export function bankTradeSize(give: ResourceBag, receive: ResourceBag, rates: Record<Resource, number>): number | null {
  let bought = 0;
  let wanted = 0;
  for (const r of RESOURCES) {
    if (give[r] && receive[r]) return null;
    if (give[r] % rates[r]) return null;
    bought += give[r] / rates[r];
    wanted += receive[r];
  }
  return bought > 0 && bought === wanted ? bought : null;
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
  // Only this player's routes, found by id: scanning every edge for every player after every move
  // was one of the largest costs of a turn.
  const edgeById = boardIndex(state.board).edge;
  const incident = new Map<string, Edge[]>();
  const add = (routes: Record<string, string> | undefined) => {
    for (const id in routes) {
      if (routes[id] !== playerId) continue;
      const edge = edgeById.get(id);
      if (!edge) continue;
      for (const v of [edge.a, edge.b]) {
        const list = incident.get(v);
        if (list) list.push(edge);
        else incident.set(v, [edge]);
      }
    }
  };
  add(state.roads);
  add(state.ships);
  const anywhere = linksAnywhere(state);
  const walk = (vertex: string, used: Set<string>, kind: 'road' | 'ship' | null): number => {
    const building = state.buildings[vertex];
    if (used.size && building && building.playerId !== playerId) return 0;
    let best = 0;
    for (const edge of incident.get(vertex) ?? []) {
      if (used.has(edge.id)) continue;
      const next = own(edge.id)!;
      if (kind && next !== kind && building?.playerId !== playerId && !anywhere) continue;
      used.add(edge.id);
      best = Math.max(best, 1 + walk(edge.a === vertex ? edge.b : edge.a, used, next));
      used.delete(edge.id);
    }
    return best;
  };
  let longest = 0;
  for (const vertex of incident.keys()) longest = Math.max(longest, walk(vertex, new Set(), null));
  return longest;
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
  // A survey ship is worth a point (Cartographers).
  const surveys = (state.surveys ?? []).filter(id => state.ships[id] === playerId).length;
  return structures + surveys + cards + awards + (state.bonusPoints?.[playerId] ?? 0) + routePoints(state, playerId);
}

/** Points for building in your route's finish area, on maps that give them. */
export function routePoints(state: Pick<GameState, 'board' | 'buildings' | 'routeOf'>, playerId: string): number {
  const points = state.board.rules?.routeGoal?.points ?? 0;
  if (!points) return 0;
  return routeFinished(state.board, state.buildings, playerId, state.routeOf?.[playerId]) ? points : 0;
}

/** Every number a tile pays on: its own, then any a survey ship charted (Cartographers). */
export function hexNumbers(hex: Pick<Hex, 'number' | 'extra'>): number[] {
  return hex.number === null ? [] : [hex.number, ...(hex.extra ?? [])];
}

/** A tile holds at most this many numbers. */
export const MAX_HEX_NUMBERS = 3;

/** How close to 7 a tile's nth number (0-based) may get: the first stops at 6/8, the second 5/9, the third 4/10. */
const chartLimit = (index: number) => index + 1;

/**
 * One chart: the first number not yet at its limit moves one step toward 7 (5 → 6, 12 → 11); when
 * all are at their limits a new number joins on the first one's side (a 6 adds a 2, an 8 a 12).
 * A fully charted tile reads 6, 5, 4 or 8, 9, 10. Null when the tile is full.
 */
export function chartedNumbers(numbers: readonly number[]): number[] | null {
  const moving = numbers.findIndex((n, i) => Math.abs(n - 7) > chartLimit(i));
  if (moving >= 0) return numbers.map((n, i) => (i !== moving ? n : n < 7 ? n + 1 : n - 1));
  if (!numbers.length || numbers.length >= MAX_HEX_NUMBERS) return null;
  return [...numbers, numbers[0]! < 7 ? 2 : 12];
}

/** Has this recipient answered the offer (yes, no, or a counter)? */
export function hasAnswered(offer: TradeOffer, playerId: string): boolean {
  return (
    offer.acceptedBy.includes(playerId) ||
    offer.declinedBy.includes(playerId) ||
    offer.counters.some(c => c.fromId === playerId)
  );
}
