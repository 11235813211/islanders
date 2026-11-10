import { shuffled } from '../board';
import { linksAnywhere } from '../rules';
import { boardIndex, ERUPTION_CORNER, paysChoice, terrainResource } from '../seafaring';
import { type GameState, RESOURCES, type ResourceBag } from '../types';
import { addLog, bumpStat, emptyBag, PIECE_LIMITS, pieceCounts, resourceCount } from './core';

/**
 * Pay out a roll. Resource tiles pay cards (if the bank can't cover everyone owed a resource,
 * nobody gets it unless only one player is owed). Gold fields and volcanoes leave each owner a
 * choice (state.pendingGold); jungles pay discoveries.
 */
export function produce(state: GameState, total: number): Record<string, ResourceBag> {
  const demand = new Map<string, ResourceBag>(state.players.map(player => [player.id, emptyBag()]));
  const choices: Record<string, number> = {};
  const finds: Record<string, number> = {};
  for (const hex of state.board.hexes) {
    if (hex.number !== total || hex.id === state.robber) continue;
    // Without the gold variant a volcano only erupts.
    if (hex.terrain === 'volcano' && state.settings.volcanoGold === false) continue;
    const resource = terrainResource(hex.terrain);
    for (const vertexId of hex.vertexIds) {
      const building = state.buildings[vertexId];
      if (!building) continue;
      const amount = building.kind === 'city' ? 2 : 1;
      if (resource) demand.get(building.playerId)![resource] += amount;
      else if (paysChoice(hex.terrain)) choices[building.playerId] = (choices[building.playerId] ?? 0) + amount;
      else if (hex.terrain === 'jungle') finds[building.playerId] = (finds[building.playerId] ?? 0) + amount;
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
  for (const [id, bag] of Object.entries(gains)) bumpStat(state, id, 'gained', resourceCount(bag));
  state.pendingGold = {};
  for (const [id, count] of Object.entries(choices)) {
    const owed = Math.min(count, resourceCount(state.bank));
    if (owed > 0) state.pendingGold[id] = owed;
  }
  for (const [id, count] of Object.entries(finds)) {
    const player = state.players.find(p => p.id === id)!;
    player.discoveries += count;
    addLog(state, `${player.name} made ${count === 1 ? 'a discovery' : `${count} discoveries`} in the jungle.`);
  }
  return gains;
}

/**
 * Volcanoes showing `total` that will erupt. The robber keeps its volcano quiet, and so does having
 * no settlement or city on its corners (it pays nobody and has nothing to wreck).
 */
export function eruptingVolcanoes(state: GameState, total: number): string[] {
  return state.board.hexes
    .filter(hex => hex.terrain === 'volcano' && hex.number === total && hex.id !== state.robber)
    .filter(hex => hex.vertexIds.some(id => state.buildings[id]))
    .map(hex => hex.id);
}

/** The eruption die for a volcano: random, or (balanced) the next face from its shuffled set of six. */
export function volcanoDie(state: GameState, hexId: string, random: () => number): number {
  if (state.settings.volcanoDice !== 'balanced') return Math.floor(random() * 6) + 1;
  let faces = state.volcanoDecks[hexId] ?? [];
  if (!faces.length) faces = shuffled([1, 2, 3, 4, 5, 6], random);
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
  if (!stranded.size) return;
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
