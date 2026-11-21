import { BUILD_COSTS } from '../../engine/core';
import { type ResourceBag, TILE_RESOURCES } from '../../types';
import { maySettle } from '../analysis';
import type { Economy } from './economy';
import { distanceFrom, isOpen } from './geometry';
import { harborRates } from './value';

/**
 * Settlement races (training/PLAN.md Phase 1): where each player is likely heading next, and who
 * gets to each open corner first. A strong player reads the table this way: rivals go for what's
 * good for *them* and near *them*; a corner counts for us only by the chance we get there first.
 *
 * Every player's targets are scored the way we score ours (`Economy.worthFor` with their
 * production, discounted by distance). Arrival is in rounds: the cards for the settlement and the
 * pieces on the way, at their expected income (`turnsWith`, public card count, their harbors),
 * then turn order breaks ties. Only what the view shows is used.
 */

export interface Intent {
  /** Corner index (geometry). */
  corner: number;
  /** Share of this player's next settlement we expect there (a player's shares sum to 1). */
  share: number;
}

export interface Races {
  /** Per seat (view.players order): likely next settlement corners, most likely first. */
  intents: Intent[][];
  /** Chance we settle a corner before any rival (1 where nobody contests it). */
  oursAt(corner: number): number;
}

/** Corners further than this many pieces aren't a player's next target. */
const REACH = { land: 5, sea: 7 };
/** How many targets a player's intent is spread over, and how sharply it favors the best. */
const SPREAD = 3;
const SHARPNESS = 3;
/** A corner a player's routes already reach is usually settled before building toward another. */
const REACHED = 3;
/** Rounds of uncertainty in arrival estimates (a logistic scale). */
const ARRIVAL_SPREAD = 1;

/** Who is likely to settle where, for this decision (cheap: one pass over open corners per seat). */
export function races(econ: Economy): Races {
  const { view, geo } = econ;
  const n = view.players.length;
  const reach = view.seafaring ? REACH.sea : REACH.land;
  const occupied = new Uint8Array(geo.n);
  for (const id of Object.keys(view.buildings)) occupied[geo.indexOf.get(id)!] = 1;
  const open: number[] = [];
  for (let c = 0; c < geo.n; c++)
    if (geo.land[c] && isOpen(geo, occupied, c) && maySettle(view, geo.ids[c]!)) open.push(c);

  // Per seat: pieces to each open corner it could settle next.
  const distance = view.players.map(() => new Map<number, number>());
  // Rounds for each seat to settle each of those corners.
  const arrival = view.players.map((p, seat) => {
    const out = new Map<number, number>();
    const frontier = econ.frontiers[seat]!;
    if (!p.settlementsLeft || !frontier.length) return out;
    const { production, choice } = econ.productionOf(p.id);
    const hand = econ.handOf(p.id);
    const rates = harborRates(econ, p.id);
    const pieces = p.roadsLeft + (view.seafaring ? p.shipsLeft : 0);
    const byDistance = new Map<number, number>();
    // Players act in turn: anyone after us this round is that much of a round later.
    const offset = ((seat - econ.seat + n) % n) / n;
    for (const c of open) {
      const d = distanceFrom(geo, frontier, c);
      if (d > reach || d > pieces) continue;
      let rounds = byDistance.get(d);
      if (rounds === undefined) {
        rounds = econ.turnsWith(hand, production, choice, routeCost(d), rates);
        byDistance.set(d, rounds);
      }
      out.set(c, rounds + offset);
      distance[seat]!.set(c, d);
    }
    return out;
  });

  const intents = view.players.map((p, seat) => {
    const { production } = econ.productionOf(p.id);
    const scored: Intent[] = [];
    // Scored as we score our own targets (Economy.bestTarget), without the race.
    for (const [c, d] of distance[seat]!) {
      const worth = econ.worthFor(geo.ids[c]!, p.id, production);
      const reached = d === 0 ? REACHED : 1;
      scored.push({ corner: c, share: (reached * worth) / (1 + econ.knobs.distanceCost * d ** 1.5) });
    }
    scored.sort((a, b) => b.share - a.share);
    const top = scored.slice(0, SPREAD);
    const total = top.reduce((s, t) => s + t.share ** SHARPNESS, 0);
    return top.map(t => ({ corner: t.corner, share: total ? t.share ** SHARPNESS / total : 0 }));
  });

  const cache = new Map<number, number>();
  return {
    intents,
    oursAt(corner) {
      let p = cache.get(corner);
      if (p !== undefined) return p;
      p = 1;
      const mine = arrival[econ.seat]!.get(corner) ?? 99;
      intents.forEach((list, seat) => {
        if (seat === econ.seat) return;
        const intent = list.find(t => t.corner === corner);
        const theirs = arrival[seat]!.get(corner);
        if (!intent || theirs === undefined) return;
        const beat = 1 / (1 + Math.exp((theirs - mine) / ARRIVAL_SPREAD));
        p! *= 1 - intent.share * beat;
      });
      cache.set(corner, p);
      return p;
    },
  };
}

/** A settlement plus `d` roads' worth of cards (ships cost about the same in cards). */
function routeCost(d: number): ResourceBag {
  const cost = { ...BUILD_COSTS.settlement };
  for (const r of TILE_RESOURCES) cost[r] += d * BUILD_COSTS.road[r];
  return cost;
}
