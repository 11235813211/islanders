import { emptyBag } from '../../engine/core';
import { boardIndex } from '../../seafaring';
import { type GameAction, type GameView, RESOURCES, type Resource, type ResourceBag } from '../../types';
import { Board, bagValue, COSTS, estimateHand, type Goal, pips, roadPaths } from '../analysis';
import { distanceFrom, type Geometry, geometry, isOpen } from './geometry';
import type { Knobs } from './params';

/**
 * How this bot values cards: each goal (city, settlement with the roads it needs, development
 * card) is worth its value over (1 + expected turns to afford it), and a hand is worth its best
 * goal. Gold choices, discards, Year of Plenty, and trades all compare hands with `handValue`, so
 * they agree with each other and with what the bot is saving for.
 */

export interface Target {
  vertexId: string;
  value: number;
  distance: number;
  firstEdge: string | null;
  firstKind: 'road' | 'ship' | null;
}

export interface GoalOption {
  goal: Goal;
  cost: ResourceBag;
  value: number;
}

export class Economy {
  readonly board: Board;
  readonly geo: Geometry;
  readonly self: GameView['players'][number];
  readonly seat: number;
  /** Expected cards per 36 rolls by resource, robber counted. Gold and volcano pips are separate. */
  readonly production: ResourceBag;
  readonly choicePips: number;
  readonly goals: GoalOption[];
  readonly target: Target | null;
  /** The best target after `target` is taken (for afterstates). */
  runnerUp: Target | null = null;
  /** Open corners our roads and ships already reach (settle there with cards alone). */
  spots = 0;
  private readonly frontiers: number[][];

  constructor(
    readonly view: GameView,
    readonly knobs: Knobs,
  ) {
    this.board = new Board(view);
    this.geo = geometry(view);
    this.self = view.players.find(p => p.id === view.selfId)!;
    this.seat = view.players.indexOf(this.self);
    const { production, choice } = this.productionOf(view.selfId);
    this.production = production;
    this.choicePips = choice;
    this.frontiers = view.players.map(p => this.frontier(p.id));
    this.target = this.expansionTarget();
    this.goals = this.goalOptions();
  }

  get victoryTarget(): number {
    return this.view.settings.victoryPoints;
  }

  /**
   * A player's likely cards: the engine's public count when the view has it, else a guess from
   * their card count and production.
   */
  handOf(playerId: string): ResourceBag {
    if (playerId === this.view.selfId) return this.view.hand;
    return this.view.likelyHands?.[playerId] ?? estimateHand(this.board, playerId);
  }

  /** Pips by resource for a player, and pips from gold and paying volcanoes (a free choice). */
  productionOf(playerId: string): { production: ResourceBag; choice: number } {
    const production = emptyBag();
    let choice = 0;
    const index = boardIndex(this.view.board);
    for (const [vertexId, b] of Object.entries(this.view.buildings)) {
      if (b.playerId !== playerId) continue;
      const times = b.kind === 'city' ? 2 : 1;
      for (const hexId of index.vertex.get(vertexId)!.hexIds) {
        const hex = index.hex.get(hexId)!;
        const p = pips(hex.number) * times * (hex.id === this.view.robber ? 0 : 1);
        if (!p) continue;
        if (RESOURCES.includes(hex.terrain as Resource)) production[hex.terrain as Resource] += p;
        else if (hex.terrain === 'gold' || (hex.terrain === 'volcano' && this.view.settings.volcanoGold)) choice += p;
      }
    }
    return { production, choice };
  }

  /** Corners a player's routes can grow from: buildings and the ends of roads and ships. */
  private frontier(playerId: string): number[] {
    const out = new Set<number>();
    for (const [id, b] of Object.entries(this.view.buildings))
      if (b.playerId === playerId) out.add(this.geo.indexOf.get(id)!);
    for (const pieces of [this.view.roads, this.view.ships])
      for (const [edgeId, owner] of Object.entries(pieces)) {
        if (owner !== playerId) continue;
        const e = this.board.edge.get(edgeId)!;
        out.add(this.geo.indexOf.get(e.a)!);
        out.add(this.geo.indexOf.get(e.b)!);
      }
    return [...out];
  }

  /** Fewest pieces any opponent needs to reach corner `c`. */
  opponentDistance(c: number): number {
    let best = 255;
    this.frontiers.forEach((f, seat) => {
      if (seat !== this.seat && f.length) best = Math.min(best, distanceFrom(this.geo, f, c));
    });
    return best;
  }

  /** Value of settling a corner for this bot: its cards (rarer ones count more) and any island bonus. */
  spotWorth(vertexId: string): number {
    const c = this.geo.indexOf.get(vertexId)!;
    const k = this.knobs;
    let value = this.geo.gold[c]! * k.goldSpot + this.geo.jungle[c]! * 0.5;
    if (this.view.settings.volcanoGold) value += this.geo.volcano[c]! * k.goldSpot * 0.75;
    for (let r = 0; r < 5; r++) {
      const have = this.production[RESOURCES[r]!];
      value += this.geo.pips[c * 5 + r]! * (1.6 - Math.min(1, have / 10));
    }
    const harbor = this.geo.harbor[c];
    if (harbor === 'any') value += 1.2;
    else if (harbor && this.production[harbor] >= 5) value += 2.5;
    return value + this.islandBonus(c) * k.bonusValue;
  }

  /** Bonus points this bot would get for settling corner `c`. */
  islandBonus(c: number): number {
    const bonus = this.geo.bonus[c]!;
    if (!bonus) return 0;
    const island = this.geo.island[c];
    const settled = Object.entries(this.view.buildings).some(
      ([id, b]) => b.playerId === this.view.selfId && this.geo.island[this.geo.indexOf.get(id)!] === island,
    );
    return settled ? 0 : bonus;
  }

  /** Best open corner to grow toward, discounted by distance and by opponents who are closer. */
  private expansionTarget(): Target | null {
    const paths = roadPaths(this.board);
    const occupied = new Uint8Array(this.geo.n);
    for (const id of Object.keys(this.view.buildings)) occupied[this.geo.indexOf.get(id)!] = 1;
    for (const [vertexId, path] of paths) {
      const c = this.geo.indexOf.get(vertexId)!;
      if (path.distance === 0 && this.geo.land[c] && isOpen(this.geo, occupied, c)) this.spots++;
    }
    // Nearby spots first; when every one is gone (late on a small map), anywhere still reachable.
    return this.bestTarget(paths, this.view.seafaring ? 7 : 5) ?? this.bestTarget(paths, Infinity);
  }

  private bestTarget(paths: ReturnType<typeof roadPaths>, reach: number): Target | null {
    const occupied = new Uint8Array(this.geo.n);
    for (const id of Object.keys(this.view.buildings)) occupied[this.geo.indexOf.get(id)!] = 1;
    let best: Target | null = null;
    let second: Target | null = null;
    for (const [vertexId, path] of paths) {
      if (path.distance === 0 || path.distance > reach) continue;
      const c = this.geo.indexOf.get(vertexId)!;
      if (!this.geo.land[c] || !isOpen(this.geo, occupied, c)) continue;
      const them = this.opponentDistance(c);
      const race =
        them > path.distance ? 1 : them === path.distance ? 1 - this.knobs.racePenalty / 2 : 1 - this.knobs.racePenalty;
      const value = (this.spotWorth(vertexId) * race) / (1 + this.knobs.distanceCost * path.distance ** 1.5);
      const target = { vertexId, value, ...path };
      if (!best || value > best.value) [best, second] = [target, best];
      else if (!second || value > second.value) second = target;
    }
    if (best) this.runnerUp = second;
    return best;
  }

  private goalOptions(): GoalOption[] {
    const { view, knobs, self } = this;
    const goals: GoalOption[] = [];
    const short = this.victoryTarget - self.points;
    const push = 1 + knobs.endgamePush * Math.max(0, 3 - short);
    const settlements = Object.entries(view.buildings).filter(
      ([, b]) => b.playerId === view.selfId && b.kind === 'settlement',
    );
    if (self.citiesLeft && settlements.length) {
      const gain = Math.max(...settlements.map(([id]) => bagValue(this.board.yieldAt(id), unitWeights)));
      goals.push({ goal: 'city', cost: COSTS.city, value: (knobs.cityValue + gain / 8) * push });
    }
    if (self.settlementsLeft && (view.legal.settlements.length || this.target)) {
      const roads = view.legal.settlements.length ? 0 : (this.target?.distance ?? 0);
      const cost = { ...COSTS.settlement };
      cost.wood += roads;
      if (this.target?.firstKind === 'ship') cost.sheep += roads;
      else cost.brick += roads;
      const worth = view.legal.settlements.length
        ? Math.max(...view.legal.settlements.map(id => this.spotWorth(id)))
        : (this.target?.value ?? 0) * (1 + knobs.distanceCost * (this.target?.distance ?? 0) ** 1.5);
      const bonusPoints = this.target ? this.islandBonus(this.geo.indexOf.get(this.target.vertexId)!) : 0;
      goals.push({
        goal: 'settlement',
        cost,
        value: (knobs.settlementValue + worth / 10) * push * (1 + bonusPoints / 2),
      });
    }
    if (view.developmentRemaining)
      goals.push({ goal: 'development', cost: COSTS.development, value: knobs.developmentValue });
    return goals;
  }

  /** Expected turns until `hand` can pay `cost` (bank trades and gold count). */
  turnsToAfford(hand: ResourceBag, cost: ResourceBag): number {
    return this.turnsWith(hand, this.production, this.choicePips, cost);
  }

  /** The same for a hypothetical production (the value network's afterstates). */
  turnsWith(hand: ResourceBag, production: ResourceBag, choicePips: number, cost: ResourceBag): number {
    const rolls = this.view.players.length;
    let shortfall = 0;
    let credit = 0;
    const missing: Resource[] = [];
    for (const r of RESOURCES) {
      const gap = cost[r] - hand[r];
      if (gap <= 0) credit += Math.floor(-gap / this.view.tradeRates[r]);
      else {
        shortfall += gap;
        missing.push(r);
      }
    }
    if (!shortfall) return 0;
    if (credit >= shortfall) return 0.5;
    let turns = 0;
    const gold = choicePips / Math.max(1, missing.length);
    for (const r of missing) {
      const perRound = ((production[r] + gold) / 36) * rolls;
      turns = Math.max(turns, (cost[r] - hand[r]) / Math.max(perRound, 0.08));
    }
    // Spare cards can be traded in over time.
    return Math.min(30, turns / (1 + credit * 0.5));
  }

  /**
   * Worth of a hand: its best goal over the wait (and a share of the next best), a little for
   * every card, less when a 7 would cost half.
   */
  handValue(hand: ResourceBag): number {
    let best = 0;
    let second = 0;
    for (const g of this.goals) {
      const v = g.value / (1 + this.turnsToAfford(hand, g.cost));
      if (v > best) [best, second] = [v, best];
      else if (v > second) second = v;
    }
    best += this.knobs.secondGoal * second;
    const cards = RESOURCES.reduce((n, r) => n + hand[r], 0);
    const over = Math.max(0, cards - this.view.settings.discardLimit);
    return best + cards * 0.02 - over * 0.06;
  }

  /** The goal to save for. */
  bestGoal(): GoalOption | null {
    let best: GoalOption | null = null;
    let score = -Infinity;
    for (const g of this.goals) {
      const s = g.value / (1 + this.turnsToAfford(this.view.hand, g.cost));
      if (s > score) [best, score] = [g, s];
    }
    return best;
  }

  /** Bank availability (exact counts when the room shows them). */
  bankHas(r: Resource, n = 1): boolean {
    return this.view.bankCounts ? this.view.bankCounts[r] >= n : this.view.bank[r];
  }
}

const unitWeights: ResourceBag = { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 1 };

/** Every way to pick `n` resources (as bags), only from what the bank has. */
export function choices(econ: Economy, n: number): ResourceBag[] {
  const out: ResourceBag[] = [];
  const available = RESOURCES.filter(r => econ.bankHas(r));
  const walk = (from: number, left: number, bag: ResourceBag) => {
    if (!left) {
      out.push({ ...bag });
      return;
    }
    for (let i = from; i < available.length; i++) {
      const r = available[i]!;
      bag[r]++;
      walk(i, left - 1, bag);
      bag[r]--;
    }
  };
  walk(0, Math.min(n, 4), emptyBag());
  return out;
}

const plus = (a: ResourceBag, b: ResourceBag): ResourceBag => {
  const out = { ...a };
  for (const r of RESOURCES) out[r] += b[r];
  return out;
};

/** Gold or volcano picks: the resources that make the hand worth most. */
export function goldChoice(view: GameView, knobs: Knobs): GameAction {
  const econ = new Economy(view, knobs);
  const owed = view.pendingGold[view.selfId] ?? 0;
  let best = emptyBag();
  let score = -Infinity;
  for (const bag of choices(econ, owed)) {
    const s = econ.handValue(plus(view.hand, bag));
    if (s > score) [best, score] = [bag, s];
  }
  // More than four owed: the rest go greedily, one at a time.
  for (let left = owed - Math.min(owed, 4); left > 0; left--) {
    const hand = plus(view.hand, best);
    const r = [...RESOURCES]
      .filter(x => econ.bankHas(x, best[x] + 1))
      .sort((a, b) => econ.handValue(plus(hand, one(b))) - econ.handValue(plus(hand, one(a))))[0];
    if (!r) break;
    best[r]++;
  }
  return { type: 'choose-gold', resources: best };
}

const one = (r: Resource): ResourceBag => ({ ...emptyBag(), [r]: 1 });

/** Discard after a 7: give up the cards whose loss costs the hand least, one at a time. */
export function discard(view: GameView, knobs: Knobs): GameAction {
  const econ = new Economy(view, knobs);
  const hand = { ...view.hand };
  const bag = emptyBag();
  for (let i = 0; i < (view.pendingDiscards[view.selfId] ?? 0); i++) {
    const r = RESOURCES.filter(x => hand[x] > 0).sort((a, b) => {
      hand[a]--;
      const va = econ.handValue(hand);
      hand[a]++;
      hand[b]--;
      const vb = econ.handValue(hand);
      hand[b]++;
      return vb - va || hand[b] - hand[a];
    })[0]!;
    hand[r]--;
    bag[r]++;
  }
  return { type: 'discard', resources: bag };
}
