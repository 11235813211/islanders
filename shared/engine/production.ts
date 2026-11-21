import { shuffled } from '../board';
import { choiceGroups, choiceLimit } from '../choices';
import { crosses, edgeOwners, ownEdges, pieceOn, placePiece, removePiece } from '../crossings';
import { hexNumbers, linksAnywhere, payingNumbers } from '../rules';
import { boardIndex, ERUPTION_CORNER, paysChoice, terrainResource } from '../seafaring';
import { type GameState, RESOURCES, type Resource, type ResourceBag, type SplitChoice } from '../types';
import {
  addLog,
  bumpStat,
  discoveriesLeft,
  emptyBag,
  ownBoard,
  pieceCounts,
  pieceLimits,
  resourceCount,
  tally,
} from './core';

/**
 * Pay out a roll. Resource tiles pay cards (if the bank can't cover everyone owed a resource,
 * nobody gets it unless only one player is owed). Gold fields, volcanoes, and split tiles leave
 * each owner a choice (state.pendingGold, state.pendingSplit); jungles pay discoveries. Relay
 * stations collect even under the robber, which blocks only a tile's most likely number.
 */
export function produce(state: GameState, total: number): Record<string, ResourceBag> {
  const demand = new Map<string, ResourceBag>(state.players.map(player => [player.id, emptyBag()]));
  const choices: Record<string, number> = {};
  const splits: Record<string, SplitChoice[]> = {};
  const discoveries: Record<string, number> = {};
  const relays = relaysByHex(state);
  for (const hex of state.board.hexes) {
    // A charted tile pays once per matching number (charts keep them apart, but older games may repeat one).
    const count = (numbers: number[]) => numbers.filter(n => n === total).length;
    const all = count(hexNumbers(hex));
    if (!all) continue;
    // The robber blocks only the tile's most likely number; relay stations earn on every one.
    const paid = count(payingNumbers(hex, hex.id === state.robber));
    if (paid < all) noteBlocked(state, hex);
    // Without the gold variant a volcano only erupts.
    if (hex.terrain === 'volcano' && state.settings.volcanoGold === false) continue;
    const resource = terrainResource(hex.terrain);
    const owed: [string, number][] = [
      ...hex.vertexIds.flatMap(id => buildingShare(state, id, paid)),
      // Each relay station on the tile's sides earns one, like a settlement, robber or not.
      ...(relays.get(hex.id) ?? []).map(owner => [owner, all] as [string, number]),
    ];
    for (const [playerId, amount] of owed) {
      if (!amount) continue;
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
    if (recipients.length > 1 && needed > state.bank[resource]) {
      addLog(state, `The bank is short of ${resource}: nobody collects it.`);
      continue;
    }
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
  return gains;
}

/** What a settlement (1 a number) or city (2) on this corner earns from `times` paying numbers, and for whom. */
function buildingShare(state: GameState, vertexId: string, times: number): [string, number][] {
  const building = state.buildings[vertexId];
  return building ? [[building.playerId, (building.kind === 'city' ? 2 : 1) * times]] : [];
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

/** Count the cards a robber on this resource hex kept from its buildings. */
function noteBlocked(state: GameState, hex: GameState['board']['hexes'][number]): void {
  if (!terrainResource(hex.terrain)) return;
  for (const vertexId of hex.vertexIds) {
    const building = state.buildings[vertexId];
    if (building) bumpStat(state, building.playerId, 'blocked', building.kind === 'city' ? 2 : 1);
  }
}

/**
 * Volcanoes showing `total` that will erupt. The robber keeps its volcano's most likely number quiet,
 * and a volcano with no settlement or city on its corners stays quiet (it pays nobody and has nothing to wreck).
 */
export function eruptingVolcanoes(state: GameState, total: number): string[] {
  return state.board.hexes
    .filter(hex => hex.terrain === 'volcano' && payingNumbers(hex, hex.id === state.robber).includes(total))
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
  const stockLeft = owner && pieceCounts(state, owner.id).settlements < pieceLimits(state, owner.id).settlements;
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
    // With crossing routes an edge can hold more than one ship; the iceberg sinks them all.
    const sunk = edgeOwners(state, edgeId).filter(id => pieceOn(state, id, edgeId) === 'ship');
    for (const id of sunk) sinkShip(state, edgeId, id);
    const owners = sunk.map(id => state.players.find(p => p.id === id)!);
    const owner = owners[0] ?? null;
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
        ? `The iceberg ${where} toward side ${die} and sank ${sunkText(owners.map(p => p.name))}.`
        : `The iceberg ${where} toward side ${die}.`,
      { kind: 'iceberg', die, edgeId, playerId: owner?.id ?? null, hexId: hex.id, toHexId: moves ? across.id : null },
    );
  }
}

/** "Ana's ship", or "Ana's and Bo's ships" when crossing routes shared the edge. */
const sunkText = (names: string[]) =>
  `${names.map(name => `${name}'s`).join(' and ')} ship${names.length > 1 ? 's' : ''}`;

/** A piece of the player's route: their ship, or their road when roads and ships join anywhere. */
const routePiece = (state: GameState, playerId: string) => {
  const roads = linksAnywhere(state);
  return (edgeId: string) => {
    const piece = pieceOn(state, playerId, edgeId);
    return piece === 'ship' || (roads && piece === 'road');
  };
};

/**
 * Sink one ship. If that splits its owner's route, the ships beyond the gap slide back toward
 * their settlement, so the ship that is lost is the far end of the route and none are stranded.
 */
export function sinkShip(state: GameState, edgeId: string, owner = state.ships[edgeId]!): void {
  removePiece(state, owner, edgeId);
  const stranded = strandedShips(state, owner);
  if (!stranded.size) return;
  placePiece(state, owner, edgeId, 'ship');
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
  removePiece(state, owner, far);
}

/** A player's ships no longer joined along their route to one of their settlements or cities. */
function strandedShips(state: GameState, playerId: string): Set<string> {
  const index = boardIndex(state.board);
  const onRoute = routePiece(state, playerId);
  const route = ownEdges(state, playerId).filter(onRoute);
  const reached = new Set<string>();
  const queue = route.filter(id => {
    const edge = index.edge.get(id)!;
    return [edge.a, edge.b].some(v => state.buildings[v]?.playerId === playerId);
  });
  for (const id of queue) reached.add(id);
  while (queue.length) {
    const edge = index.edge.get(queue.shift()!)!;
    for (const v of [edge.a, edge.b]) {
      const building = state.buildings[v];
      if (building && building.playerId !== playerId && !crosses(state, playerId, building.playerId)) continue;
      for (const next of index.vertex.get(v)!.edgeIds)
        if (onRoute(next) && !reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
    }
  }
  return new Set(ownEdges(state, playerId, 'ship').filter(id => !reached.has(id)));
}
