import { shuffled } from './board';
import { RESOURCES, type DevelopmentCard, type DevelopmentType, type GameState, type Resource } from './types';

export function developmentDeck(random: () => number): DevelopmentCard[] {
  const kinds: DevelopmentType[] = [
    ...Array<DevelopmentType>(14).fill('knight'), ...Array<DevelopmentType>(5).fill('victory-point'),
    ...Array<DevelopmentType>(2).fill('road-building'), ...Array<DevelopmentType>(2).fill('year-of-plenty'), ...Array<DevelopmentType>(2).fill('monopoly'),
  ];
  return shuffled(kinds, random).map((kind, i) => ({ id: `dev-${i}`, kind, boughtTurn: -1 }));
}

export function tradeRates(state: GameState, playerId: string): Record<Resource, number> {
  const owned = state.board.harbors.filter(port => port.vertices.some(id => state.buildings[id]?.playerId === playerId));
  return Object.fromEntries(RESOURCES.map(resource => [resource, owned.some(p => p.resource === resource) ? 2 : owned.some(p => p.resource === 'any') ? 3 : 4])) as Record<Resource, number>;
}

/** Longest edge trail. Edges may not repeat; branches and opponent buildings break continuity. */
export function longestRoad(state: GameState, playerId: string): number {
  const edges = state.board.edges.filter(edge => state.roads[edge.id] === playerId);
  const incident = new Map<string, typeof edges>();
  for (const edge of edges) for (const id of [edge.a, edge.b]) incident.set(id, [...(incident.get(id) ?? []), edge]);
  const walk = (vertex: string, used: Set<string>): number => {
    if (used.size && state.buildings[vertex] && state.buildings[vertex].playerId !== playerId) return 0;
    let best = 0;
    for (const edge of incident.get(vertex) ?? []) {
      if (used.has(edge.id)) continue;
      used.add(edge.id);
      best = Math.max(best, 1 + walk(edge.a === vertex ? edge.b : edge.a, used));
      used.delete(edge.id);
    }
    return best;
  };
  return Math.max(0, ...[...incident.keys()].map(vertex => walk(vertex, new Set())));
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
  const structures = Object.values(state.buildings).filter(b => b.playerId === playerId).reduce((sum, b) => sum + (b.kind === 'city' ? 2 : 1), 0);
  const cards = hidden ? state.players.find(p => p.id === playerId)?.development.filter(c => c.kind === 'victory-point').length ?? 0 : 0;
  return structures + cards + (state.longestRoadId === playerId ? 2 : 0) + (state.largestArmyId === playerId ? 2 : 0);
}
