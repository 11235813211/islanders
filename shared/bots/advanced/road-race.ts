import type { GameView, ResourceBag } from '../../types';
import type { Economy } from './economy';
import type { Geometry } from './geometry';
import { type Pace, paceFrom, roundsToAfford } from './goals';
import { horizon } from './plans';
import {
  type Graph,
  graphOf,
  MAX_NEW,
  pathCost,
  type RoadReach,
  reachOf,
  SEARCH_LIMIT,
  type World,
  worldOf,
} from './road-graph';
import { openWeights, routeEdges } from './road-links';
import { harborRates } from './value';

/**
 * Longest Road as a race, the way a player reasons about it: how long will the game last, how many
 * roads can my income (harbor trades included) pay for by then, how far can each rival still
 * extend given where their roads can go and where they are heading, and would a settlement or road
 * of mine cut them off? No distance limit: being four roads behind is fine with a strong road
 * engine and a long game, and hopeless with neither.
 *
 * Length is estimated on the board as it stands, including the corners rival buildings block. It
 * ignores the rule that a road and a ship join only at a building, which matters on few maps.
 */

/** Road building share of a rival's income when its roads also lead where it wants to settle. */
const HEADING_SHARE = 0.85;
/** Rivals, corners and edges tried as blocks per decision. */
const BLOCK_RIVALS = 2;
const BLOCK_CORNERS = 4;
const BLOCK_EDGES = 2;

/** A road plan the planner can weigh like any other. */
export interface RoadPlan {
  edge: string;
  cost: ResourceBag;
  payoff: number;
  spare: boolean;
}

/** What the race adds to the plan list. */
export interface RoadRace {
  plans: RoadPlan[];
  /** Extra payoff for settling a corner because of what it cuts off. */
  blockAt(corner: number): number;
  /** Extra payoff for a settlement route, by how much that exact route helps our road. */
  routeCredit(firstEdge: string | null, pieces: number, corner: number): number;
  /** The numbers behind the plans, for checking them against real games. */
  summary(): RoadSummary;
}

/** What the race expects: rounds left, our chance without trying, and each way of trying. */
export interface RoadSummary {
  left: number;
  base: number;
  options: { pieces: number; length: number; arrive: number; keep: number; chance: number }[];
}

/** A hypothetical change for `roadCurves`: a new building or road, or a whole draft of corners. */
export type BoardChange = {
  corner?: number;
  edge?: string;
  seat?: number;
  owners?: Int8Array;
  /** Look only this many pieces ahead, with this many search steps (placement checks many starts). */
  depth?: number;
  limit?: number;
};

/** Each seat's longest road by number of new pieces, optionally after a change to the board. */
export function roadCurves(view: GameView, geo: Geometry, change: BoardChange = {}): number[][] {
  const graph = graphOf(view, geo.indexOf);
  const world = worldOf(view, graph, geo.indexOf);
  if (change.owners) world.corners = change.owners;
  if (change.corner !== undefined) world.corners[change.corner] = change.seat!;
  const edge = change.edge === undefined ? undefined : graph.indexOf.get(change.edge);
  if (edge !== undefined) world.edges[edge] = change.seat!;
  return view.players.map(
    (p, s) => reachOf(graph, world, s, p.roadsLeft + (p.shipsLeft ?? 0), change.depth, change.limit).curve,
  );
}

/** One position of the race: every seat's reach, read against the game's expected length. */
class Standing {
  constructor(
    readonly race: Race,
    readonly reach: RoadReach[],
  ) {}

  /** Chance `seat` reaches `length` before the game ends, spending its usual share on roads. */
  chanceOfLength(seat: number, length: number): number {
    const { curve, paths } = this.reach[seat]!;
    const p = curve.findIndex(l => l >= length);
    if (p < 0) return 0;
    if (p === 0) return 1;
    return this.race.intime(this.race.rounds(seat, paths[p]!) / this.race.share(seat, this.reach[seat]!, p));
  }

  /** The length `seat` must reach to hold the award now: ties stay with the holder. */
  needed(seat: number): number {
    const best = Math.max(0, ...this.reach.map((r, s) => (s === seat ? 0 : r.curve[0]!)));
    return Math.max(5, seat === this.race.holder ? best : best + 1);
  }

  /** Chance `seat` ends up able to hold the award, if nobody else outgrows it. */
  holdChance(seat: number): number {
    return this.chanceOfLength(seat, this.needed(seat));
  }

  /** Chance no rival grows past `length`. */
  keepChance(length: number): number {
    const me = this.race.me;
    return this.reach.reduce((n, _, s) => (s === me ? n : n * (1 - this.chanceOfLength(s, length + 1))), 1);
  }

  /**
   * Our chance of ending with the award if we don't go out of our way: roads built for other
   * reasons lengthen our trail too, so only what committing adds to this is worth paying for.
   */
  baseline(): number {
    const { me } = this.race;
    const { curve, paths } = this.reach[me]!;
    const need = this.needed(me);
    let best = 0;
    for (let p = 0; p < curve.length; p++) {
      if (curve[p]! < need) continue;
      const arrive = p
        ? this.race.intime(this.race.rounds(me, paths[p]!) / this.race.share(me, this.reach[me]!, p))
        : 1;
      best = Math.max(best, arrive * this.keepChance(curve[p]!));
    }
    return best;
  }

  /** Per number of new pieces that lengthens our road: our chance of ending with the award. */
  options(): RoadSummary['options'] {
    const { me } = this.race;
    const { curve, paths } = this.reach[me]!;
    const base = this.baseline();
    const need = this.needed(me);
    const out: RoadSummary['options'] = [];
    for (let p = 1; p < curve.length; p++) {
      if (curve[p]! <= curve[p - 1]! || curve[p]! < need) continue;
      // Even committed, most income still goes to the rest of the game.
      const share = Math.max(this.race.econ.knobs.roadCommit, this.race.share(me, this.reach[me]!, p));
      const arrive = this.race.intime(this.race.rounds(me, paths[p]!) / share);
      const keep = this.keepChance(curve[p]!);
      out.push({ pieces: p, length: curve[p]!, arrive, keep, chance: arrive * keep + (1 - arrive) * base });
    }
    return out;
  }

  /** Our best chance at the award from here. */
  best(): number {
    return Math.max(this.baseline(), ...this.options().map(o => o.chance));
  }
}

/** The fixed facts of one decision's race. */
class Race {
  readonly graph: Graph;
  readonly world: World;
  readonly me: number;
  readonly holder: number;
  /** Rounds the game probably has left. */
  readonly left: number;
  private readonly paces: Pace[];
  private readonly heading: Set<number>[];

  constructor(readonly econ: Economy) {
    const { view, geo, seat } = econ;
    this.graph = graphOf(view, geo.indexOf);
    this.world = worldOf(view, this.graph, geo.indexOf);
    this.me = seat;
    this.holder = view.players.findIndex(p => p.id === view.longestRoadId);
    this.left = horizon(econ).rounds;
    this.paces = view.players.map(p => {
      const { production, choice } = econ.productionOf(p.id);
      return paceFrom(econ, production, choice, harborRates(econ, p.id));
    });
    // Where each rival is heading: roads toward those corners are built anyway.
    this.heading = econ.races.intents.map(list => new Set(list.filter(t => t.share >= 0.2).map(t => t.corner)));
  }

  /** Every seat's reach on `world`; `prefer` picks among our equally long trails. */
  standing(world = this.world, prefer?: Float64Array): Standing {
    return new Standing(
      this,
      this.econ.view.players.map((p, s) =>
        reachOf(
          this.graph,
          world,
          s,
          p.roadsLeft + (p.shipsLeft ?? 0),
          MAX_NEW,
          SEARCH_LIMIT,
          s === this.me ? prefer : undefined,
        ),
      ),
    );
  }

  /** `now` with only our reach redone for `world`, where we have already used `used` pieces. */
  withOurReach(now: Standing, world: World, used: number): Standing {
    const { self } = this.econ;
    const pieces = Math.max(0, self.roadsLeft + (self.shipsLeft ?? 0) - used);
    const reach = [...now.reach];
    reach[this.me] = reachOf(this.graph, world, this.me, pieces);
    return new Standing(this, reach);
  }

  /** Rounds for a seat's income, harbors and hand to pay for these pieces. */
  rounds(seat: number, path: number[]): number {
    const { view } = this.econ;
    return roundsToAfford(this.econ.handOf(view.players[seat]!.id), this.paces[seat]!, pathCost(this.graph, path));
  }

  /** Share of a seat's income going to these roads if it just plays its game. */
  share(seat: number, reach: RoadReach, p: number): number {
    const toward = reach.corners[p]!.some(c => this.heading[seat]!.has(c));
    return toward ? HEADING_SHARE : this.econ.knobs.roadShare;
  }

  /** Chance something `rounds` away happens before the game ends. */
  intime(rounds: number): number {
    return 1 / (1 + Math.exp((rounds - this.left) / Math.max(1, this.left / 4)));
  }

  /** How much of a rival's two points we count as ours when it gains or loses them. */
  rivalWeight(rival: number): number {
    const { view, self } = this.econ;
    const n = view.players.length;
    if (n === 2) return 1;
    const lead = view.players[rival]!.publicPoints - self.publicPoints;
    return Math.min(1, 1 / (n - 1) + Math.max(0, lead) * 0.1);
  }

  /** The award's worth to us, in points, with `rival` as the one it comes from or goes to. */
  worth(rival: number): number {
    const { self, victoryTarget, knobs } = this.econ;
    const decides = self.points + 2 >= victoryTarget ? 3 : 0;
    return knobs.roadRace * (2 + this.rivalWeight(rival) + decides);
  }
}

/** The rivals most likely to end up with the award, most likely first. */
function contenders(race: Race, now: Standing): number[] {
  return race.econ.view.players
    .map((_, s) => s)
    .filter(s => s !== race.me)
    .map(s => ({ s, chance: now.holdChance(s) }))
    .filter(r => r.chance > 0.02)
    .sort((a, b) => b.chance - a.chance)
    .slice(0, BLOCK_RIVALS)
    .map(r => r.s);
}

/** What a change to the board is worth: our better chance, and the rival's worse one. */
function changeValue(race: Race, now: Standing, rival: number, world: World): number {
  const after = race.standing(world);
  const ours = after.best() - now.best();
  const theirs = now.holdChance(rival) - after.holdChance(rival);
  return race.worth(rival) * (ours + race.rivalWeight(rival) * theirs);
}

/** How much a trail through these corners opens up, from 0 to nearly 1. */
function openedShare(opens: Float64Array | undefined, corners: number[]): number {
  if (!opens) return 0;
  let best = 0;
  for (const c of corners) best = Math.max(best, opens[c]!);
  return best / (1 + best);
}

const races = new WeakMap<Economy, RoadRace>();

/** The Longest Road race for this decision (once per decision). */
export function roadRace(econ: Economy): RoadRace {
  let out = races.get(econ);
  if (!out) {
    out = buildRace(econ);
    races.set(econ, out);
  }
  return out;
}

function buildRace(econ: Economy): RoadRace {
  const race = new Race(econ);
  const { graph, world, me } = race;
  const opens = econ.knobs.roadOpens > 0 ? openWeights(econ, graph) : undefined;
  const now = race.standing(world, opens);
  const mine = now.reach[me]!;
  const base = now.baseline();
  const rivals = contenders(race, now);
  const main = rivals[0] ?? (me + 1) % econ.view.players.length;
  const plans: RoadPlan[] = [];
  const gains = new Map<number, number>();
  const summary = () => ({ left: race.left, base, options: now.options() });
  // Roads don't compound: early cards go to what does. Measured: early road moves lost games.
  if (race.left > econ.knobs.roadFrom) return { plans, summary, blockAt: () => 0, routeCredit: () => 0 };
  // Spare cards only, unless these two points decide the game.
  const spare = econ.self.points + 2 < econ.victoryTarget;
  for (const { pieces, chance } of now.options()) {
    gains.set(pieces, chance - base);
    if (chance <= base) continue;
    const path = mine.paths[pieces]!;
    plans.push({
      edge: graph.ids[path[0]!]!,
      cost: pathCost(graph, path),
      // A share of the race's own worth, so a road that leads somewhere comes first among road
      // plans without making roads worth more to the hand than the race says.
      payoff:
        race.worth(main) * (chance - base) * (1 + econ.knobs.roadOpens * openedShare(opens, mine.corners[pieces]!)),
      spare,
    });
  }
  const legal = new Set([...econ.view.legal.roads, ...econ.view.legal.ships]);
  const blocks = new Map<number, number>();
  for (const rival of rivals) {
    const { corners, paths, curve } = now.reach[rival]!;
    const top = curve.length - 1;
    // Their trail's corners we could actually settle soon: it cuts the trail there.
    const spots = corners[top]!.filter(c => world.corners[c] === -1 && econ.reachableSoon(c)).slice(0, BLOCK_CORNERS);
    for (const c of spots) {
      const corners2 = Int8Array.from(world.corners);
      corners2[c] = me;
      const value = changeValue(race, now, rival, { edges: world.edges, corners: corners2 });
      if (value > 0) blocks.set(c, Math.max(blocks.get(c) ?? 0, value));
    }
    // Edges they need that we can build on right now.
    for (const edge of paths[top]!.filter(e => legal.has(graph.ids[e]!)).slice(0, BLOCK_EDGES)) {
      const edges = Int8Array.from(world.edges);
      edges[edge] = me;
      const value = changeValue(race, now, rival, { edges, corners: world.corners });
      if (value > 0) plans.push({ edge: graph.ids[edge]!, cost: pathCost(graph, [edge]), payoff: value, spare });
    }
  }
  return {
    plans,
    summary,
    blockAt: corner => econ.knobs.roadBlock * (blocks.get(corner) ?? 0),
    routeCredit(firstEdge, pieces, corner) {
      const route = routeEdges(graph, world, me, firstEdge, corner, pieces);
      if (!route) return 0;
      const edges = Int8Array.from(world.edges);
      for (const e of route) edges[e] = me;
      const corners = Int8Array.from(world.corners);
      corners[corner] = me;
      const after = race.withOurReach(now, { edges, corners }, route.length).baseline();
      if (after <= base) return 0;
      return econ.knobs.roadRoute * race.worth(main) * race.intime(race.rounds(me, route)) * (after - base);
    },
  };
}
