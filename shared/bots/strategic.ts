import { emptyBag } from '../engine/core';
import {
  type DevelopmentCard,
  type GameAction,
  type GameView,
  RESOURCES,
  type Resource,
  type ResourceBag,
  type TradeOffer,
} from '../types';
import {
  Board,
  bagValue,
  COSTS,
  canPay,
  DEFAULT_SPOT_TUNING,
  estimateHand,
  eventsThisTurn,
  expansionTarget,
  type Goal,
  linkAction,
  pips,
  resourceWeights,
  type SpotTuning,
  spotValue,
  turnsToAfford,
} from './analysis';
import type { Brain, TurnOptions } from './types';

/**
 * Intermediate and Advanced share this planner. Both pick a goal (city,
 * settlement, development card), spend and trade toward it, target the leader
 * with the robber, and play development cards on purpose.
 *
 * Advanced differs by its profile: setup scoring tuned by self-play, every
 * choice its best one, and opponents' hands estimated from what they produce
 * (for Monopoly, steals, and refusing trades with anyone close to winning).
 * Intermediate sometimes takes a near-best setup corner or robber tile.
 *
 * Tuning: tests/bots.test.ts has a head-to-head report. Over 240 seeded games
 * (Beginner vs Intermediate vs Advanced, all seat orders) the profiles below
 * won about 3% / 38% / 58%. Ideas that tested no better than noise, and were
 * removed: lookahead on purchases, city-vs-settlement comparison, Longest Road
 * chasing, proactive harbor trades, and spending down big hands.
 */
interface Profile {
  /** Guess opponents' cards (Monopoly, steals) and refuse trades with anyone near winning. */
  handEstimates: boolean;
  /** Chance (0–1) of taking a near-best option instead of the best one for setup and robber choices. */
  sloppiness: number;
  /** Corner scoring weights for setup choices. */
  spot: SpotTuning;
}

class Planner {
  readonly board: Board;
  readonly weights: ResourceBag;
  readonly production: ResourceBag;
  readonly self: GameView['players'][number];

  constructor(
    readonly view: GameView,
    readonly profile: Profile,
  ) {
    this.board = new Board(view);
    this.weights = resourceWeights(this.board, view.selfId);
    this.production = this.board.production(view.selfId);
    this.self = view.players.find(p => p.id === view.selfId)!;
  }

  /**
   * Usually the best (first) option; with the profile's sloppiness, sometimes the 2nd or 3rd.
   * Derived from the game state so the same view always gives the same choice.
   */
  pick<T>(ranked: T[]): T {
    const seed = [...`${this.view.version}:${this.view.selfId}:${this.view.turn}`].reduce(
      (h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619),
      2166136261,
    );
    const roll = (seed >>> 0) / 2 ** 32;
    if (roll >= this.profile.sloppiness || ranked.length < 2) return ranked[0]!;
    return ranked[1 + Math.floor((roll / this.profile.sloppiness) * Math.min(2, ranked.length - 1))]!;
  }

  get target() {
    return this.view.settings.victoryPoints;
  }

  /** Opponent closest to winning, by visible points. */
  leader() {
    return this.view.players
      .filter(p => p.id !== this.view.selfId)
      .sort((a, b) => b.publicPoints - a.publicPoints || b.resourceCount - a.resourceCount)[0];
  }

  ownSettlements(): string[] {
    return Object.entries(this.view.buildings)
      .filter(([, b]) => b.playerId === this.view.selfId && b.kind === 'settlement')
      .map(([id]) => id);
  }

  /** Main thing to save for, with its expected wait. */
  goal(): { goal: Goal; turns: number } {
    const options: { goal: Goal; turns: number; value: number }[] = [];
    const turns = (goal: Goal) => turnsToAfford(this.view, this.production, COSTS[goal]);
    if (this.self.citiesLeft && this.ownSettlements().length) {
      const gain = Math.max(...this.ownSettlements().map(id => bagValue(this.board.yieldAt(id), this.weights)));
      options.push({ goal: 'city', turns: turns('city'), value: 2 + gain / 6 });
    }
    const spot = expansionTarget(this.board, this.weights);
    if (this.self.settlementsLeft && (this.view.legal.settlements.length || spot)) {
      const roads = this.view.legal.settlements.length ? 0 : (spot?.distance ?? 0);
      options.push({ goal: 'settlement', turns: turns('settlement') + roads, value: 2 + (spot?.value ?? 4) / 6 });
    }
    if (this.view.developmentRemaining) options.push({ goal: 'development', turns: turns('development'), value: 1.4 });
    if (!options.length) return { goal: 'development', turns: 30 };
    options.sort((a, b) => b.value / (1 + b.turns) - a.value / (1 + a.turns));
    return options[0]!;
  }

  // ---- setup ----

  setupSettlement(): GameAction {
    const ids = [...this.view.legal.settlements];
    const score = (id: string) => spotValue(this.board, id, this.weights, this.profile.spot);
    ids.sort((a, b) => score(b) - score(a) || a.localeCompare(b));
    return { type: 'place-settlement', vertexId: this.pick(ids) };
  }

  setupRoad(): GameAction {
    const edges = [...this.view.legal.roads, ...this.view.legal.ships].map(id => this.board.edge.get(id)!);
    const reach = (edgeId: string) => {
      const e = this.board.edge.get(edgeId)!;
      const far = this.view.buildings[e.a] ? e.b : e.a;
      const spots = [far, ...this.board.neighbors(far)].filter(v => this.board.isOpenSpot(v));
      return Math.max(0, ...spots.map(v => spotValue(this.board, v, this.weights)));
    };
    edges.sort((a, b) => reach(b.id) - reach(a.id));
    return linkAction(this.view, edges[0]!.id)!;
  }

  // ---- robber ----

  robberHex(): string {
    const leader = this.leader();
    const score = (hexId: string) => {
      const hex = this.board.hex.get(hexId)!;
      let value = 0;
      for (const id of hex.vertexIds) {
        const b = this.view.buildings[id];
        if (!b) continue;
        const owner = this.view.players.find(p => p.id === b.playerId)!;
        if (b.playerId === this.view.selfId) {
          value -= 12;
          continue;
        }
        const threat = 1 + owner.publicPoints / 4 + (owner.id === leader?.id ? 0.5 : 0);
        value += threat * (b.kind === 'city' ? 2 : 1) * pips(hex.number) + (owner.resourceCount ? 1 : 0);
      }
      return value;
    };
    return this.pick([...this.view.legal.robberHexes].sort((a, b) => score(b) - score(a)));
  }

  stealTarget(): string {
    const { goal } = this.goal();
    const need = COSTS[goal];
    const score = (id: string) => {
      const player = this.view.players.find(p => p.id === id)!;
      let value = player.resourceCount + player.publicPoints * 0.5;
      if (this.profile.handEstimates) {
        const hand = estimateHand(this.board, id);
        value += RESOURCES.reduce((n, r) => n + (this.view.hand[r] < need[r] ? hand[r] : 0), 0) * 1.5;
      }
      return value;
    };
    return [...this.view.legal.stealTargets].sort((a, b) => score(b) - score(a))[0]!;
  }

  // ---- development cards ----

  playable(kind: DevelopmentCard['kind']): DevelopmentCard | undefined {
    return this.view.development.find(c => c.kind === kind && this.view.playableDevelopment.includes(c.id));
  }

  robberOnMe(): boolean {
    const hex = this.board.hex.get(this.view.robber)!;
    return pips(hex.number) >= 3 && hex.vertexIds.some(id => this.view.buildings[id]?.playerId === this.view.selfId);
  }

  knightTakesArmy(): boolean {
    const mine = this.self.knights + 1;
    const others = Math.max(0, ...this.view.players.filter(p => p.id !== this.view.selfId).map(p => p.knights));
    return mine >= 3 && mine > others && this.view.largestArmyId !== this.view.selfId;
  }

  developmentPlay(): GameAction | null {
    const knight = this.playable('knight');
    if (knight && (this.robberOnMe() || this.knightTakesArmy())) return { type: 'play-knight', cardId: knight.id };
    const { goal } = this.goal();
    const plenty = this.playable('year-of-plenty');
    if (plenty) {
      const missing = RESOURCES.flatMap(r =>
        Array<Resource>(Math.max(0, COSTS[goal][r] - this.view.hand[r])).fill(r),
      ).filter(r => this.view.bank[r]);
      const picks = [...missing, ...RESOURCES.filter(r => this.view.bank[r])].slice(0, 2);
      if (missing.length && missing.length <= 2 && picks.length) {
        const resources = emptyBag();
        for (const r of picks) resources[r]++;
        return { type: 'play-plenty', cardId: plenty.id, resources };
      }
    }
    const monopoly = this.playable('monopoly');
    if (monopoly) {
      const others = this.view.players.filter(p => p.id !== this.view.selfId);
      const held = (r: Resource) =>
        others.reduce(
          (n, p) =>
            n + (this.profile.handEstimates ? estimateHand(this.board, p.id)[r] : this.board.production(p.id)[r] / 6),
          0,
        );
      const resource = [...RESOURCES].sort((a, b) => held(b) * this.weights[b] - held(a) * this.weights[a])[0]!;
      if (held(resource) >= 3) return { type: 'play-monopoly', cardId: monopoly.id, resource };
    }
    const roadBuilding = this.playable('road-building');
    const links = this.view.legal.roads.length + this.view.legal.ships.length;
    if (roadBuilding && this.self.roadsLeft + this.self.shipsLeft >= 2 && this.self.settlementsLeft && links) {
      const spot = expansionTarget(this.board, this.weights);
      if (spot && spot.distance >= 1) return { type: 'play-road-building', cardId: roadBuilding.id };
    }
    return null;
  }

  // ---- building and trading ----

  /** A road or ship toward the best reachable open corner. */
  roadTowardTarget(maxDistance = 3): GameAction | null {
    const spot = expansionTarget(this.board, this.weights, maxDistance);
    return linkAction(this.view, spot?.firstEdge);
  }

  bestSettlement(): string {
    return [...this.view.legal.settlements].sort(
      (a, b) => spotValue(this.board, b, this.weights) - spotValue(this.board, a, this.weights),
    )[0]!;
  }

  bestCity(): string {
    return [...this.view.legal.cities].sort(
      (a, b) => bagValue(this.board.yieldAt(b), this.weights) - bagValue(this.board.yieldAt(a), this.weights),
    )[0]!;
  }

  /** A bank trade that brings the goal within reach, never giving away goal resources. */
  bankTrade(goal: Goal): GameAction | null {
    const cost = COSTS[goal];
    const missing = RESOURCES.filter(r => this.view.hand[r] < cost[r] && this.view.bank[r]);
    if (!missing.length) return null;
    const shortfall = RESOURCES.reduce((n, r) => n + Math.max(0, cost[r] - this.view.hand[r]), 0);
    const credits = RESOURCES.reduce(
      (n, r) => n + Math.floor(Math.max(0, this.view.hand[r] - cost[r]) / this.view.tradeRates[r]),
      0,
    );
    if (credits < shortfall) return null;
    const give = [...RESOURCES]
      .filter(r => this.view.hand[r] - cost[r] >= this.view.tradeRates[r])
      .sort((a, b) => this.weights[a] - this.weights[b])[0];
    const receive = [...missing].sort((a, b) => this.weights[b] - this.weights[a])[0]!;
    return give ? { type: 'trade', give, receive } : null;
  }

  /** One fair 1-for-1 offer per turn for a card the goal needs. */
  playerOffer(goal: Goal): GameAction | null {
    if (eventsThisTurn(this.view, ['offer'])) return null;
    const cost = COSTS[goal];
    const want = RESOURCES.filter(r => this.view.hand[r] < cost[r]).sort(
      (a, b) => this.weights[b] - this.weights[a],
    )[0];
    const give = RESOURCES.filter(r => this.view.hand[r] > cost[r]).sort(
      (a, b) => this.weights[a] - this.weights[b],
    )[0];
    if (!want || !give) return null;
    const to = this.view.players
      .filter(p => p.id !== this.view.selfId && p.publicPoints < this.target - 2 && p.resourceCount > 0)
      .map(p => p.id);
    if (!to.length) return null;
    return {
      type: 'offer-trade',
      give: { ...emptyBag(), [give]: 1 },
      want: { ...emptyBag(), [want]: 1 },
      to,
    };
  }

  build({ builds = 0, allowOffers = true }: TurnOptions): GameAction {
    const { view } = this;
    if (builds >= 2 && !allowOffers) return { type: 'end-turn' };
    const play = this.developmentPlay();
    if (play) return play;
    const { goal } = this.goal();

    if (view.legal.cities.length) return { type: 'build-city', vertexId: this.bestCity() };
    if (view.legal.settlements.length) return { type: 'build-settlement', vertexId: this.bestSettlement() };

    if (goal === 'settlement') {
      const road = this.roadTowardTarget();
      if (road) return road;
    }
    const trade = this.bankTrade(goal);
    if (trade) return trade;
    if (view.developmentRemaining && canPay(view.hand, COSTS.development)) return { type: 'buy-development' };
    if (allowOffers) {
      const offer = this.playerOffer(goal);
      if (offer) return offer;
    }
    // Spare roads toward a nearby spot.
    if (this.self.roadsLeft + this.self.shipsLeft > 2) {
      const road = this.roadTowardTarget(2);
      if (road) return road;
    }
    return { type: 'end-turn' };
  }

  /** Is a trade worth it: better value for us, and not feeding someone about to win? */
  tradeIsGood(partnerId: string, get: ResourceBag, give: ResourceBag): boolean {
    const partner = this.view.players.find(p => p.id === partnerId);
    if (!partner || (this.profile.handEstimates && partner.publicPoints >= this.target - 2)) return false;
    if (!canPay(this.view.hand, give)) return false;
    const { goal } = this.goal();
    const hand = { ...this.view.hand };
    for (const r of RESOURCES) hand[r] += get[r] - give[r];
    const before = turnsToAfford(this.view, this.production, COSTS[goal]);
    const after = turnsToAfford({ ...this.view, hand }, this.production, COSTS[goal]);
    return bagValue(get, this.weights) >= bagValue(give, this.weights) * 0.95 && after <= before;
  }
}

/** Advanced's settings. Exported so the tuning report can try variations. */
export const ADVANCED: Profile = { handEstimates: true, sloppiness: 0, spot: { variety: 2.5, harbor: 0.3 } };

function makeBrain(profile: Profile): Brain {
  return {
    turn(view: GameView, options: TurnOptions): GameAction {
      const p = new Planner(view, profile);
      switch (view.phase) {
        case 'setup-settlement':
          return p.setupSettlement();
        case 'setup-road':
          return p.setupRoad();
        case 'roll': {
          const knight = p.playable('knight');
          return knight && (p.robberOnMe() || p.knightTakesArmy())
            ? { type: 'play-knight', cardId: knight.id }
            : { type: 'roll' };
        }
        case 'robber':
          return { type: 'move-robber', hexId: p.robberHex() };
        case 'steal':
          return { type: 'steal', playerId: p.stealTarget() };
        case 'free-roads':
          return (
            p.roadTowardTarget(4) ??
            linkAction(view, view.legal.roads[0] ?? view.legal.ships[0]) ?? { type: 'finish-free-roads' }
          );
        case 'build':
          return p.build(options);
        default:
          return { type: 'end-turn' };
      }
    },

    discard(view: GameView): GameAction {
      const p = new Planner(view, profile);
      const keep = COSTS[p.goal().goal];
      const hand = { ...view.hand };
      const bag = emptyBag();
      for (let i = 0; i < (view.pendingDiscards[view.selfId] ?? 0); i++) {
        // Drop surplus over the goal first, cheapest-valued first; then the most-held card.
        const surplus = RESOURCES.filter(r => hand[r] > keep[r]).sort((a, b) => p.weights[a] - p.weights[b]);
        const resource = surplus[0] ?? [...RESOURCES].sort((a, b) => hand[b] - hand[a])[0]!;
        hand[resource]--;
        bag[resource]++;
      }
      return { type: 'discard', resources: bag };
    },

    respond(view: GameView, offer: TradeOffer): GameAction {
      const p = new Planner(view, profile);
      return p.tradeIsGood(offer.fromId, offer.give, offer.want)
        ? { type: 'accept-trade', offerId: offer.id }
        : { type: 'decline-trade', offerId: offer.id };
    },

    review(view: GameView, offer: TradeOffer): GameAction {
      const p = new Planner(view, profile);
      const good = offer.counters.find(c => p.tradeIsGood(c.fromId, c.give, c.want));
      return good
        ? { type: 'accept-counter', offerId: offer.id, counterId: good.id }
        : { type: 'cancel-trade', offerId: offer.id };
    },
  };
}

export const intermediate = makeBrain({ handEstimates: false, sloppiness: 0.5, spot: DEFAULT_SPOT_TUNING });
export const advanced = makeBrain(ADVANCED);
