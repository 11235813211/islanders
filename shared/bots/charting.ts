import { type ChoiceGroup, choiceGroups, choiceLimit, fillChoice } from '../choices';
import { BUILD_COSTS } from '../engine/core';
import { affordsSplit, chartHexes, splitHexes } from '../engine/legal';
import { chartedNumbers, hexNumbers, payingNumbers } from '../rules';
import { boardIndex, isLandVertex, terrainResource } from '../seafaring';
import { type GameAction, type GameView, type Hex, RESOURCES, type Resource, type ResourceBag } from '../types';
import { Board, roadPaths } from './analysis';

/**
 * Cartographers tile moves for every bot level, kept cheap: chart or split the tile that pays the
 * bot most, send a survey ship's charts to its best tied town, and pick from split tiles by need.
 */

/** Dots on a number token: how many of the 36 rolls hit it. */
const dots = (n: number) => 6 - Math.abs(7 - n);
export const tileDots = (numbers: number[]) => numbers.reduce((sum, n) => sum + dots(n), 0);

/** How much of a tile's payout goes to a seat (this one by default): 1 per settlement or relay station, 2 per city. */
export function share(view: GameView, hex: Hex, playerId = view.selfId): number {
  const index = boardIndex(view.board);
  let owned = 0;
  for (const id of hex.vertexIds) {
    const building = view.buildings[id];
    if (building?.playerId === playerId) owned += building.kind === 'city' ? 2 : 1;
  }
  for (const id of view.relays)
    if (view.roads[id] === playerId && index.edgeHexes.get(id)!.some(h => h.id === hex.id)) owned++;
  return owned;
}

/**
 * How a level judges tiles. Simple levels weigh only who is on a tile now; Advanced (its knobs) also
 * counts the open corners rivals are likely to settle, and trades for the card a needed split costs.
 */
export interface TileTuning {
  /** Each card a rival gains counts against ours at this rate. */
  rivalShare: number;
  /** Weight of later rivals on the tile: open corners they reach first, and cities they may build. */
  futureRivals: number;
  /** Chart gain on a lodestone tile is multiplied by this (it pays for more charts). */
  lodestoneTile: number;
  /** Trade for the card a split into a missing resource costs, instead of splitting into what's in hand. */
  splitTrade: boolean;
}

/** The tile judgment of the Beginner and Intermediate bots (and Advanced before 2026-11-16). */
export const SIMPLE_TILES: TileTuning = { rivalShare: 0.6, futureRivals: 0, lodestoneTile: 1, splitTrade: false };

/** Chance a rival settles an open corner this many new roads from its network, before we do. */
const SETTLE_CHANCE = [1, 0.8, 0.5, 0.25];
/** A corner we reach first is less likely theirs. */
const RACE_LOST = 0.4;
/** Expected extra share from a settlement there becoming a city. */
const CITY_LATER = 0.5;

/** A land corner nothing is on or next to (a settlement could still go there). */
export function settleable(view: GameView, vertexId: string): boolean {
  const index = boardIndex(view.board);
  if (!isLandVertex(view.board, vertexId) || view.buildings[vertexId]) return false;
  return index.vertex.get(vertexId)!.edgeIds.every(id => {
    const edge = index.edge.get(id)!;
    return !view.buildings[edge.a === vertexId ? edge.b : edge.a];
  });
}

/** Rival share a tile is likely to gain later: settlements on its open corners, and cities. */
function laterRivals(view: GameView, hex: Hex): number {
  const board = new Board(view);
  const rivals = view.players.filter(p => p.id !== view.selfId).map(p => roadPaths(board, p.id));
  const mine = roadPaths(board);
  let later = 0;
  for (const id of hex.vertexIds) {
    const building = view.buildings[id];
    if (building) {
      if (building.playerId !== view.selfId && building.kind === 'settlement') later += CITY_LATER;
      continue;
    }
    if (!settleable(view, id)) continue;
    const near = Math.min(...rivals.map(paths => paths.get(id)?.distance ?? Infinity));
    const chance = SETTLE_CHANCE[near] ?? 0;
    later += (mine.get(id)?.distance ?? Infinity) < near ? chance * RACE_LOST : chance;
  }
  return later;
}

/** This seat's share of a tile less its rivals' (now, and later as tuned), for moves that improve the tile for everyone on it. */
function netShare(view: GameView, hex: Hex, tuning: TileTuning): number {
  const own = share(view, hex);
  if (!own) return 0;
  let rivals = view.players.filter(p => p.id !== view.selfId).reduce((n, p) => n + share(view, hex, p.id), 0);
  if (tuning.futureRivals) rivals += tuning.futureRivals * laterRivals(view, hex);
  return own - tuning.rivalShare * rivals;
}

/** This seat's dots per resource (what its tiles pay), for preferring what it lacks. */
function income(view: GameView): ResourceBag {
  const bag = Object.fromEntries(RESOURCES.map(r => [r, 0])) as ResourceBag;
  for (const hex of view.board.hexes) {
    const resource = terrainResource(hex.terrain);
    if (resource) bag[resource] += tileDots(payingNumbers(hex, hex.id === view.robber)) * share(view, hex);
  }
  return bag;
}

/** Dots this seat gains from one chart step on a tile. */
function chartGain(view: GameView, hex: Hex, tuning: TileTuning): number {
  const now = hexNumbers(hex);
  const gain = (tileDots(chartedNumbers(now) ?? now) - tileDots(now)) * netShare(view, hex, tuning);
  return hex.terrain === 'lodestone' && gain > 0 ? gain * tuning.lodestoneTile : gain;
}

/** A chart on the tile it gains most from, when that gain is worth the lodestone (at least 2 dots). */
export function chartMove(view: GameView, tuning = SIMPLE_TILES): GameAction | null {
  const index = boardIndex(view.board);
  let best: { hexId: string; gain: number } | null = null;
  for (const hexId of view.legal.chartHexes) {
    const gain = chartGain(view, index.hex.get(hexId)!, tuning);
    if (gain >= 2 && (!best || gain > best.gain)) best = { hexId, gain };
  }
  return best ? { type: 'chart-hex', hexId: best.hexId } : null;
}

/**
 * A split on its best-paying tile, adding the resource it earns least of. Simple levels add only
 * what they can pay for now; with `splitTrade` the bot adds the resource it most lacks, trading
 * for the card first when that resource is one it doesn't earn at all.
 */
export function splitMove(view: GameView, tuning = SIMPLE_TILES): GameAction | null {
  const index = boardIndex(view.board);
  const earns = income(view);
  const candidates = view.legal.splitHexes.length || !tuning.splitTrade ? view.legal.splitHexes : splitHexes(view);
  const tile = candidates
    .map(id => index.hex.get(id)!)
    .map(hex => ({ hex, value: tileDots(payingNumbers(hex, hex.id === view.robber)) * netShare(view, hex, tuning) }))
    .sort((a, b) => b.value - a.value)[0];
  if (!tile || tile.value < 5) return null;
  const own = terrainResource(tile.hex.terrain);
  const options = RESOURCES.filter(r => r !== own && r !== 'lodestone').sort((a, b) => earns[a] - earns[b]);
  const split = (resource: Resource): GameAction => ({ type: 'split-hex', hexId: tile.hex.id, resource });
  if (tuning.splitTrade) {
    const need = options.find(r => view.bank[r]);
    if (need && affordsSplit(view.hand, need)) return split(need);
    if (need && !earns[need] && view.hand.lodestone >= BUILD_COSTS.split.lodestone) {
      const trade = bankTradeFor(view, need, BUILD_COSTS.split);
      if (trade) return trade;
    }
  }
  const resource = options.find(r => affordsSplit(view.hand, r));
  return resource && view.legal.splitHexes.length ? split(resource) : null;
}

/**
 * A bank trade (at this seat's rates) for one `want`, paid with the resource it has most spare of
 * beyond `keep`, never lodestone. Null when nothing spare covers a trade.
 */
export function bankTradeFor(view: GameView, want: Resource, keep: ResourceBag): GameAction | null {
  if (!view.bank[want]) return null;
  const spare = (r: Resource) => view.hand[r] - keep[r] - view.tradeRates[r];
  const give = RESOURCES.filter(r => r !== 'lodestone' && r !== want && spare(r) >= 0).sort(
    (a, b) => spare(b) - spare(a),
  );
  return give[0] ? { type: 'trade', give: give[0], receive: want } : null;
}

/** Of the towns tied nearest a survey ship, the one whose tiles this seat gains most from charting. */
export function surveyTown(view: GameView, edgeId: string, tuning = SIMPLE_TILES): string | null {
  const index = boardIndex(view.board);
  const chartable = new Set(view.legal.chartHexes.length ? view.legal.chartHexes : chartHexes(view));
  const value = (vertexId: string) =>
    index.vertex
      .get(vertexId)!
      .hexIds.filter(id => chartable.has(id))
      .reduce((sum, id) => sum + chartGain(view, index.hex.get(id)!, tuning), 0);
  return [...(view.legal.surveyTowns[edgeId] ?? [])].sort((a, b) => value(b) - value(a))[0] ?? null;
}

/**
 * Picks owed from split tiles and gold: split cards go to the half this seat holds fewest of, the
 * free ones to whatever `free` (the level's own gold choice) picks for the rest.
 */
export function splitGoldChoice(view: GameView, free: (view: GameView) => GameAction): GameAction {
  const pending = view.pendingGold[view.selfId] ?? 0;
  const splits = view.pendingSplit[view.selfId] ?? [];
  const stock = Object.fromEntries(
    RESOURCES.map(r => [r, view.bankCounts?.[r] ?? (view.bank[r] ? pending : 0)]),
  ) as Record<Resource, number>;
  const groups = choiceGroups(pending, splits);
  // The bank may pay fewer than are owed (the engine asks for exactly what it can pay).
  const owed = Math.min(pending, choiceLimit(groups, stock));
  const limited: ChoiceGroup[] = groups.filter(g => g.options.length < RESOURCES.length);
  const bag = fillChoice(
    limited,
    stock,
    (options, picked) => [...options].sort((a, b) => view.hand[a] + picked[a] - (view.hand[b] + picked[b])),
    owed,
  );
  const rest = owed - RESOURCES.reduce((n, r) => n + bag[r], 0);
  if (rest <= 0) return { type: 'choose-gold', resources: bag };
  const hand = { ...view.hand };
  for (const r of RESOURCES) hand[r] += bag[r];
  const pick = free({ ...view, hand, pendingGold: { ...view.pendingGold, [view.selfId]: rest }, pendingSplit: {} });
  if (pick.type !== 'choose-gold') return { type: 'choose-gold', resources: bag };
  const resources = { ...bag };
  for (const r of RESOURCES) resources[r] += pick.resources[r];
  return { type: 'choose-gold', resources };
}
