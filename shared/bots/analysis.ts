import { emptyBag } from '../engine/core';
import {
  boardIndex,
  isLandVertex,
  islandBonus,
  isRoadEdge,
  isShipEdge,
  terrainResource,
  vertexIsland,
} from '../seafaring';
import { type GameAction, type GameView, type Hex, RESOURCES, type Resource, type ResourceBag } from '../types';

/**
 * Read-only helpers bots use to judge a position. Everything here works from a
 * GameView, so bots only ever see what a person in that seat could see.
 */

export const COSTS = {
  road: { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 0 },
  city: { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 3 },
  development: { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1 },
} satisfies Record<string, ResourceBag>;
export type Goal = keyof typeof COSTS;

/** Number of dice combinations (out of 36) that roll this number. */
export const pips = (n: number | null) => (n ? 6 - Math.abs(7 - n) : 0);

export class Board {
  readonly hex: Map<string, Hex>;
  readonly vertex: Map<string, GameView['board']['vertices'][number]>;
  readonly edge: Map<string, GameView['board']['edges'][number]>;
  constructor(readonly view: GameView) {
    // Shared lookup tables, cached per board (boards are shared between states and views).
    const index = boardIndex(view.board);
    this.hex = index.hex;
    this.vertex = index.vertex;
    this.edge = index.edge;
  }

  hexesAt(vertexId: string): Hex[] {
    return this.vertex.get(vertexId)!.hexIds.map(id => this.hex.get(id)!);
  }

  /** Expected cards per 36 rolls from one settlement on this corner. The robber's hex counts for little. */
  yieldAt(vertexId: string): ResourceBag {
    const bag = emptyBag();
    for (const hex of this.hexesAt(vertexId)) {
      const share = pips(hex.number) * (hex.id === this.view.robber ? 0.3 : 1);
      const resource = terrainResource(hex.terrain);
      // Gold and volcanoes pay whatever is needed: count them as a little of everything.
      if (resource) bag[resource] += share;
      else if (hex.terrain === 'gold' || hex.terrain === 'volcano') for (const r of RESOURCES) bag[r] += share / 4;
    }
    return bag;
  }

  /** Pips per resource across a player's buildings (cities count double). */
  production(playerId: string): ResourceBag {
    const bag = emptyBag();
    for (const [vertexId, building] of Object.entries(this.view.buildings)) {
      if (building.playerId !== playerId) continue;
      const y = this.yieldAt(vertexId);
      for (const r of RESOURCES) bag[r] += y[r] * (building.kind === 'city' ? 2 : 1);
    }
    return bag;
  }

  neighbors(vertexId: string): string[] {
    return this.vertex.get(vertexId)!.edgeIds.map(id => {
      const e = this.edge.get(id)!;
      return e.a === vertexId ? e.b : e.a;
    });
  }

  /** Open corner where nobody can build yet only because it isn't connected (distance rule satisfied). */
  isOpenSpot(vertexId: string): boolean {
    return !this.view.buildings[vertexId] && !this.neighbors(vertexId).some(n => this.view.buildings[n]);
  }

  harborAt(vertexId: string): Resource | 'any' | null {
    return this.view.board.harbors.find(h => h.vertices.includes(vertexId))?.resource ?? null;
  }
}

/** How much this bot wants each resource: more for what it produces least. */
export function resourceWeights(board: Board, selfId: string): ResourceBag {
  const production = board.production(selfId);
  const base: ResourceBag = { wood: 1, brick: 1, sheep: 0.85, wheat: 1.1, ore: 1.05 };
  const weights = emptyBag();
  for (const r of RESOURCES) weights[r] = base[r] * (1.6 - Math.min(1, production[r] / 10));
  return weights;
}

/** Tunable parts of corner scoring (see tests/bots.test.ts for the tuning report). */
export interface SpotTuning {
  variety: number;
  harbor: number;
}
export const DEFAULT_SPOT_TUNING: SpotTuning = { variety: 1.2, harbor: 1 };

/** Value of settling a corner, given what the bot already produces. */
export function spotValue(board: Board, vertexId: string, weights: ResourceBag, tuning = DEFAULT_SPOT_TUNING): number {
  const y = board.yieldAt(vertexId);
  const kinds = RESOURCES.filter(r => y[r] > 0).length;
  let value = RESOURCES.reduce((sum, r) => sum + y[r] * weights[r], 0) + kinds * tuning.variety;
  const harbor = board.harborAt(vertexId);
  const production = board.production(board.view.selfId);
  if (harbor === 'any') value += 1.5 * tuning.harbor;
  else if (harbor) value += (production[harbor] + y[harbor] >= 6 ? 3 : 0.8) * tuning.harbor;
  return value;
}

type Link = 'road' | 'ship';
export interface Path {
  distance: number;
  firstEdge: string | null;
  /** Whether the first new piece is a road or a ship (a coast edge could take either). */
  firstKind: Link | null;
}

/**
 * Cheapest new roads and ships from a player's network (this bot's by default) to every reachable
 * corner. Roads continue roads and ships continue ships; they only meet at the player's own
 * settlement or city, and new ships never go beside the pirate.
 */
export function roadPaths(board: Board, self = board.view.selfId): Map<string, Path> {
  // One search per view and seat: a single decision asks for these many times.
  let forView = pathCache.get(board.view);
  if (!forView) {
    forView = new Map();
    pathCache.set(board.view, forView);
  }
  let paths = forView.get(self);
  if (!paths) {
    paths = searchPaths(board, self);
    forView.set(self, paths);
  }
  return paths;
}

const pathCache = new WeakMap<GameView, Map<string, Map<string, Path>>>();

function searchPaths(board: Board, self: string): Map<string, Path> {
  const { view } = board;
  const best = new Map<string, Path>();
  const seen = { road: new Map<string, number>(), ship: new Map<string, number>() };
  // 0-1 BFS deque: free steps (own routes) go to the front, new pieces to the back.
  type Entry = { vertex: string; mode: Link; path: Path };
  const front: Entry[] = [];
  const back: Entry[] = [];
  let backHead = 0;
  const visit = (vertex: string, mode: Link, path: Path, free: boolean) => {
    const seenMode = seen[mode];
    if ((seenMode.get(vertex) ?? Infinity) <= path.distance) return;
    seenMode.set(vertex, path.distance);
    if (path.distance < (best.get(vertex)?.distance ?? Infinity)) best.set(vertex, path);
    if (free) front.push({ vertex, mode, path });
    else back.push({ vertex, mode, path });
  };
  const start: Path = { distance: 0, firstEdge: null, firstKind: null };
  for (const v of view.board.vertices) {
    const own = view.buildings[v.id]?.playerId === self;
    if (own || (!view.buildings[v.id] && v.edgeIds.some(id => view.roads[id] === self)))
      visit(v.id, 'road', start, true);
    if (own || (!view.buildings[v.id] && v.edgeIds.some(id => view.ships[id] === self)))
      visit(v.id, 'ship', start, true);
  }
  const besidePirate = (edgeId: string) => {
    const e = board.edge.get(edgeId)!;
    return !!view.pirate && [e.a, e.b].every(v => board.vertex.get(v)!.hexIds.includes(view.pirate!));
  };
  // 0-1 BFS over (corner, kind of route arriving there).
  while (front.length || backHead < back.length) {
    const { vertex, mode, path } = front.length ? front.pop()! : back[backHead++]!;
    const building = view.buildings[vertex];
    if (building && building.playerId !== self) continue;
    const kinds: Link[] = building ? ['road', 'ship'] : [mode];
    for (const edgeId of board.vertex.get(vertex)!.edgeIds) {
      const e = board.edge.get(edgeId)!;
      const other = e.a === vertex ? e.b : e.a;
      for (const kind of kinds) {
        const owner = kind === 'road' ? view.roads[edgeId] : view.ships[edgeId];
        if (owner && owner !== self) continue;
        if (!owner) {
          if (view.roads[edgeId] || view.ships[edgeId]) continue;
          if (kind === 'road' && !isRoadEdge(view.board, edgeId)) continue;
          if (kind === 'ship' && (!view.seafaring || !isShipEdge(view.board, edgeId) || besidePirate(edgeId))) continue;
        }
        const cost = owner ? 0 : 1;
        const first = path.firstEdge ?? (cost ? edgeId : null);
        visit(
          other,
          kind,
          { distance: path.distance + cost, firstEdge: first, firstKind: path.firstKind ?? (cost ? kind : null) },
          !cost,
        );
      }
    }
  }
  return best;
}

/** Bonus points for settling here: an island this bot has no building on yet that carries a chip. */
export function islandBonusAt(board: Board, vertexId: string): number {
  const { view } = board;
  const island = vertexIsland(view.board, vertexId);
  if (island === null) return 0;
  const bonus = islandBonus(view.board, island);
  if (!bonus) return 0;
  const settled = Object.entries(view.buildings).some(
    ([v, b]) => b.playerId === view.selfId && vertexIsland(view.board, v) === island,
  );
  return settled ? 0 : bonus;
}

/** How far bots look for a new corner: further on sea maps, where islands lie across the water. */
export const expansionReach = (view: GameView, near: number) => (view.seafaring ? near + 2 : near);

/** Best place to expand toward: an open spot (plus any island bonus) weighed against the pieces it needs. */
export function expansionTarget(
  board: Board,
  weights: ResourceBag,
  maxDistance = 4,
): ({ vertexId: string; value: number } & Path) | null {
  let best: ({ vertexId: string; value: number } & Path) | null = null;
  const reach = expansionReach(board.view, maxDistance);
  for (const [vertexId, path] of roadPaths(board)) {
    if (path.distance === 0 || path.distance > reach || !board.isOpenSpot(vertexId)) continue;
    if (!isLandVertex(board.view.board, vertexId)) continue;
    const worth = spotValue(board, vertexId, weights) + islandBonusAt(board, vertexId) * 6;
    const value = worth / (1 + path.distance ** 1.5 * 0.35);
    if (!best || value > best.value) best = { vertexId, ...path, value };
  }
  return best;
}

/** Expected turns until the bot can pay `cost`, counting all players' rolls and bank trades. */
export function turnsToAfford(view: GameView, production: ResourceBag, cost: ResourceBag): number {
  const rollsPerRound = view.players.length;
  let shortfall = 0;
  let surplusCredit = 0;
  let turns = 0;
  for (const r of RESOURCES) {
    const missing = cost[r] - view.hand[r];
    if (missing <= 0) surplusCredit += Math.floor(-missing / view.tradeRates[r]);
    else {
      shortfall += missing;
      const perRound = (production[r] / 36) * rollsPerRound;
      turns = Math.max(turns, missing / Math.max(perRound, 0.08));
    }
  }
  if (shortfall && surplusCredit >= shortfall) return 0.5;
  return Math.min(turns, 30);
}

/** Guess opponents' hands from public info: card count spread by what they produce. */
export function estimateHand(board: Board, playerId: string): ResourceBag {
  const player = board.view.players.find(p => p.id === playerId)!;
  const production = board.production(playerId);
  const total = RESOURCES.reduce((sum, r) => sum + production[r] + 1, 0);
  const bag = emptyBag();
  for (const r of RESOURCES) bag[r] = (player.resourceCount * (production[r] + 1)) / total;
  return bag;
}

export const missingFor = (hand: ResourceBag, cost: ResourceBag): Resource[] =>
  RESOURCES.filter(r => hand[r] < cost[r]);
export const canPay = (hand: ResourceBag, cost: ResourceBag) => RESOURCES.every(r => hand[r] >= cost[r]);
export const bagValue = (bag: ResourceBag, weights: ResourceBag) =>
  RESOURCES.reduce((sum, r) => sum + bag[r] * weights[r], 0);

/** Number of this bot's log entries in the current turn that match `kinds` (e.g. offers made). */
export function eventsThisTurn(view: GameView, kinds: string[]): number {
  return view.log.filter(
    entry =>
      entry.turn === view.turn &&
      entry.event &&
      kinds.includes(entry.event.kind) &&
      ('playerId' in entry.event ? entry.event.playerId === view.selfId : false),
  ).length;
}

/** Build a road or ship on this edge, whichever is legal right now (`prefer` first, else road first). */
export function linkAction(
  view: GameView,
  edgeId: string | null | undefined,
  prefer: 'road' | 'ship' | null = null,
): GameAction | null {
  if (!edgeId) return null;
  if (prefer === 'ship' && view.legal.ships.includes(edgeId))
    return { type: view.phase === 'setup-road' ? 'place-ship' : 'build-ship', edgeId };
  if (view.legal.roads.includes(edgeId))
    return { type: view.phase === 'setup-road' ? 'place-road' : 'build-road', edgeId };
  if (view.legal.ships.includes(edgeId))
    return { type: view.phase === 'setup-road' ? 'place-ship' : 'build-ship', edgeId };
  return null;
}

/** Resources from gold: what a city or settlement still needs, spread over different kinds. */
export function goldChoice(view: GameView): GameAction {
  const owed = view.pendingGold[view.selfId] ?? 0;
  const need = (r: Resource) =>
    Math.max(0, COSTS.city[r] - view.hand[r]) + Math.max(0, COSTS.settlement[r] - view.hand[r]) * 1.2;
  const ranked = RESOURCES.filter(r => view.bank[r]).sort((a, b) => need(b) - need(a) || view.hand[a] - view.hand[b]);
  const resources = emptyBag();
  for (let i = 0; i < owed && ranked.length; i++) resources[ranked[i % ranked.length]!]++;
  return { type: 'choose-gold', resources };
}

/** Special build phase (five or six players): a city, then a settlement, on the best spot; otherwise pass. */
export function specialBuild(view: GameView): GameAction {
  const board = new Board(view);
  const weights = resourceWeights(board, view.selfId);
  const best = (ids: string[]) =>
    ids.reduce((a, b) => (spotValue(board, b, weights) > spotValue(board, a, weights) ? b : a));
  if (view.legal.cities.length) return { type: 'build-city', vertexId: best(view.legal.cities) };
  if (view.legal.settlements.length) return { type: 'build-settlement', vertexId: best(view.legal.settlements) };
  return { type: 'end-turn' };
}
