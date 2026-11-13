import { boardIndex } from '../../seafaring';
import { CLASSIC_RESOURCES, type GameAction, type GameView } from '../../types';
import { linkAction } from '../analysis';
import { classicSlot, distanceFrom, type Geometry, geometry, isOpen } from './geometry';
import { predict } from './net';
import { type AdvancedParams, type Knobs, makeParams } from './params';

/**
 * Starting placements. A starting position is scored by board-agnostic features (dice odds per
 * resource, variety, harbors, and how good a spot each player can reach before the others: the
 * race for gold fields and bonus islands on sea maps), by the trained setup network when there is
 * one, else by a hand-set prior.
 *
 * Each candidate corner is judged by the position it leads to: the rest of the snake draft is
 * played out with every opponent taking its best corner by a quick score, and this bot taking its
 * own best second corner, so it sees which spots will be gone before its next pick.
 */

/** Setup network inputs, in order. Keep in step with `features` (the net checks the names). */
export const SETUP_FEATURES = [
  'wood',
  'brick',
  'sheep',
  'wheat',
  'ore',
  'gold',
  'volcanoPays',
  'volcanoRisk',
  'jungle',
  'total',
  'kinds',
  'missing',
  'woodBrick',
  'wheatOre',
  'numbers',
  'oneNumberShare',
  'harbor21',
  'harbor31',
  'scarceTotal',
  'reachNear',
  'reachRace',
  'goldReach',
  'bonusReach',
  'openNear',
  'coast',
  'players',
  'seat',
  'target',
  'seafaring',
  'friendlyRobber',
  'oppMaxTotal',
  'oppMeanTotal',
  'leadOverBest',
  'oppBestReach',
] as const;

interface Context {
  view: GameView;
  geo: Geometry;
  knobs: Knobs;
  params: AdvancedParams;
  /** Seat indices (view.players order) in snake order. */
  order: number[];
  me: number;
  players: number;
  /** Per resource: board average pips / this resource's pips, so scarce resources count more. */
  scarcity: number[];
  /** Corners a starting settlement may take (ignoring buildings), best quick value first. */
  starts: number[];
  maxReach: number;
  /** Cache for `prize`. */
  prizes?: Map<number, number>;
  prizeCorners?: number[];
}

function context(view: GameView, params: AdvancedParams): Context {
  const geo = geometry(view);
  const players = view.players.length;
  const seats = view.players.map((_, i) => i);
  const average = geo.boardPips.reduce((a, b) => a + b, 0) / 5 || 1;
  const knobs = params.knobs;
  const ctx: Context = {
    view,
    geo,
    knobs,
    params,
    order: [...seats, ...[...seats].reverse()],
    me: view.players.findIndex(p => p.id === view.selfId),
    players,
    scarcity: CLASSIC_RESOURCES.map((_, r) => Math.min(2, Math.max(0.6, average / Math.max(1, geo.boardPips[r]!)))),
    starts: [],
    maxReach: view.seafaring ? 8 : 4,
  };
  const volcanoBlocked = !view.settings.volcanoStart;
  const starts: number[] = [];
  for (let c = 0; c < geo.n; c++)
    if (geo.land[c] && !geo.noSetup[c] && !(volcanoBlocked && geo.nearVolcano[c])) starts.push(c);
  const base = starts.map(c => cornerValue(ctx, c));
  ctx.starts = starts
    .map((c, i) => [c, base[i]!] as const)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);
  return ctx;
}

/** A corner's worth by its dice: scarce resources and gold count more. */
function cornerValue(ctx: Context, c: number, knobs = ctx.knobs): number {
  const { geo } = ctx;
  const gold = knobs.goldSpot;
  const volcano = ctx.view.settings.volcanoGold ? gold * 0.75 : 0;
  let v = geo.gold[c]! * gold + geo.volcano[c]! * volcano + geo.jungle[c]! * 0.5;
  for (let r = 0; r < 5; r++) v += geo.pips[c * 5 + r]! * ctx.scarcity[r]!;
  return v;
}

/** Who owns each corner (-1: nobody), from the view's buildings. */
function ownersOf(ctx: Context): Int8Array {
  const owners = new Int8Array(ctx.geo.n).fill(-1);
  const seat = new Map(ctx.view.players.map((p, i) => [p.id, i]));
  for (const [id, b] of Object.entries(ctx.view.buildings)) owners[ctx.geo.indexOf.get(id)!] = seat.get(b.playerId)!;
  return owners;
}

const cornersOf = (owners: Int8Array, seat: number): number[] => {
  const out: number[] = [];
  for (let c = 0; c < owners.length; c++) if (owners[c] === seat) out.push(c);
  return out;
};

const occupiedOf = (owners: Int8Array): Uint8Array => Uint8Array.from(owners, o => (o >= 0 ? 1 : 0));

/** Quick score for `seat` taking corner `c`: value, plus new kinds of resource and a fitting harbor. */
function quickScore(ctx: Context, own: number[], c: number, variety: number): number {
  const { geo, knobs } = ctx;
  const have = new Uint8Array(6);
  for (const o of own) {
    for (let r = 0; r < 5; r++) if (geo.pips[o * 5 + r]) have[r] = 1;
    if (geo.gold[o]) have[5] = 1;
  }
  let fresh = 0;
  for (let r = 0; r < 5; r++) if (geo.pips[c * 5 + r] && !have[r]) fresh++;
  if (geo.gold[c] && !have[5]) fresh++;
  let score = cornerValue(ctx, c) + variety * fresh;
  const harbor = geo.harbor[c];
  if (harbor === 'any') score += knobs.quickHarbor * 0.5;
  else if (harbor && classicSlot(harbor) >= 0) {
    const r = classicSlot(harbor);
    let pips = geo.pips[c * 5 + r]!;
    for (const o of own) pips += geo.pips[o * 5 + r]!;
    score += pips >= 5 ? knobs.quickHarbor : knobs.quickHarbor * 0.25;
  }
  return score;
}

/** A seat's best open starting corner by quick score (looking at the best few by value). */
function greedyPick(ctx: Context, owners: Int8Array, seat: number, variety: number): number {
  const occupied = occupiedOf(owners);
  const own = cornersOf(owners, seat);
  let best = -1;
  let bestScore = -Infinity;
  let looked = 0;
  for (const c of ctx.starts) {
    if (!isOpen(ctx.geo, occupied, c)) continue;
    const s = quickScore(ctx, own, c, variety);
    if (s > bestScore) [best, bestScore] = [c, s];
    if (++looked >= 12) break;
  }
  return best;
}

interface Reach {
  near: number;
  race: number;
  gold: number;
  bonus: number;
  open: number;
}

/**
 * Network inputs use fixed settings, not the tuned knobs: tuning must not move what the network
 * was trained on.
 */
const FEATURE_KNOBS = makeParams().knobs;

/** What a seat can reach from its corners: best spots by distance, cut when an opponent is closer. */
function reachOf(ctx: Context, owners: Int8Array, seat: number, open: number[], knobs = ctx.knobs): Reach {
  const { geo } = ctx;
  const mine = cornersOf(owners, seat);
  const theirs: number[] = [];
  for (let c = 0; c < owners.length; c++) if (owners[c] >= 0 && owners[c] !== seat) theirs.push(c);
  const myIslands = new Set(mine.map(c => geo.island[c]));
  const reach: Reach = { near: 0, race: 0, gold: 0, bonus: 0, open: 0 };
  if (!mine.length) return reach;
  for (const t of open) {
    const d = distanceFrom(geo, mine, t);
    if (d < 2 || d > ctx.maxReach) continue;
    const value = cornerValue(ctx, t, knobs);
    const bonus = myIslands.has(geo.island[t]) ? 0 : geo.bonus[t]!;
    const them = theirs.length ? distanceFrom(geo, theirs, t) : 255;
    const race = them > d ? 1 : them === d ? 1 - knobs.racePenalty / 2 : 1 - knobs.racePenalty;
    const decay = 1 / (1 + knobs.distanceCost * d ** 1.5);
    if (d <= 2) reach.near = Math.max(reach.near, value);
    if (d <= 3 && value >= 6) reach.open++;
    reach.race = Math.max(reach.race, (value + bonus * knobs.bonusValue) * decay * race);
    if (geo.gold[t]) reach.gold = Math.max(reach.gold, geo.gold[t]! * decay * race);
    if (bonus) reach.bonus = Math.max(reach.bonus, bonus * decay * race);
  }
  return reach;
}

/** Board-agnostic features of a starting position, from `seat`'s side (see SETUP_FEATURES). */
function features(ctx: Context, owners: Int8Array, seat: number): number[] {
  const { geo, view } = ctx;
  const index = boardIndex(view.board);
  const occupied = occupiedOf(owners);
  const open: number[] = [];
  for (let c = 0; c < geo.n; c++) if (geo.land[c] && isOpen(geo, occupied, c)) open.push(c);
  const totals = view.players.map((_, s) => {
    let total = 0;
    for (const c of cornersOf(owners, s)) {
      total += geo.gold[c]! + geo.volcano[c]! + geo.jungle[c]!;
      for (let r = 0; r < 5; r++) total += geo.pips[c * 5 + r]!;
    }
    return total;
  });
  const mine = cornersOf(owners, seat);
  const prod = [0, 0, 0, 0, 0];
  let gold = 0;
  let volcano = 0;
  let jungle = 0;
  let harbor21 = 0;
  let harbor31 = 0;
  let coast = 0;
  const numbers = new Map<number, number>();
  for (const c of mine) {
    for (let r = 0; r < 5; r++) prod[r]! += geo.pips[c * 5 + r]!;
    gold += geo.gold[c]!;
    volcano += geo.volcano[c]!;
    jungle += geo.jungle[c]!;
    coast += geo.coast[c]!;
    if (geo.harbor[c] === 'any') harbor31 = 1;
    for (const hexId of geo.hexes[c]!) {
      const hex = index.hex.get(hexId)!;
      const p = 6 - Math.abs(7 - hex.number!);
      numbers.set(hex.number!, (numbers.get(hex.number!) ?? 0) + p);
    }
  }
  for (const c of mine) {
    const h = geo.harbor[c];
    if (h && classicSlot(h) >= 0) harbor21 += prod[classicSlot(h)]!;
  }
  const total = totals[seat]!;
  const kinds = Math.min(5, prod.filter(p => p > 0).length + (gold || (volcano && view.settings.volcanoGold) ? 1 : 0));
  const others = totals.filter((_, s) => s !== seat);
  const oppMax = Math.max(0, ...others);
  const reach = reachOf(ctx, owners, seat, open, FEATURE_KNOBS);
  let oppReach = 0;
  for (let s = 0; s < ctx.players; s++)
    if (s !== seat) oppReach = Math.max(oppReach, reachOf(ctx, owners, s, open, FEATURE_KNOBS).race);
  const scarce = prod.reduce((sum, p, r) => sum + p * ctx.scarcity[r]!, 0);
  const firstRound = ctx.order.indexOf(seat);
  return [
    ...prod.map(p => p / 10),
    gold / 10,
    view.settings.volcanoGold ? volcano / 10 : 0,
    volcano / 10,
    jungle / 10,
    total / 20,
    kinds / 5,
    (5 - kinds) / 5,
    (prod[0]! + prod[1]!) / 10,
    (prod[3]! + prod[4]!) / 10,
    numbers.size / 6,
    total ? Math.max(0, ...numbers.values()) / total : 0,
    harbor21 / 10,
    harbor31,
    scarce / 20,
    reach.near / 15,
    reach.race / 15,
    reach.gold / 5,
    reach.bonus / 2,
    reach.open / 5,
    coast / 2,
    ctx.players / 6,
    ctx.players > 1 ? firstRound / (ctx.players - 1) : 0,
    view.settings.victoryPoints / 13,
    view.seafaring ? 1 : 0,
    view.settings.friendlyRobber ? 1 : 0,
    oppMax / 20,
    others.length ? others.reduce((a, b) => a + b, 0) / others.length / 20 : 0,
    (total - oppMax) / 10,
    oppReach / 15,
  ];
}

/** Hand-set score of a starting position, used before a network is trained. */
function prior(ctx: Context, f: number[]): number {
  const k = ctx.knobs;
  const at = (name: (typeof SETUP_FEATURES)[number]) => f[SETUP_FEATURES.indexOf(name)]!;
  return (
    at('scarceTotal') * 20 +
    at('gold') * 10 * (k.quickGold - 1) +
    at('kinds') * 5 * k.quickVariety +
    k.quickHarbor * (at('harbor21') * 10 * 0.3 + at('harbor31') * 0.5) +
    k.quickReach * at('reachRace') * 15
  );
}

/** Score of a finished (or played-out) starting position for `seat`. */
function evaluate(ctx: Context, owners: Int8Array, seat: number): number {
  const f = features(ctx, owners, seat);
  return ctx.params.setupNet ? predict(ctx.params.setupNet, f) * 100 : prior(ctx, f);
}

/** Play out the draft from `step`: opponents pick greedily; this bot picks by lookahead. */
function playOut(ctx: Context, owners: Int8Array, step: number): number {
  const next = Int8Array.from(owners);
  for (let j = step; j < ctx.order.length; j++) {
    const seat = ctx.order[j]!;
    if (seat === ctx.me) return bestPick(ctx, next, j, 3).score;
    const c = greedyPick(ctx, next, seat, ctx.knobs.draftVariety);
    if (c >= 0) next[c] = seat;
  }
  return evaluate(ctx, next, ctx.me);
}

/** Best gold field or bonus island within reach of corner `c`, by distance only (cached per decision). */
function prize(ctx: Context, c: number): number {
  const { geo, knobs } = ctx;
  if (!ctx.prizes) {
    ctx.prizes = new Map();
    ctx.prizeCorners = [];
    for (let t = 0; t < geo.n; t++) if (geo.land[t] && (geo.gold[t] || geo.bonus[t])) ctx.prizeCorners.push(t);
  }
  let value = ctx.prizes.get(c);
  if (value === undefined) {
    value = 0;
    for (const t of ctx.prizeCorners!) {
      const d = geo.distance[c * geo.n + t]!;
      if (d < 2 || d > ctx.maxReach) continue;
      const worth = cornerValue(ctx, t) + geo.bonus[t]! * knobs.bonusValue;
      value = Math.max(value, worth / (1 + knobs.distanceCost * d ** 1.5));
    }
    ctx.prizes.set(c, value);
  }
  return value;
}

/** Best corner for this bot at draft step `step`, judged by the position the draft leads to. */
function bestPick(ctx: Context, owners: Int8Array, step: number, width: number): { corner: number; score: number } {
  const occupied = occupiedOf(owners);
  const open = ctx.starts.filter(c => isOpen(ctx.geo, occupied, c));
  const reachOpen: number[] = [];
  for (let c = 0; c < ctx.geo.n; c++) if (ctx.geo.land[c] && isOpen(ctx.geo, occupied, c)) reachOpen.push(c);
  const mine = cornersOf(owners, ctx.me);
  // Rank cheaply (dice, variety, and how close gold or bonus islands are), then work out the
  // race for spots only for the best few.
  const rough = open
    .map(c => ({ c, s: quickScore(ctx, mine, c, ctx.knobs.quickVariety) + ctx.knobs.quickReach * prize(ctx, c) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, Math.max(12, width * 2));
  const prefilter = rough.map(({ c }) => {
    owners[c] = ctx.me;
    const reach = reachOf(ctx, owners, ctx.me, reachOpen).race;
    const score = quickScore(ctx, mine, c, ctx.knobs.quickVariety) + ctx.knobs.quickReach * reach;
    owners[c] = -1;
    return { corner: c, score };
  });
  prefilter.sort((a, b) => b.score - a.score);
  let best = { corner: prefilter[0]?.corner ?? -1, score: -Infinity };
  for (const { corner } of prefilter.slice(0, width)) {
    owners[corner] = ctx.me;
    const score = playOut(ctx, owners, step + 1);
    owners[corner] = -1;
    if (score > best.score) best = { corner, score };
  }
  return best;
}

/** Deterministic 0–1 number from the view, so the same position always gets the same choice. */
function viewNoise(view: GameView): number {
  let h = 2166136261;
  for (const ch of `${view.version}:${view.selfId}:${view.turn}:${view.roomId}`)
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 2 ** 32;
}

/** Choose a starting settlement. */
export function setupSettlement(view: GameView, params: AdvancedParams, explore = 0): GameAction {
  const ctx = context(view, params);
  const owners = ownersOf(ctx);
  const step = Object.keys(view.buildings).length;
  const legal = new Set(view.legal.settlements.map(id => ctx.geo.indexOf.get(id)!));
  // Corners the board allows but the engine doesn't list (should not happen) are dropped here.
  ctx.starts = ctx.starts.filter(c => legal.has(c) || !isOpen(ctx.geo, occupiedOf(owners), c));
  let { corner } = bestPick(ctx, owners, step, Math.round(params.knobs.setupCandidates));
  if (explore) {
    // Training only: sometimes try another legal corner, to learn what other positions are worth.
    const noise = viewNoise(view);
    if (noise < explore) {
      const top = Math.max(...[...legal].map(c => cornerValue(ctx, c)));
      const options = [...legal].filter(c => cornerValue(ctx, c) >= top * 0.5);
      corner = options[Math.floor((noise / explore) * options.length)]!;
    }
  }
  const id = legal.has(corner) ? ctx.geo.ids[corner]! : view.legal.settlements[0]!;
  return { type: 'place-settlement', vertexId: id };
}

/** Features of the real starting position once setup is over (training labels it with the result). */
export function finalSetupFeatures(view: GameView, params: AdvancedParams): number[] {
  const ctx = context(view, params);
  return features(ctx, ownersOf(ctx), ctx.me);
}

/**
 * The road (or ship) after a starting settlement: toward the best spot it can reach first,
 * weighing value and island bonus against distance and whether an opponent is closer.
 */
export function setupRoad(view: GameView, params: AdvancedParams): GameAction {
  const ctx = context(view, params);
  const { geo, knobs } = ctx;
  const owners = ownersOf(ctx);
  const occupied = occupiedOf(owners);
  const last = [...view.legal.roads, ...view.legal.ships]
    .flatMap(id => {
      const e = view.board.edges.find(edge => edge.id === id)!;
      return [e.a, e.b];
    })
    .find(v => view.buildings[v]?.playerId === view.selfId)!;
  const home = geo.indexOf.get(last)!;
  const theirs: number[] = [];
  for (let c = 0; c < geo.n; c++) if (owners[c] >= 0 && owners[c] !== ctx.me) theirs.push(c);
  const mine = cornersOf(owners, ctx.me);
  const myIslands = new Set(mine.map(c => geo.island[c]));
  const open: number[] = [];
  for (let c = 0; c < geo.n; c++) if (geo.land[c] && isOpen(geo, occupied, c)) open.push(c);
  const score = (edgeId: string) => {
    const e = view.board.edges.find(edge => edge.id === edgeId)!;
    const far = geo.indexOf.get(e.a === last ? e.b : e.a)!;
    let best = 0;
    let bestIsland: number | null = null;
    for (const t of open) {
      const d = 1 + geo.distance[far * geo.n + t]!;
      if (d < 2 || d > ctx.maxReach + 1) continue;
      const them = theirs.length ? distanceFrom(geo, theirs, t) : 255;
      const race = them > d ? 1 : them === d ? 1 - knobs.racePenalty / 2 : 1 - knobs.racePenalty;
      const bonus = myIslands.has(geo.island[t]) ? 0 : geo.bonus[t]!;
      const v = ((cornerValue(ctx, t) + bonus * knobs.bonusValue) * race) / (1 + knobs.distanceCost * d ** 1.5);
      if (v > best) [best, bestIsland] = [v, geo.island[t]];
    }
    return { best, overSea: bestIsland !== geo.island[home] };
  };
  const options = [...new Set([...view.legal.roads, ...view.legal.ships])].map(id => ({ id, ...score(id) }));
  options.sort((a, b) => b.best - a.best);
  const pick = options[0]!;
  return linkAction(view, pick.id, pick.overSea ? 'ship' : 'road')!;
}
