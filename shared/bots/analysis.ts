import { emptyBag } from '../engine/core';
import { type GameView, type Hex, RESOURCES, type Resource, type ResourceBag } from '../types';

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
    this.hex = new Map(view.board.hexes.map(h => [h.id, h]));
    this.vertex = new Map(view.board.vertices.map(v => [v.id, v]));
    this.edge = new Map(view.board.edges.map(e => [e.id, e]));
  }

  hexesAt(vertexId: string): Hex[] {
    return this.vertex.get(vertexId)!.hexIds.map(id => this.hex.get(id)!);
  }

  /** Expected cards per 36 rolls from one settlement on this corner. The robber's hex counts for little. */
  yieldAt(vertexId: string): ResourceBag {
    const bag = emptyBag();
    for (const hex of this.hexesAt(vertexId)) {
      if (hex.terrain === 'desert') continue;
      bag[hex.terrain] += pips(hex.number) * (hex.id === this.view.robber ? 0.3 : 1);
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

/**
 * Cheapest new roads from this bot's network to every reachable corner.
 * Returns the distance (new roads needed) and the first road to build.
 */
export function roadPaths(board: Board): Map<string, { distance: number; firstEdge: string | null }> {
  const { view } = board;
  const self = view.selfId;
  const result = new Map<string, { distance: number; firstEdge: string | null }>();
  const queue: string[] = [];
  for (const v of view.board.vertices) {
    const own = view.buildings[v.id]?.playerId === self;
    const touchesRoad = !view.buildings[v.id] && v.edgeIds.some(id => view.roads[id] === self);
    if (own || touchesRoad) {
      result.set(v.id, { distance: 0, firstEdge: null });
      queue.push(v.id);
    }
  }
  // 0-1 BFS: existing own roads cost nothing, open edges cost one road.
  while (queue.length) {
    const id = queue.shift()!;
    const here = result.get(id)!;
    if (view.buildings[id] && view.buildings[id].playerId !== self) continue;
    for (const edgeId of board.vertex.get(id)!.edgeIds) {
      const owner = view.roads[edgeId];
      if (owner && owner !== self) continue;
      const e = board.edge.get(edgeId)!;
      const other = e.a === id ? e.b : e.a;
      const cost = owner ? 0 : 1;
      const distance = here.distance + cost;
      if (distance < (result.get(other)?.distance ?? Infinity)) {
        result.set(other, { distance, firstEdge: here.firstEdge ?? (cost ? edgeId : null) });
        if (cost) queue.push(other);
        else queue.unshift(other);
      }
    }
  }
  return result;
}

/** Best place to expand toward: an open spot weighed against how many roads it needs. */
export function expansionTarget(
  board: Board,
  weights: ResourceBag,
  maxDistance = 4,
): { vertexId: string; distance: number; firstEdge: string | null; value: number } | null {
  let best: { vertexId: string; distance: number; firstEdge: string | null; value: number } | null = null;
  for (const [vertexId, path] of roadPaths(board)) {
    if (path.distance === 0 || path.distance > maxDistance || !board.isOpenSpot(vertexId)) continue;
    const value = spotValue(board, vertexId, weights) / (1 + path.distance ** 1.5 * 0.35);
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
