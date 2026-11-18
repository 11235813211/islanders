import { BUILD_COSTS, emptyBag } from '../../engine/core';
import { isRoadEdge, isShipEdge } from '../../seafaring';
import { type Board, type GameView, RESOURCES, type ResourceBag } from '../../types';
import { COSTS } from '../analysis';
import type { Economy } from './economy';
import type { Geometry } from './geometry';
import { type Pace, paceFrom, roundsToAfford } from './goals';
import { horizon } from './plans';
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

/** New pieces we look ahead per seat. */
const MAX_NEW = 6;
/** Steps of the trail search per seat, so a tangled network can't cost a whole move. */
const SEARCH_LIMIT = 2500;
/** Road building share of a rival's income when its roads also lead where it wants to settle. */
const HEADING_SHARE = 0.85;
/** Rivals, corners and edges tried as blocks per decision. */
const BLOCK_RIVALS = 2;
const BLOCK_CORNERS = 4;
const BLOCK_EDGES = 2;

interface Graph {
  ids: string[];
  indexOf: Map<string, number>;
  ship: Uint8Array;
  /** Per corner: the edges a road or ship could use, and the corner each leads to. */
  links: { edge: number; to: number }[][];
}

/** Who holds what: edge owners and building owners by seat (-1: nobody). */
interface World {
  edges: Int8Array;
  corners: Int8Array;
}

/** How far a seat's longest trail can grow. */
export interface RoadReach {
  /** Per number of new pieces (index): the longest trail possible. Never falls. */
  curve: number[];
  /** Per number of new pieces: the new edges of that trail, in building order. */
  paths: number[][];
  /** Per number of new pieces: the corners that trail passes through. */
  corners: number[][];
}

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
  /** Extra payoff for a route whose first piece also lengthens our road. */
  routeCredit(firstEdge: string | null, pieces: number): number;
  /** The numbers behind the plans, for checking them against real games. */
  summary(): RoadSummary;
}

/** What the race expects: rounds left, our chance without trying, and each way of trying. */
export interface RoadSummary {
  left: number;
  base: number;
  options: { pieces: number; length: number; arrive: number; keep: number; chance: number }[];
}

const graphs = new WeakMap<Board, Map<boolean, Graph>>();

function graphOf(view: GameView, cornerOf: Map<string, number>): Graph {
  let bySea = graphs.get(view.board);
  if (!bySea) {
    bySea = new Map();
    graphs.set(view.board, bySea);
  }
  let graph = bySea.get(view.seafaring);
  if (graph) return graph;
  const { board, seafaring } = view;
  const usable = board.edges.filter(e => isRoadEdge(board, e.id) || (seafaring && isShipEdge(board, e.id)));
  const links: Graph['links'] = board.vertices.map(() => []);
  const ship = new Uint8Array(usable.length);
  usable.forEach((e, edge) => {
    const [a, b] = [cornerOf.get(e.a)!, cornerOf.get(e.b)!];
    links[a]!.push({ edge, to: b });
    links[b]!.push({ edge, to: a });
    ship[edge] = isRoadEdge(board, e.id) ? 0 : 1;
  });
  graph = { ids: usable.map(e => e.id), indexOf: new Map(usable.map((e, i) => [e.id, i])), ship, links };
  bySea.set(seafaring, graph);
  return graph;
}

function worldOf(view: GameView, graph: Graph, cornerOf: Map<string, number>): World {
  const seat = new Map(view.players.map((p, i) => [p.id, i]));
  const edges = new Int8Array(graph.ids.length).fill(-1);
  for (const pieces of [view.roads, view.ships])
    for (const [id, owner] of Object.entries(pieces)) {
      const e = graph.indexOf.get(id);
      if (e !== undefined) edges[e] = seat.get(owner) ?? -1;
    }
  const corners = new Int8Array(view.board.vertices.length).fill(-1);
  for (const [id, b] of Object.entries(view.buildings)) corners[cornerOf.get(id)!] = seat.get(b.playerId) ?? -1;
  return { edges, corners };
}

/** A hypothetical change for `roadCurves`: a new building or road, or a whole draft of corners. */
export type BoardChange = { corner?: number; edge?: string; seat?: number; owners?: Int8Array };

/** Each seat's longest road by number of new pieces, optionally after a change to the board. */
export function roadCurves(view: GameView, geo: Geometry, change: BoardChange = {}): number[][] {
  const graph = graphOf(view, geo.indexOf);
  const world = worldOf(view, graph, geo.indexOf);
  if (change.owners) world.corners = change.owners;
  if (change.corner !== undefined) world.corners[change.corner] = change.seat!;
  const edge = change.edge === undefined ? undefined : graph.indexOf.get(change.edge);
  if (edge !== undefined) world.edges[edge] = change.seat!;
  return view.players.map((p, s) => reachOf(graph, world, s, p.roadsLeft + (p.shipsLeft ?? 0)).curve);
}

/** The longest trail a seat can make with each number of new pieces. */
export function reachOf(graph: Graph, world: World, seat: number, pieces: number): RoadReach {
  const most = Math.min(MAX_NEW, pieces);
  const curve = new Array<number>(most + 1).fill(0);
  const paths: number[][] = Array.from({ length: most + 1 }, () => []);
  const corners: number[][] = Array.from({ length: most + 1 }, () => []);
  const used = new Uint8Array(world.edges.length);
  const fresh: number[] = [];
  const visited: number[] = [];
  let steps = 0;
  const walk = (c: number, length: number, paid: number) => {
    visited.push(c);
    if (length > curve[paid]!) {
      curve[paid] = length;
      paths[paid] = [...fresh];
      corners[paid] = [...visited];
    }
    const blocked = length > 0 && world.corners[c]! >= 0 && world.corners[c] !== seat;
    if (!blocked)
      for (const { edge, to } of graph.links[c]!) {
        if (used[edge] || steps > SEARCH_LIMIT) continue;
        const owner = world.edges[edge]!;
        const free = owner === -1 && paid < most;
        if (owner !== seat && !free) continue;
        steps++;
        used[edge] = 1;
        if (free) fresh.push(edge);
        walk(to, length + 1, paid + (free ? 1 : 0));
        if (free) fresh.pop();
        used[edge] = 0;
      }
    visited.pop();
  };
  for (let c = 0; c < graph.links.length; c++) {
    const touches = world.corners[c] === seat || graph.links[c]!.some(l => world.edges[l.edge] === seat);
    if (touches) walk(c, 0, 0);
  }
  for (let p = 1; p <= most; p++)
    if (curve[p]! < curve[p - 1]!) {
      curve[p] = curve[p - 1]!;
      paths[p] = paths[p - 1]!;
      corners[p] = corners[p - 1]!;
    }
  return { curve, paths, corners };
}

function pathCost(graph: Graph, path: number[]): ResourceBag {
  const cost = emptyBag();
  for (const edge of path) {
    const piece = graph.ship[edge] ? BUILD_COSTS.ship : COSTS.road;
    for (const r of RESOURCES) cost[r] += piece[r];
  }
  return cost;
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

  standing(world = this.world): Standing {
    return new Standing(
      this,
      this.econ.view.players.map((p, s) => reachOf(this.graph, world, s, p.roadsLeft + (p.shipsLeft ?? 0))),
    );
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
  const now = race.standing();
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
      payoff: race.worth(main) * (chance - base),
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
    blockAt: corner => econ.knobs.roadRoute * (blocks.get(corner) ?? 0),
    routeCredit(firstEdge, pieces) {
      const first = firstEdge === null ? undefined : graph.indexOf.get(firstEdge);
      if (first === undefined) return 0;
      let credit = 0;
      for (const [p, gain] of gains)
        if (p <= pieces && mine.paths[p]!.includes(first)) credit = Math.max(credit, race.worth(main) * gain);
      return econ.knobs.roadRoute * credit;
    },
  };
}
