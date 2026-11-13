import { type ChoiceGroup, choiceGroups, fillChoice } from '../choices';
import { affordsSplit } from '../engine/legal';
import { chartedNumbers, hexNumbers } from '../rules';
import { boardIndex, terrainResource } from '../seafaring';
import { type GameAction, type GameView, type Hex, RESOURCES, type Resource, type ResourceBag } from '../types';

/**
 * Cartographers tile moves for every bot level, kept cheap: chart or split the tile that pays the
 * bot most, aim a survey ship at its best target, and pick from split tiles by need.
 */

/** Dots on a number token: how many of the 36 rolls hit it. */
const dots = (n: number) => 6 - Math.abs(7 - n);
export const tileDots = (numbers: number[]) => numbers.reduce((sum, n) => sum + dots(n), 0);

/** How much of a tile's payout goes to this seat: 1 per settlement, relay station, or survey target, 2 per city. */
export function share(view: GameView, hex: Hex): number {
  const index = boardIndex(view.board);
  let owned = 0;
  for (const id of hex.vertexIds) {
    const building = view.buildings[id];
    if (building?.playerId === view.selfId) owned += building.kind === 'city' ? 2 : 1;
  }
  for (const id of view.relays)
    if (view.roads[id] === view.selfId && index.edgeHexes.get(id)!.some(h => h.id === hex.id)) owned++;
  for (const id of view.surveys) if (view.ships[id] === view.selfId && view.surveyTargets[id] === hex.id) owned++;
  return owned;
}

/** This seat's dots per resource (what its tiles pay), for preferring what it lacks. */
function income(view: GameView): ResourceBag {
  const bag = Object.fromEntries(RESOURCES.map(r => [r, 0])) as ResourceBag;
  for (const hex of view.board.hexes) {
    const resource = terrainResource(hex.terrain);
    if (resource && hex.id !== view.robber) bag[resource] += tileDots(hexNumbers(hex)) * share(view, hex);
  }
  return bag;
}

/** A chart on the tile it gains most from, when that gain is worth two lodestone (at least 2 dots). */
export function chartMove(view: GameView): GameAction | null {
  const index = boardIndex(view.board);
  let best: { hexId: string; gain: number } | null = null;
  for (const hexId of view.legal.chartHexes) {
    const hex = index.hex.get(hexId)!;
    const now = hexNumbers(hex);
    // A new number is a 2 or a 12 either way, so `low` doesn't change the gain.
    const gain = (tileDots(chartedNumbers(now, true) ?? now) - tileDots(now)) * share(view, hex);
    if (gain >= 2 && (!best || gain > best.gain)) best = { hexId, gain };
  }
  return best ? { type: 'chart-hex', hexId: best.hexId } : null;
}

/** A split on its best-paying tile, adding the resource it earns least of and can pay for. */
export function splitMove(view: GameView): GameAction | null {
  const index = boardIndex(view.board);
  const earns = income(view);
  const tile = view.legal.splitHexes
    .map(id => index.hex.get(id)!)
    .filter(hex => hex.id !== view.robber)
    .map(hex => ({ hex, value: tileDots(hexNumbers(hex)) * share(view, hex) }))
    .sort((a, b) => b.value - a.value)[0];
  if (!tile || tile.value < 5) return null;
  const own = terrainResource(tile.hex.terrain);
  const resource = RESOURCES.filter(r => r !== own && r !== 'lodestone' && affordsSplit(view.hand, r)).sort(
    (a, b) => earns[a] - earns[b],
  )[0];
  return resource ? { type: 'split-hex', hexId: tile.hex.id, resource } : null;
}

/** The target a new survey ship collects from: most dots, then the resource this seat earns least of. */
export function surveyTarget(view: GameView): string | null {
  const index = boardIndex(view.board);
  const earns = income(view);
  const value = (hexId: string) => {
    const hex = index.hex.get(hexId)!;
    const peek = view.fogPeeks[hexId];
    const numbers = peek ? (peek.number === null ? [] : [peek.number]) : hexNumbers(hex);
    const resource = terrainResource(peek ? peek.terrain : hex.terrain);
    const robbed = hexId === view.robber ? 0.5 : 1;
    return (tileDots(numbers) - (resource ? earns[resource] / 100 : 0)) * robbed;
  };
  return [...view.legal.surveyTargets].sort((a, b) => value(b) - value(a))[0] ?? null;
}

/**
 * Picks owed from split tiles and gold: split cards go to the half this seat holds fewest of, the
 * free ones to whatever `free` (the level's own gold choice) picks for the rest.
 */
export function splitGoldChoice(view: GameView, free: (view: GameView) => GameAction): GameAction {
  const owed = view.pendingGold[view.selfId] ?? 0;
  const splits = view.pendingSplit[view.selfId] ?? [];
  const limited: ChoiceGroup[] = choiceGroups(owed, splits).filter(g => g.options.length < RESOURCES.length);
  const stock = Object.fromEntries(
    RESOURCES.map(r => [r, view.bankCounts?.[r] ?? (view.bank[r] ? owed : 0)]),
  ) as Record<Resource, number>;
  const bag = fillChoice(limited, stock, (options, picked) =>
    [...options].sort((a, b) => view.hand[a] + picked[a] - (view.hand[b] + picked[b])),
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
