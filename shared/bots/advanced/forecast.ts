import { emptyBag } from '../../engine/core';
import { RESOURCES, type Resource, type ResourceBag } from '../../types';
import { COSTS } from '../analysis';
import { type Geometry, isOpen } from './geometry';
import { type Pace, roundsToAfford } from './goals';

/**
 * A quick forecast of how the game goes from here, with no dice and no rules engine: every seat
 * earns its expected income (harbor trades and gold included), builds what pays best for the
 * wait, and competes for the same open corners. It answers what a strong player estimates at a
 * glance: how soon can each of us reach the target, and what does this build change?
 *
 * The same model serves the build planner (try each first goal, plan-forecast.ts) and starting
 * placements (setup-forecast.ts), so strategy is simply the build order that finishes soonest.
 */

export interface ForecastSeat {
  pace: Pace;
  hand: ResourceBag;
  points: number;
  settlements: number[];
  frontier: number[];
  settlementsLeft: number;
  citiesLeft: number;
  piecesLeft: number;
  /** Longest road with 0, 1, 2… more pieces (road-race.ts). */
  road: number[];
}

export interface ForecastStart {
  geo: Geometry;
  seats: ForecastSeat[];
  /** Whose view this is. */
  me: number;
  target: number;
  occupied: Uint8Array;
  /** Seat holding Longest Road (-1: nobody). */
  holder: number;
  /** Development cards left. */
  deck: number;
  /** Corners a route may cross to at most, and how much a card is worth in points. */
  reach: number;
  pointPerCard: number;
  roundsPerPoint: number;
  /** Uncertainty in a seat's finish, per square root of the rounds still to play. */
  spread: number;
  /** A corner's income as things stand (the robber counted); by default its full dice odds. */
  incomeAt?: (corner: number) => CornerIncome;
}

/** Cards per round a corner brings, by resource, and free choices per round. */
export interface CornerIncome {
  cards: ResourceBag;
  wild: number;
}

/** A goal the forecast can be told to start with. */
export type FirstGoal =
  | { kind: 'city'; corner: number }
  | { kind: 'settlement'; corner: number }
  | { kind: 'development' }
  | { kind: 'road'; pieces: number };

export interface SeatOutlook {
  /** Estimated rounds until this seat reaches the target. */
  finish: number;
  /** Rounds until it has 5 and 7 points (null if not reached in the forecast). */
  atFive: number | null;
  atSeven: number | null;
  /** Cards per round at the end of rounds 10 and 20. */
  incomeTen: number;
  incomeTwenty: number;
  /** Settlements it wins during the forecast. */
  settled: number;
}

export interface Forecast {
  seats: SeatOutlook[];
  /** Each seat's chance to win, from how soon it finishes. */
  chances: number[];
}

/** Points a development card is worth on average: victory points, plus knights toward the army. */
const CARD_POINTS = 0.45;
/** Rounds the forecast never looks past. */
const LAST_ROUND = 40;
/** A route's roads count this much toward Longest Road: some branch off the main trail. */
const ROUTE_ROAD_SHARE = 0.6;
const ROAD_AWARD = 2;
const MIN_ROAD = 5;

interface Sim {
  pace: Pace;
  income: ResourceBag;
  rates: Record<Resource, number>;
  wild: number;
  hand: ResourceBag;
  points: number;
  settlements: number[];
  frontier: number[];
  /** Pieces from our routes to each corner, kept current as we settle (scanned on every choice). */
  distance: Uint8Array;
  settlementsLeft: number;
  citiesLeft: number;
  piecesLeft: number;
  road: number[];
  built: number;
  clock: number;
  outlook: SeatOutlook;
  next: Step | null;
}

interface Step {
  goal: FirstGoal;
  distance: number;
  cost: ResourceBag;
  at: number;
}

function costOf(goal: FirstGoal, distance: number): ResourceBag {
  const cost = emptyBag();
  const add = (bag: ResourceBag, times = 1) => {
    for (const r of RESOURCES) cost[r] += bag[r] * times;
  };
  if (goal.kind === 'city') add(COSTS.city);
  else if (goal.kind === 'development') add(COSTS.development);
  else if (goal.kind === 'road') add(COSTS.road, goal.pieces);
  else {
    add(COSTS.settlement);
    add(COSTS.road, distance);
  }
  return cost;
}

/** Cards per round that a corner adds, by resource, and any free choice. */
function cornerIncome(geo: Geometry, c: number, players: number): CornerIncome {
  const perRound = players / 36;
  const cards = emptyBag();
  RESOURCES.slice(0, 5).forEach((r, i) => {
    cards[r] = geo.pips[c * 5 + i]! * perRound;
  });
  cards.lodestone = geo.lodestone[c]! * perRound;
  return { cards, wild: geo.gold[c]! * perRound };
}

/** Worth of extra income: scarcer resources for this seat count for more. */
function incomeWorth(seat: Sim, gain: CornerIncome, players: number): number {
  let value = gain.wild * 1.3;
  for (const r of RESOURCES) value += gain.cards[r] * (1.6 - Math.min(1, ((seat.income[r] * 36) / players) * 0.1));
  return value;
}

function totalIncome(seat: Sim): number {
  return RESOURCES.reduce((n, r) => n + seat.income[r], seat.wild);
}

/** Lowers `distance` to what a new starting corner makes it. */
function addOrigin(geo: Geometry, distance: Uint8Array, origin: number): void {
  const row = origin * geo.n;
  for (let c = 0; c < geo.n; c++) distance[c] = Math.min(distance[c]!, geo.distance[row + c]!);
}

function distancesFrom(geo: Geometry, origins: number[]): Uint8Array {
  const distance = new Uint8Array(geo.n).fill(255);
  for (const origin of origins) addOrigin(geo, distance, origin);
  return distance;
}

class Run {
  readonly sims: Sim[];
  readonly occupied: Uint8Array;
  holder: number;
  deck: number;
  private readonly players: number;

  constructor(readonly start: ForecastStart) {
    this.players = start.seats.length;
    this.occupied = Uint8Array.from(start.occupied);
    this.holder = start.holder;
    this.deck = start.deck;
    this.sims = start.seats.map((s, i) => ({
      pace: s.pace,
      income: { ...s.pace.income },
      rates: { ...s.pace.rates },
      wild: s.pace.wild,
      hand: { ...s.hand },
      points: s.points,
      settlements: [...s.settlements],
      frontier: [...s.frontier],
      distance: distancesFrom(start.geo, s.frontier),
      settlementsLeft: s.settlementsLeft,
      citiesLeft: s.citiesLeft,
      piecesLeft: s.piecesLeft,
      road: s.road,
      built: 0,
      // Seats after us this round act that much later.
      clock: ((i - start.me + this.players) % this.players) / this.players,
      outlook: { finish: LAST_ROUND, atFive: null, atSeven: null, incomeTen: 0, incomeTwenty: 0, settled: 0 },
      next: null,
    }));
  }

  private incomeAt(c: number): CornerIncome {
    return this.start.incomeAt?.(c) ?? cornerIncome(this.start.geo, c, this.players);
  }

  private wait(seat: Sim, cost: ResourceBag): number {
    const pace = { income: seat.income, wild: seat.wild, rates: seat.rates };
    return roundsToAfford(seat.hand, pace, cost);
  }

  private roundsLeft(): number {
    const leader = Math.max(...this.sims.map(s => s.points));
    return Math.max(2, Math.min(25, this.start.roundsPerPoint * Math.max(1, this.start.target - leader)));
  }

  private roadLength(seat: Sim): number {
    return seat.road[Math.min(seat.road.length - 1, Math.floor(seat.built))] ?? 0;
  }

  /** Points the road award would bring if this seat got `pieces` more on its trail. */
  private roadGain(seat: Sim, index: number, pieces: number): number {
    const at = seat.road[Math.min(seat.road.length - 1, Math.floor(seat.built + pieces))] ?? 0;
    if (index === this.holder || at < MIN_ROAD) return 0;
    const best = this.holder >= 0 ? this.roadLength(this.sims[this.holder]!) : MIN_ROAD - 1;
    return at > best ? ROAD_AWARD : 0;
  }

  /** The seat's best next build: most worth for the wait. */
  private choose(index: number): Step | null {
    const seat = this.sims[index]!;
    const { geo, pointPerCard, reach } = this.start;
    const rounds = this.roundsLeft();
    const worth = (gain: CornerIncome) => incomeWorth(seat, gain, this.players) * rounds * pointPerCard;
    let best: Step | null = null;
    let top = 0;
    const consider = (goal: FirstGoal, value: number, distance = 0, wait?: number) => {
      const cost = costOf(goal, distance);
      const w = wait ?? this.wait(seat, cost);
      const score = value / (1 + w);
      if (score > top) {
        top = score;
        best = { goal, distance, cost, at: seat.clock + w };
      }
    };
    if (seat.citiesLeft) {
      let corner = -1;
      let gain = 0;
      for (const c of seat.settlements) {
        const v = worth(this.incomeAt(c));
        if (v > gain) [corner, gain] = [c, v];
      }
      if (corner >= 0) consider({ kind: 'city', corner }, 1 + gain);
    }
    if (seat.settlementsLeft) {
      const waits = new Map<number, number>();
      for (let c = 0; c < geo.n; c++) {
        if (!geo.land[c] || !isOpen(geo, this.occupied, c)) continue;
        const d = seat.distance[c]!;
        if (d > Math.min(reach, seat.piecesLeft)) continue;
        let w = waits.get(d);
        if (w === undefined) {
          w = this.wait(seat, costOf({ kind: 'settlement', corner: c }, d));
          waits.set(d, w);
        }
        const road = this.roadGain(seat, index, d * ROUTE_ROAD_SHARE);
        consider({ kind: 'settlement', corner: c }, 1 + road + worth(this.incomeAt(c)), d, w);
      }
    }
    if (this.deck > 0) consider({ kind: 'development' }, CARD_POINTS + 2.2 * pointPerCard);
    for (let pieces = 1; pieces <= Math.min(4, seat.piecesLeft); pieces++) {
      const gain = this.roadGain(seat, index, pieces);
      if (gain) consider({ kind: 'road', pieces }, gain);
    }
    return best;
  }

  private note(seat: Sim, at: number): void {
    const o = seat.outlook;
    if (o.atFive === null && seat.points >= 5) o.atFive = at;
    if (o.atSeven === null && seat.points >= 7) o.atSeven = at;
  }

  /** Income snapshots for the rounds this seat has just passed. */
  private snapshot(seat: Sim, before: number, after: number): void {
    if (before < 10 && after >= 10) seat.outlook.incomeTen = totalIncome(seat);
    if (before < 20 && after >= 20) seat.outlook.incomeTwenty = totalIncome(seat);
  }

  private pay(seat: Sim, at: number, cost: ResourceBag): void {
    const dt = at - seat.clock;
    let need = 0;
    for (const r of RESOURCES) {
      seat.hand[r] += seat.income[r] * dt - cost[r];
      if (seat.hand[r] < 0) {
        need -= seat.hand[r];
        seat.hand[r] = 0;
      }
    }
    need = Math.max(0, need - seat.wild * dt);
    for (const r of RESOURCES) {
      if (need <= 0) break;
      const traded = Math.min(need, seat.hand[r] / seat.rates[r]);
      seat.hand[r] -= traded * seat.rates[r];
      need -= traded;
    }
  }

  private awardRoad(index: number): void {
    const seat = this.sims[index]!;
    const length = this.roadLength(seat);
    if (index === this.holder || length < MIN_ROAD) return;
    const best = this.holder >= 0 ? this.roadLength(this.sims[this.holder]!) : MIN_ROAD - 1;
    if (length <= best) return;
    if (this.holder >= 0) this.sims[this.holder]!.points -= ROAD_AWARD;
    seat.points += ROAD_AWARD;
    this.holder = index;
  }

  private addCorner(seat: Sim, c: number, times: number): void {
    const gain = this.incomeAt(c);
    for (const r of RESOURCES) seat.income[r] += gain.cards[r] * times;
    seat.wild += gain.wild * times;
  }

  private apply(index: number, step: Step): void {
    const seat = this.sims[index]!;
    const { geo } = this.start;
    const before = seat.clock;
    this.pay(seat, step.at, step.cost);
    seat.clock = step.at;
    const { goal } = step;
    if (goal.kind === 'city') {
      seat.citiesLeft--;
      seat.settlementsLeft++;
      seat.settlements = seat.settlements.filter(c => c !== goal.corner);
      seat.points += 1;
      this.addCorner(seat, goal.corner, 1);
    } else if (goal.kind === 'development') {
      this.deck--;
      seat.points += CARD_POINTS;
    } else if (goal.kind === 'road') {
      seat.built += goal.pieces;
      seat.piecesLeft -= goal.pieces;
      this.awardRoad(index);
    } else {
      const c = goal.corner;
      seat.settlementsLeft--;
      seat.piecesLeft -= step.distance;
      seat.built += step.distance * ROUTE_ROAD_SHARE;
      seat.settlements.push(c);
      seat.frontier.push(c);
      addOrigin(geo, seat.distance, c);
      seat.points += 1 + geo.bonus[c]!;
      seat.outlook.settled++;
      this.occupied[c] = 1;
      this.addCorner(seat, c, 1);
      const harbor = geo.harbor[c];
      if (harbor === 'any') for (const r of RESOURCES) seat.rates[r] = Math.min(seat.rates[r], 3);
      else if (harbor) seat.rates[harbor] = 2;
      this.awardRoad(index);
      // Anyone heading for this spot, or one next to it, picks again.
      for (const other of this.sims) {
        const g = other.next?.goal;
        if (g?.kind === 'settlement' && !isOpen(geo, this.occupied, g.corner)) other.next = null;
      }
    }
    seat.next = null;
    this.snapshot(seat, before, seat.clock);
    this.note(seat, seat.clock);
  }

  play(first: FirstGoal | undefined): void {
    const me = this.start.me;
    if (first) {
      const seat = this.sims[me]!;
      const distance = first.kind === 'settlement' ? seat.distance[first.corner]! : 0;
      const cost = costOf(first, distance);
      seat.next = { goal: first, distance, cost, at: seat.clock + this.wait(seat, cost) };
    }
    const limit = 16 * this.players;
    for (let event = 0; event < limit; event++) {
      let index = -1;
      let soonest = LAST_ROUND;
      this.sims.forEach((seat, i) => {
        seat.next ??= this.choose(i);
        if (seat.next && seat.next.at < soonest) [index, soonest] = [i, seat.next.at];
      });
      if (index < 0) return;
      this.apply(index, this.sims[index]!.next!);
      const seat = this.sims[index]!;
      if (seat.points >= this.start.target) {
        seat.outlook.finish = seat.clock;
        return;
      }
    }
  }

  /** Each seat's outlook: finished seats by their time, the rest by their pace so far. */
  result(): Forecast {
    const { target, spread } = this.start;
    const now = Math.max(1, ...this.sims.map(s => s.clock));
    const seats = this.sims.map((seat, i) => {
      const o = seat.outlook;
      if (seat.points < target) {
        const gained = Math.max(0.2, seat.points - this.start.seats[i]!.points);
        o.finish = Math.min(LAST_ROUND * 2, now + ((target - seat.points) * Math.max(1, seat.clock)) / gained);
      }
      o.incomeTen ||= totalIncome(seat);
      o.incomeTwenty ||= totalIncome(seat);
      return o;
    });
    const soonest = Math.min(...seats.map(s => s.finish));
    // A finish further away is less certain: dice and rivals' choices pile up with every round.
    const scale = spread * Math.sqrt(Math.max(1, soonest));
    const weights = seats.map(s => Math.exp((soonest - s.finish) / scale));
    const sum = weights.reduce((a, b) => a + b, 0);
    return { seats, chances: weights.map(w => w / sum) };
  }
}

/** Plays the forecast forward; `first` makes our seat start with that goal. */
export function forecast(start: ForecastStart, first?: FirstGoal): Forecast {
  const run = new Run(start);
  run.play(first);
  return run.result();
}
