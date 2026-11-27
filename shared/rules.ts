import { type IslandSize, shuffled } from './board';
import { crosses, ownEdges, pieceOn } from './crossings';
import { CHOICE_SECONDS, DEFAULT_SETTINGS } from './default-settings';
import { type KnightsBoard, knightsPoints } from './knights';
import { routeFinished } from './maps/special';
import { boardIndex, terrainResource } from './seafaring';
import {
  COMMODITIES,
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

/** Phases where the person moving is on the clock with a choice to make, so more time helps them. */
const GIVE_TIME_PHASES: readonly GameState['phase'][] = [
  'setup-settlement',
  'setup-road',
  'robber',
  'steal',
  'free-roads',
  'build',
  'special-build',
  'santa',
  'place-knight',
];

/** Phases where others choose cards on a short clock of their own while the turn clock holds. */
export const CHOICE_CLOCKS = {
  discard: 'discardDeadline',
  gift: 'discardDeadline',
  gold: 'goldDeadline',
  candy: 'candyDeadline',
} as const satisfies Partial<Record<GameState['phase'], keyof GameState>>;

type ClockTable = Pick<
  GameState,
  | 'phase'
  | 'pausedAt'
  | 'turnDeadline'
  | 'turnHeldAt'
  | 'pendingDiscards'
  | 'pendingGold'
  | 'candyLoad'
  | 'discardDeadline'
  | 'goldDeadline'
  | 'candyDeadline'
> & { players: readonly { id: string; bot?: unknown }[]; ck?: { gifts: Record<string, number> } | null };

const owing = (counts: Record<string, number> | undefined) =>
  Object.keys(counts ?? {}).filter(id => (counts?.[id] ?? 0) > 0);

/** Who more time would help now: the person moving, or those choosing discards, gold, gifts, or candy. */
export function timedChoosers(game: ClockTable, activeId: string | null): string[] {
  const choosers = (() => {
    if (game.phase === 'discard') return owing(game.pendingDiscards);
    if (game.phase === 'gold') return owing(game.pendingGold);
    if (game.phase === 'gift') return owing(game.ck?.gifts);
    if (game.phase === 'candy') return game.candyLoad?.picks[0] ? [game.candyLoad.picks[0].playerId] : [];
    return GIVE_TIME_PHASES.includes(game.phase) && activeId ? [activeId] : [];
  })();
  return choosers.filter(id => game.players.some(p => p.id === id && !p.bot));
}

/** Whether the clock those choosers are on is running, so added time means something. */
function clockRunning(game: ClockTable): boolean {
  const choice = CHOICE_CLOCKS[game.phase as keyof typeof CHOICE_CLOCKS];
  if (choice) return game[choice] !== null;
  return game.turnDeadline !== null && game.turnHeldAt === null;
}

/** Whether `giverId` may add time for the people choosing now: never to bots or themselves. */
export function canGiveTime(game: ClockTable, activeId: string | null, giverId: string): boolean {
  const choosers = timedChoosers(game, activeId);
  return (
    choosers.length > 0 &&
    !choosers.includes(giverId) &&
    game.players.some(p => p.id === giverId) &&
    game.pausedAt === null &&
    clockRunning(game)
  );
}

/** Milliseconds a short choice gets in this room: CHOICE_SECONDS scaled by its short-choice time. */
export function choiceMs(settings: Pick<GameSettings, 'decisionSeconds'>, choice: ShortChoice): number {
  return CHOICE_SECONDS[choice] * 1000 * (settings.decisionSeconds / DEFAULT_SETTINGS.decisionSeconds);
}
export type ShortChoice = Exclude<keyof typeof CHOICE_SECONDS, 'specialBuild'>;

/** How many times longer clocks run for these people: double when any of them has double time. */
export function timeFactor(
  players: readonly { id: string; bot?: unknown; doubleTime?: boolean }[],
  ids: readonly (string | null | undefined)[],
): number {
  return players.some(p => ids.includes(p.id) && p.doubleTime && !p.bot) ? 2 : 1;
}

/** Development cards by island: 25 for 2–4 players, 34 for 5–6, 43 for 7–8. */
const DECKS: Record<IslandSize, { knight: number; progress: number; points: number }> = {
  standard: { knight: 14, progress: 2, points: 5 },
  large: { knight: 20, progress: 3, points: 5 },
  huge: { knight: 26, progress: 4, points: 5 },
};

/** The shuffled development deck for the table's island. */
export function developmentDeck(random: () => number, size: IslandSize = 'standard'): DevelopmentCard[] {
  const deck = DECKS[size];
  const kinds: DevelopmentType[] = [
    ...Array<DevelopmentType>(deck.knight).fill('knight'),
    ...Array<DevelopmentType>(deck.points).fill('victory-point'),
    ...Array<DevelopmentType>(deck.progress).fill('road-building'),
    ...Array<DevelopmentType>(deck.progress).fill('year-of-plenty'),
    ...Array<DevelopmentType>(deck.progress).fill('monopoly'),
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
  const rates = Object.fromEntries(
    RESOURCES.map(resource => [
      resource,
      owned.some(p => p.resource === resource) ? 2 : owned.some(p => p.resource === 'any') ? 3 : 4,
    ]),
  ) as Record<Resource, number>;
  return state.ck ? knightsRates(state, playerId, rates) : rates;
}

/**
 * Cities & Knights trades 2:1: commodities with a trading house (trade level 3), the merchant's
 * tile resource for whoever placed it, and the Merchant Fleet's card kind this turn.
 */
function knightsRates(state: GameState, playerId: string, rates: Record<Resource, number>): Record<Resource, number> {
  const ck = state.ck!;
  if ((ck.improvements[playerId]?.trade ?? 0) >= 3) for (const c of COMMODITIES) rates[c] = 2;
  if (ck.merchant?.playerId === playerId) {
    const hex = boardIndex(state.board).hex.get(ck.merchant.hexId);
    const resource = hex && terrainResource(hex.terrain);
    if (resource) rates[resource] = 2;
  }
  const active = state.players[state.turnIndex]?.id;
  if (ck.fleet && active === playerId) rates[ck.fleet] = 2;
  return rates;
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
  state: Pick<GameState, 'board' | 'roads' | 'ships' | 'buildings' | 'settings'> &
    Partial<Pick<GameState, 'crossings' | 'routeOf'>> & { ck?: { knights: KnightsBoard['knights'] } | null },
  playerId: string,
): number {
  const knights = state.ck?.knights;
  const own = (id: string) => pieceOn(state, playerId, id);
  // Only this player's routes, found by id: scanning every edge for every player after every move
  // was one of the largest costs of a turn.
  const edgeById = boardIndex(state.board).edge;
  const incident = new Map<string, Edge[]>();
  for (const id of ownEdges(state, playerId)) {
    const edge = edgeById.get(id);
    if (!edge) continue;
    for (const v of [edge.a, edge.b]) {
      const list = incident.get(v);
      if (list) list.push(edge);
      else incident.set(v, [edge]);
    }
  }
  const anywhere = linksAnywhere(state);
  const walk = (vertex: string, used: Set<string>, kind: 'road' | 'ship' | null): number => {
    const building = state.buildings[vertex];
    if (used.size && building && building.playerId !== playerId && !crosses(state, playerId, building.playerId))
      return 0;
    // Cities & Knights: another player's knight breaks a route like a building.
    const knight = knights?.[vertex];
    if (used.size && knight && knight.playerId !== playerId) return 0;
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
  // Cities & Knights has no development cards, so no Largest Army.
  state.largestArmyId = state.ck
    ? null
    : award(state.largestArmyId, 3, id => state.players.find(p => p.id === id)!.knights);
}

export function victoryPoints(state: GameState, playerId: string, hidden = true): number {
  const structures = Object.values(state.buildings)
    .filter(b => b.playerId === playerId)
    .reduce((sum, b) => sum + (b.kind === 'city' ? 2 : 1), 0);
  const cards = hidden
    ? (state.players.find(p => p.id === playerId)?.development.filter(c => c.kind === 'victory-point').length ?? 0)
    : 0;
  const awards = (state.longestRoadId === playerId ? 2 : 0) + (state.largestArmyId === playerId ? 2 : 0);
  const bonus = state.bonusPoints?.[playerId] ?? 0;
  return (
    structures +
    cards +
    awards +
    bonus +
    // A megacity is a city worth one point more.
    megacityCount(state, playerId) +
    routePoints(state, playerId) +
    knightsPoints({ buildings: state.buildings, ck: state.ck ?? null }, playerId)
  );
}

/** Points for building in your route's finish area, on maps that give them. */
export function routePoints(state: Pick<GameState, 'board' | 'buildings' | 'routeOf'>, playerId: string): number {
  const points = state.board.rules?.routeGoal?.points ?? 0;
  if (!points) return 0;
  return routeFinished(state.board, state.buildings, playerId, state.routeOf?.[playerId]) ? points : 0;
}

/** Every number a tile pays on: its own, then any charted onto it (Cartographers). */
export function hexNumbers(hex: Pick<Hex, 'number' | 'extra'>): number[] {
  return hex.number === null ? [] : [hex.number, ...(hex.extra ?? [])];
}

/**
 * The numbers a tile pays (and a volcano erupts) on. The robber blocks only the most likely one,
 * so a robbed 6, 5, 4 tile still pays on 5 and 4; an uncharted tile pays nothing under it.
 */
export function payingNumbers(hex: Pick<Hex, 'number' | 'extra'>, robbed: boolean): number[] {
  const numbers = hexNumbers(hex);
  if (!robbed || !numbers.length) return numbers;
  const odds = (n: number) => -Math.abs(n - 7);
  const blocked = numbers.reduce((best, n, i) => (odds(n) > odds(numbers[best]!) ? i : best), 0);
  return numbers.filter((_, i) => i !== blocked);
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

/** How many charts a tile still takes to be full (0 when it is). */
export function chartsLeft(numbers: readonly number[]): number {
  let left = 0;
  for (let next = chartedNumbers(numbers); next; next = chartedNumbers(next)) left++;
  return left;
}

/** Fewest numbers a tile beside a city needs before that city may become a megacity. */
export const MEGACITY_NUMBERS = 2;

/** A tile charted to at least two numbers (6-2, 8-12, 3-5-6 …): cities beside it may become megacities. */
export const megacityTile = (hex: Pick<Hex, 'number' | 'extra'>) => hexNumbers(hex).length >= MEGACITY_NUMBERS;

/**
 * Corners where this player's city may become a megacity: not one already, and beside a tile with
 * two or more numbers (Cartographers).
 */
export function megacitySpots(
  state: Pick<GameState, 'board' | 'buildings' | 'megacities'>,
  playerId: string,
): string[] {
  const index = boardIndex(state.board);
  return Object.entries(state.buildings)
    .filter(([vertexId, b]) => b.playerId === playerId && b.kind === 'city' && !state.megacities.includes(vertexId))
    .filter(([vertexId]) => index.vertex.get(vertexId)!.hexIds.some(id => megacityTile(index.hex.get(id)!)))
    .map(([vertexId]) => vertexId);
}

/** This player's megacities. */
export const megacityCount = (state: Pick<GameState, 'buildings' | 'megacities'>, playerId: string) =>
  (state.megacities ?? []).filter(id => state.buildings[id]?.playerId === playerId).length;

/** Has this recipient answered the offer (yes, no, or a counter)? */
export function hasAnswered(offer: TradeOffer, playerId: string): boolean {
  return (
    offer.acceptedBy.includes(playerId) ||
    offer.declinedBy.includes(playerId) ||
    offer.counters.some(c => c.fromId === playerId)
  );
}
