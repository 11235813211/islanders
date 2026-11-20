import { emptyBag } from '../../engine/core';
import { boardIndex, terrainResource } from '../../seafaring';
import { type GameAction, type GameView, type Hex, RESOURCES, type Resource, type ResourceBag } from '../../types';
import {
  addTileYield,
  Board,
  bagValue,
  COSTS,
  estimateHand,
  type Goal,
  maySettle,
  paidPips,
  roadPaths,
  routeGoalAt,
} from '../analysis';
import { winningGold } from './endgame';
import { distanceFrom, type Geometry, geometry, isOpen } from './geometry';
import type { Knobs } from './params';
import { makePlans, type Plan, type PlanKind, planScore } from './plans';
import { type Races, races } from './rivals';

const GOAL: Record<PlanKind, Goal> = {
  city: 'city',
  settlement: 'settlement',
  route: 'settlement',
  explore: 'road',
  development: 'development',
  road: 'road',
};

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
  /** The plans weighed (planner 1; see plans.ts). */
  readonly plans: Plan[] = [];
  target: Target | null;
  /** The best target after `target` is taken (for afterstates). */
  runnerUp: Target | null = null;
  /** Open corners our roads and ships already reach (settle there with cards alone). */
  spots = 0;
  /** Those corners. */
  readonly spotIds: string[] = [];
  /** Per seat (view.players order): corners its routes can grow from. */
  readonly frontiers: number[][];

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
    if (knobs.planner < 0.5) {
      this.goals = this.goalOptions();
      return;
    }
    const { land, fog } = this.reachable();
    this.plans = makePlans(this, land, fog);
    this.goals = this.plans.map(p => ({ goal: GOAL[p.kind], cost: p.cost, value: p.payoff }));
    // The route to follow: the best-scoring plan that builds roads or ships.
    const routes = this.plans
      .filter(p => p.path)
      .map(p => ({ p, score: planScore(this, p) }))
      .sort((a, b) => b.score - a.score);
    this.target = routes[0] ? { ...routes[0].p.path!, value: routes[0].score } : null;
    this.runnerUp = routes[1] ? { ...routes[1].p.path!, value: routes[1].score } : null;
  }

  /** Open land corners (and fog corners) our routes could reach, with the way there. */
  private reachable(): { land: Map<string, Target>; fog: Map<string, Target> } {
    const reach = this.view.seafaring ? 7 : 5;
    const occupied = new Uint8Array(this.geo.n);
    for (const id of Object.keys(this.view.buildings)) occupied[this.geo.indexOf.get(id)!] = 1;
    const index = boardIndex(this.view.board);
    const land = new Map<string, Target>();
    const fog = new Map<string, Target>();
    for (const [vertexId, path] of roadPaths(this.board)) {
      // A route's finish area is worth heading for however far it is.
      if (path.distance === 0 || (path.distance > reach && !routeGoalAt(this.view, vertexId))) continue;
      const c = this.geo.indexOf.get(vertexId)!;
      const target = { vertexId, value: 0, ...path };
      if (this.geo.land[c] && isOpen(this.geo, occupied, c)) land.set(vertexId, target);
      if (index.vertex.get(vertexId)!.hexIds.some(h => index.hex.get(h)!.terrain === 'fog')) fog.set(vertexId, target);
    }
    return { land, fog };
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

  /**
   * Pips by resource for a player, and pips from gold and paying volcanoes (a free choice). Charted
   * numbers count; a split tile's pips go half to each of its resources; the robber blocks a tile's
   * most likely number for buildings, while relay stations earn one card per tile beside them, robber
   * or not (as `produce` in engine/production.ts pays them).
   */
  productionOf(playerId: string): { production: ResourceBag; choice: number } {
    const production = emptyBag();
    let choice = 0;
    const index = boardIndex(this.view.board);
    const add = (hex: Hex, times: number, robbed = false) => {
      const p = paidPips(hex, robbed) * times;
      if (!p) return;
      if (terrainResource(hex.terrain)) addTileYield(production, hex, p);
      else if (hex.terrain === 'gold' || (hex.terrain === 'volcano' && this.view.settings.volcanoGold)) choice += p;
    };
    for (const [vertexId, b] of Object.entries(this.view.buildings)) {
      if (b.playerId !== playerId) continue;
      for (const hexId of index.vertex.get(vertexId)!.hexIds)
        add(index.hex.get(hexId)!, b.kind === 'city' ? 2 : 1, hexId === this.view.robber);
    }
    for (const edgeId of this.view.relays ?? [])
      if (this.view.roads[edgeId] === playerId) for (const hex of index.edgeHexes.get(edgeId)!) add(hex, 1);
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
    return this.worthFor(vertexId, this.view.selfId, this.production);
  }

  /**
   * Value of a corner for any player with this production (rivals.ts judges rivals' targets the
   * same way we judge ours). Lodestone counts only for us: their plans for it aren't visible.
   */
  worthFor(vertexId: string, playerId: string, production: ResourceBag): number {
    const c = this.geo.indexOf.get(vertexId)!;
    const k = this.knobs;
    const mine = playerId === this.view.selfId;
    let value = this.geo.gold[c]! * k.goldSpot + this.geo.jungle[c]! * 0.5;
    if (this.view.settings.volcanoGold) value += this.geo.volcano[c]! * k.goldSpot * 0.75;
    for (let r = 0; r < 5; r++) {
      const have = production[RESOURCES[r]!];
      value += this.geo.pips[c * 5 + r]! * (1.6 - Math.min(1, have / 10));
    }
    // Lodestone pays for charts and relay stations, worth less once the bot already earns plenty.
    if (mine && this.view.cartographers)
      value += this.geo.lodestone[c]! * k.lodestoneSpot * (1.6 - Math.min(1, production.lodestone / 10));
    const harbor = this.geo.harbor[c];
    if (harbor === 'any') value += 1.2;
    else if (harbor && production[harbor] >= 5) value += 2.5;
    const route = mine ? routeGoalAt(this.view, vertexId) : 0;
    return value + (this.islandBonus(c, playerId) + route) * k.bonusValue;
  }

  /** Bonus points a player (this bot by default) would get for settling corner `c`. */
  islandBonus(c: number, playerId = this.view.selfId): number {
    const bonus = this.geo.bonus[c]!;
    if (!bonus) return 0;
    const island = this.geo.island[c];
    const settled = Object.entries(this.view.buildings).some(
      ([id, b]) => b.playerId === playerId && this.geo.island[this.geo.indexOf.get(id)!] === island,
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
      if (path.distance === 0 && this.geo.land[c] && isOpen(this.geo, occupied, c) && maySettle(this.view, vertexId)) {
        this.spots++;
        this.spotIds.push(vertexId);
      }
    }
    // Nearby spots first; when every one is gone (late on a small map), anywhere still reachable.
    // A required route finish comes first: without it the bot can't win (see routeUnfinished).
    if (this.routeUnfinished) {
      const finish = this.bestTarget(paths, Infinity, true);
      if (finish) return finish;
    }
    return this.bestTarget(paths, this.view.seafaring ? 7 : 5) ?? this.bestTarget(paths, Infinity);
  }

  /** The map requires building in our route's finish area to win, and we haven't yet. */
  get routeUnfinished(): boolean {
    return !!this.view.board.rules?.routeGoal?.required && !this.self.routeDone;
  }

  private bestTarget(paths: ReturnType<typeof roadPaths>, reach: number, finishOnly = false): Target | null {
    const occupied = new Uint8Array(this.geo.n);
    for (const id of Object.keys(this.view.buildings)) occupied[this.geo.indexOf.get(id)!] = 1;
    let best: Target | null = null;
    let second: Target | null = null;
    for (const [vertexId, path] of paths) {
      // A route's finish area is worth heading for however far it is.
      if (path.distance === 0 || (path.distance > reach && !routeGoalAt(this.view, vertexId))) continue;
      const c = this.geo.indexOf.get(vertexId)!;
      if (!this.geo.land[c] || !isOpen(this.geo, occupied, c) || !maySettle(this.view, vertexId)) continue;
      if (finishOnly && !routeGoalAt(this.view, vertexId)) continue;
      const race = this.raceFactor(c, path.distance);
      const value = (this.spotWorth(vertexId) * race) / (1 + this.knobs.distanceCost * path.distance ** 1.5);
      const target = { vertexId, value, ...path };
      if (!best || value > best.value) [best, second] = [target, best];
      else if (!second || value > second.value) second = target;
    }
    if (best) this.runnerUp = second;
    return best;
  }

  /**
   * How much a race for corner `c` (ours `distance` pieces away) cuts its value: the chance we get
   * there first (rivals.ts, `raceModel` 1), or the older rule of thumb by who is closer.
   */
  raceFactor(c: number, distance: number): number {
    if (this.knobs.raceModel >= 0.5) {
      return this.races.oursAt(c);
    }
    const them = this.opponentDistance(c);
    const penalty = this.knobs.racePenalty;
    return them > distance ? 1 : them === distance ? 1 - penalty / 2 : 1 - penalty;
  }

  private racesCache: Races | null = null;

  /** The rival model for this decision. */
  get races(): Races {
    this.racesCache ??= races(this);
    return this.racesCache;
  }

  /** Whether our routes are within a couple of pieces of corner `c`. */
  reachableSoon(c: number): boolean {
    return distanceFrom(this.geo, this.frontiers[this.seat]!, c) <= 2;
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
    if (self.settlementsLeft && (this.spots || this.target)) {
      // A corner we already reach needs only the settlement's cards; else the roads to the target.
      const roads = this.spots ? 0 : (this.target?.distance ?? 0);
      const cost = { ...COSTS.settlement };
      cost.wood += roads;
      if (this.target?.firstKind === 'ship') cost.sheep += roads;
      else cost.brick += roads;
      const worth = this.spots
        ? Math.max(...this.spotIds.map(id => this.spotWorth(id)))
        : (this.target?.value ?? 0) * (1 + knobs.distanceCost * (this.target?.distance ?? 0) ** 1.5);
      const bonusPoints = this.target
        ? this.islandBonus(this.geo.indexOf.get(this.target.vertexId)!) + routeGoalAt(this.view, this.target.vertexId)
        : 0;
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
  turnsWith(
    hand: ResourceBag,
    production: ResourceBag,
    choicePips: number,
    cost: ResourceBag,
    rates: Record<Resource, number> = this.view.tradeRates,
  ): number {
    const rolls = this.view.players.length;
    let shortfall = 0;
    let credit = 0;
    const missing: Resource[] = [];
    for (const r of RESOURCES) {
      const gap = cost[r] - hand[r];
      if (gap <= 0) credit += Math.floor(-gap / rates[r]);
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

const unitWeights: ResourceBag = { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 1, lodestone: 1 };

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
  const picks = choices(econ, owed);
  // A pick that wins this turn beats any hand value.
  const wins = winningGold(econ, picks);
  if (wins) return finishGold(econ, owed, { ...wins });
  let best = emptyBag();
  let score = -Infinity;
  for (const bag of picks) {
    const s = econ.handValue(plus(view.hand, bag));
    if (s > score) [best, score] = [bag, s];
  }
  return finishGold(econ, owed, best);
}

/** Cards owed beyond the four searched go greedily, one at a time. */
function finishGold(econ: Economy, owed: number, best: ResourceBag): GameAction {
  const { view } = econ;
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
