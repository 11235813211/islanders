import { shuffled } from '../board';
import { choiceGroups, choiceLimit } from '../choices';
import { hexNumbers, linksAnywhere } from '../rules';
import { boardIndex, ERUPTION_CORNER, paysChoice, terrainResource } from '../seafaring';
import { type GameState, RESOURCES, type Resource, type ResourceBag, type SplitChoice } from '../types';
import {
  addLog,
  bumpStat,
  discoveriesLeft,
  emptyBag,
  ownBoard,
  PIECE_LIMITS,
  pieceCounts,
  resourceCount,
  tally,
} from './core';

/** A card a survey ship collected from a fog tile: logged for everyone, but only its owner learns which. */
export interface SurveyFind {
  playerId: string;
  hexId: string;
  resource: Resource;
}

/**
 * Pay out a roll. Resource tiles pay cards (if the bank can't cover everyone owed a resource,
 * nobody gets it unless only one player is owed). Gold fields, volcanoes, and split tiles leave
 * each owner a choice (state.pendingGold, state.pendingSplit); jungles pay discoveries. Relay
 * stations collect even under the robber; survey ships collect from their target tile, and a
 * target still under fog pays its owner in secret (`finds`).
 */
export function produce(state: GameState, total: number): { gains: Record<string, ResourceBag>; finds: SurveyFind[] } {
  const demand = new Map<string, ResourceBag>(state.players.map(player => [player.id, emptyBag()]));
  const choices: Record<string, number> = {};
  const splits: Record<string, SplitChoice[]> = {};
  const discoveries: Record<string, number> = {};
  const relays = relaysByHex(state);
  const targets = targetsByHex(state);
  for (const hex of state.board.hexes) {
    // A charted tile pays once per matching number (a 6 charted to 6-6 pays twice).
    const times = hexNumbers(hex).filter(n => n === total).length;
    if (!times) continue;
    const robbed = hex.id === state.robber;
    if (robbed) noteBlocked(state, hex);
    // Without the gold variant a volcano only erupts.
    if (hex.terrain === 'volcano' && state.settings.volcanoGold === false) continue;
    const resource = terrainResource(hex.terrain);
    const owed: [string, number][] = [
      ...(robbed ? [] : hex.vertexIds.flatMap(id => buildingShare(state, id))),
      // Each relay station on the tile's sides earns one, like a settlement, robber or not.
      ...(relays.get(hex.id) ?? []).map(owner => [owner, 1] as [string, number]),
      ...(robbed ? [] : (targets.get(hex.id) ?? []).map(owner => [owner, 1] as [string, number])),
    ];
    for (const [playerId, each] of owed) {
      const amount = each * times;
      if (resource && hex.split) {
        choices[playerId] = (choices[playerId] ?? 0) + amount;
        splits[playerId] = addSplit(splits[playerId] ?? [], [resource, hex.split], amount);
      } else if (resource) demand.get(playerId)![resource] += amount;
      else if (paysChoice(hex.terrain)) choices[playerId] = (choices[playerId] ?? 0) + amount;
      else if (hex.terrain === 'jungle') discoveries[playerId] = (discoveries[playerId] ?? 0) + amount;
    }
  }
  const gains: Record<string, ResourceBag> = {};
  for (const resource of RESOURCES) {
    const recipients = state.players.filter(player => demand.get(player.id)![resource] > 0);
    const needed = recipients.reduce((sum, player) => sum + demand.get(player.id)![resource], 0);
    if (recipients.length > 1 && needed > state.bank[resource]) continue;
    for (const player of recipients) {
      const amount = Math.min(demand.get(player.id)![resource], state.bank[resource]);
      state.bank[resource] -= amount;
      player.resources[resource] += amount;
      gains[player.id] ??= emptyBag();
      gains[player.id]![resource] += amount;
    }
  }
  for (const [id, bag] of Object.entries(gains)) {
    tally(state, id, 'cardsIn', 'roll', resourceCount(bag));
    for (const resource of RESOURCES) tally(state, id, 'produced', resource, bag[resource]);
  }
  const finds = fogFinds(state, total, choices, discoveries);
  state.pendingGold = {};
  state.pendingSplit = {};
  for (const [id, count] of Object.entries(choices)) {
    const owed = Math.min(count, choiceLimit(choiceGroups(count, splits[id]), state.bank));
    if (owed <= 0) continue;
    state.pendingGold[id] = owed;
    if (splits[id]) state.pendingSplit[id] = splits[id]!;
  }
  // Discoveries follow the bank's rule: when the supply can't cover everyone, nobody gets one.
  const found = Object.values(discoveries).reduce((n, count) => n + count, 0);
  const left = discoveriesLeft(state);
  for (const [id, wanted] of Object.entries(discoveries)) {
    if (Object.keys(discoveries).length > 1 && found > left) break;
    const count = Math.min(wanted, left);
    if (!count) continue;
    const player = state.players.find(p => p.id === id)!;
    player.discoveries += count;
    addLog(state, `${player.name} made ${count === 1 ? 'a discovery' : `${count} discoveries`} in the jungle.`);
  }
  return { gains, finds };
}

/** What a settlement (1) or city (2) on this corner earns, and for whom. */
function buildingShare(state: GameState, vertexId: string): [string, number][] {
  const building = state.buildings[vertexId];
  return building ? [[building.playerId, building.kind === 'city' ? 2 : 1]] : [];
}

/** Count more cards from a split tile, merged with others from a tile that pays the same two. */
function addSplit(list: SplitChoice[], options: [Resource, Resource], count: number): SplitChoice[] {
  const same = list.find(s => s.options.every(r => options.includes(r)));
  if (same) same.count += count;
  else list.push({ options, count });
  return list;
}

/** Owners of the relay stations on each tile's sides. */
function relaysByHex(state: GameState): Map<string, string[]> {
  const index = boardIndex(state.board);
  const byHex = new Map<string, string[]>();
  for (const edgeId of state.relays)
    for (const hex of index.edgeHexes.get(edgeId)!)
      byHex.set(hex.id, [...(byHex.get(hex.id) ?? []), state.roads[edgeId]!]);
  return byHex;
}

/** Owners of the survey ships targeting each tile. */
function targetsByHex(state: GameState): Map<string, string[]> {
  const byHex = new Map<string, string[]>();
  for (const edgeId of state.surveys) {
    const hexId = state.surveyTargets[edgeId];
    const owner = state.ships[edgeId];
    if (hexId && owner) byHex.set(hexId, [...(byHex.get(hexId) ?? []), owner]);
  }
  return byHex;
}

/**
 * Survey ships whose target is still under fog: a resource goes straight to the owner's hand (when
 * the bank has one), gold or a paying volcano adds a pick, a jungle a discovery.
 */
function fogFinds(
  state: GameState,
  total: number,
  choices: Record<string, number>,
  discoveries: Record<string, number>,
): SurveyFind[] {
  const finds: SurveyFind[] = [];
  for (const edgeId of state.surveys) {
    const hexId = state.surveyTargets[edgeId];
    const hidden = hexId ? state.fog[hexId] : undefined;
    const playerId = state.ships[edgeId];
    if (!hexId || !hidden || !playerId || hidden.number !== total) continue;
    const resource = terrainResource(hidden.terrain);
    if (resource && state.bank[resource] > 0) {
      state.bank[resource]--;
      state.players.find(p => p.id === playerId)!.resources[resource]++;
      tally(state, playerId, 'cardsIn', 'roll');
      tally(state, playerId, 'produced', resource);
      finds.push({ playerId, hexId, resource });
    } else if (hidden.terrain === 'gold' || (hidden.terrain === 'volcano' && state.settings.volcanoGold !== false))
      choices[playerId] = (choices[playerId] ?? 0) + 1;
    else if (hidden.terrain === 'jungle') discoveries[playerId] = (discoveries[playerId] ?? 0) + 1;
  }
  return finds;
}

/** Count the cards a robber on this resource hex kept from its buildings. */
function noteBlocked(state: GameState, hex: GameState['board']['hexes'][number]): void {
  if (!terrainResource(hex.terrain)) return;
  for (const vertexId of hex.vertexIds) {
    const building = state.buildings[vertexId];
    if (building) bumpStat(state, building.playerId, 'blocked', building.kind === 'city' ? 2 : 1);
  }
}

/**
 * Volcanoes showing `total` that will erupt. The robber keeps its volcano quiet, and so does having
 * no settlement or city on its corners (it pays nobody and has nothing to wreck).
 */
export function eruptingVolcanoes(state: GameState, total: number): string[] {
  return state.board.hexes
    .filter(hex => hex.terrain === 'volcano' && hexNumbers(hex).includes(total) && hex.id !== state.robber)
    .filter(hex => hex.vertexIds.some(id => state.buildings[id]))
    .map(hex => hex.id);
}

/** Each volcano's balanced deck holds every face twice: repeats can happen, long droughts can't. */
const VOLCANO_DECK = [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6];

/** The eruption die for a volcano: random, or (balanced) the next card from its shuffled deck of 12. */
export function volcanoDie(state: GameState, hexId: string, random: () => number): number {
  if (state.settings.volcanoDice !== 'balanced') return Math.floor(random() * 6) + 1;
  let faces = state.volcanoDecks[hexId] ?? [];
  if (!faces.length) faces = shuffled(VOLCANO_DECK, random);
  const [die, ...rest] = faces;
  state.volcanoDecks[hexId] = rest;
  return die!;
}

/**
 * One volcano erupts toward the corner the die names: a city there drops to a settlement (or is
 * lost when its owner has no settlement left to put there), and a settlement is lost.
 */
export function eruptAt(state: GameState, hexId: string, die: number): void {
  const hex = boardIndex(state.board).hex.get(hexId)!;
  const vertexId = hex.vertexIds[ERUPTION_CORNER[die - 1]!]!;
  const building = state.buildings[vertexId];
  const owner = building ? state.players.find(p => p.id === building.playerId)! : null;
  let damage: 'none' | 'city' | 'settlement' = 'none';
  let text = `The volcano erupted toward corner ${die}. Nothing was there.`;
  const stockLeft = owner && pieceCounts(state, owner.id).settlements < PIECE_LIMITS.settlements;
  if (building?.kind === 'city' && stockLeft) {
    building.kind = 'settlement';
    damage = 'city';
    text = `The volcano erupted toward corner ${die}: ${owner!.name}'s city was reduced to a settlement.`;
  } else if (building) {
    delete state.buildings[vertexId];
    damage = 'settlement';
    text = `The volcano erupted toward corner ${die}: ${owner!.name}'s ${building.kind} was destroyed.`;
  }
  if (owner && damage !== 'none') bumpStat(state, owner.id, 'erupted');
  addLog(state, text, {
    kind: 'eruption',
    hexId,
    die,
    vertexId,
    playerId: owner?.id ?? null,
    damage,
    piece: damage === 'city' ? 'city' : (building?.kind ?? null),
  });
}

/** Die face (1–6) → the iceberg side it drifts toward: 1 is the upper-right side, then clockwise. */
const ICEBERG_SIDES = [4, 5, 0, 1, 2, 3] as const;

/**
 * Every iceberg showing `total` drifts (its die is rolled straight away): it moves one hex toward
 * the side the die names when that hex is open sea (not land, another iceberg, the pirate, or off
 * the map), and a ship on that side sinks either way.
 */
export function drift(state: GameState, total: number, random: () => number): void {
  if (!state.board.hexes.some(hex => hex.terrain === 'iceberg' && hex.number === total)) return;
  ownBoard(state);
  const index = boardIndex(state.board);
  const drifting = state.board.hexes.filter(hex => hex.terrain === 'iceberg' && hex.number === total);
  for (const hex of drifting) {
    const die = Math.floor(random() * 6) + 1;
    const corner = ICEBERG_SIDES[die - 1]!;
    const [a, b] = [hex.vertexIds[corner]!, hex.vertexIds[(corner + 1) % 6]!];
    const edgeId = index.vertex.get(a)!.edgeIds.find(id => {
      const edge = index.edge.get(id)!;
      return edge.a === b || edge.b === b;
    })!;
    const owner = state.players.find(p => p.id === state.ships[edgeId]) ?? null;
    if (owner) sinkShip(state, edgeId);
    const across = index.edgeHexes.get(edgeId)!.find(h => h.id !== hex.id);
    const moves = !!across && across.terrain === 'sea' && across.id !== state.pirate;
    if (moves) {
      across.terrain = 'iceberg';
      across.number = hex.number;
      hex.terrain = 'sea';
      hex.number = null;
      hex.extra = undefined;
    }
    const where = moves ? 'drifted' : 'bumped';
    addLog(
      state,
      owner
        ? `The iceberg ${where} toward side ${die} and sank ${owner.name}'s ship.`
        : `The iceberg ${where} toward side ${die}.`,
      { kind: 'iceberg', die, edgeId, playerId: owner?.id ?? null, hexId: hex.id, toHexId: moves ? across.id : null },
    );
  }
}

/** A piece of the player's route: their ship, or their road when roads and ships join anywhere. */
const routePiece = (state: GameState, playerId: string) => {
  const roads = linksAnywhere(state);
  return (edgeId: string) => state.ships[edgeId] === playerId || (roads && state.roads[edgeId] === playerId);
};

/**
 * Sink one ship. If that splits its owner's route, the ships beyond the gap slide back toward
 * their settlement, so the ship that is lost is the far end of the route and none are stranded.
 */
export function sinkShip(state: GameState, edgeId: string): void {
  const owner = state.ships[edgeId]!;
  delete state.ships[edgeId];
  const stranded = strandedShips(state, owner);
  if (!stranded.size) {
    dropSunkSurveys(state);
    return;
  }
  state.ships[edgeId] = owner;
  const index = boardIndex(state.board);
  const onRoute = routePiece(state, owner);
  // The far end: the stranded ship the most steps along the route from the gap.
  const distance = new Map<string, number>([[edgeId, 0]]);
  const queue = [edgeId];
  while (queue.length) {
    const id = queue.shift()!;
    const edge = index.edge.get(id)!;
    for (const v of [edge.a, edge.b])
      for (const next of index.vertex.get(v)!.edgeIds)
        if (onRoute(next) && !distance.has(next)) {
          distance.set(next, distance.get(id)! + 1);
          queue.push(next);
        }
  }
  const far = [...stranded].sort((x, y) => (distance.get(y) ?? 0) - (distance.get(x) ?? 0))[0]!;
  delete state.ships[far];
  dropSunkSurveys(state);
}

/** A sunk survey ship is gone with its ship, and so is its target. */
function dropSunkSurveys(state: GameState): void {
  state.surveys = state.surveys.filter(id => state.ships[id]);
  for (const id of Object.keys(state.surveyTargets)) if (!state.ships[id]) delete state.surveyTargets[id];
}

/** A player's ships no longer joined along their route to one of their settlements or cities. */
function strandedShips(state: GameState, playerId: string): Set<string> {
  const index = boardIndex(state.board);
  const onRoute = routePiece(state, playerId);
  const route = state.board.edges.map(edge => edge.id).filter(onRoute);
  const reached = new Set<string>();
  const queue = route.filter(id => {
    const edge = index.edge.get(id)!;
    return [edge.a, edge.b].some(v => state.buildings[v]?.playerId === playerId);
  });
  for (const id of queue) reached.add(id);
  while (queue.length) {
    const edge = index.edge.get(queue.shift()!)!;
    for (const v of [edge.a, edge.b]) {
      if (state.buildings[v] && state.buildings[v]!.playerId !== playerId) continue;
      for (const next of index.vertex.get(v)!.edgeIds)
        if (onRoute(next) && !reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
    }
  }
  return new Set(Object.keys(state.ships).filter(id => state.ships[id] === playerId && !reached.has(id)));
}
