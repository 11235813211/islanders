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

const CORNER_NAMES = ['1', '2', '3', '4', '5', '6'];

/**
 * Every volcano showing `total` erupts (after production, and even under the robber): a die picks a
 * corner; a city there drops to a settlement (or is lost when its owner has no settlement left to
 * put there) and a settlement is lost.
 */
export function erupt(state: GameState, total: number, random: () => number): void {
  for (const hex of state.board.hexes) {
    if (hex.terrain !== 'volcano' || hex.number !== total) continue;
    const die = Math.floor(random() * 6) + 1;
    const vertexId = hex.vertexIds[ERUPTION_CORNER[die - 1]!]!;
    const building = state.buildings[vertexId];
    const owner = building ? state.players.find(p => p.id === building.playerId)! : null;
    let damage: 'none' | 'city' | 'settlement' = 'none';
    let text = `The volcano erupted toward corner ${CORNER_NAMES[die - 1]}. Nothing was there.`;
    const stockLeft = owner && pieceCounts(state, owner.id).settlements < PIECE_LIMITS.settlements;
    if (building?.kind === 'city' && stockLeft) {
      building.kind = 'settlement';
      damage = 'city';
      text = `The volcano erupted toward corner ${die}: ${owner!.name}'s city was reduced to a settlement.`;
    } else if (building) {
      delete state.buildings[vertexId];
      damage = 'settlement';
      text = `The volcano erupted toward corner ${die}: ${owner!.name}'s settlement was destroyed.`;
    }
    addLog(state, text, { kind: 'eruption', die, vertexId, playerId: owner?.id ?? null, damage });
  }
}

/** Die face (1–6) → the iceberg side it drifts toward: 1 is the upper-right side, then clockwise. */
const ICEBERG_SIDES = [4, 5, 0, 1, 2, 3] as const;

/** Every iceberg showing `total` drifts toward the side a die names, sinking a ship there. */
export function drift(state: GameState, total: number, random: () => number): void {
  const index = boardIndex(state.board);
  for (const hex of state.board.hexes) {
    if (hex.terrain !== 'iceberg' || hex.number !== total) continue;
    const die = Math.floor(random() * 6) + 1;
    const corner = ICEBERG_SIDES[die - 1]!;
    const [a, b] = [hex.vertexIds[corner]!, hex.vertexIds[(corner + 1) % 6]!];
    const edgeId = index.vertex.get(a)!.edgeIds.find(id => {
      const edge = index.edge.get(id)!;
      return edge.a === b || edge.b === b;
    })!;
    const owner = state.players.find(p => p.id === state.ships[edgeId]) ?? null;
    if (owner) delete state.ships[edgeId];
    addLog(
      state,
      owner
        ? `The iceberg drifted toward side ${die} and sank ${owner.name}'s ship.`
        : `The iceberg drifted toward side ${die}. No ship was there.`,
      { kind: 'iceberg', die, edgeId, playerId: owner?.id ?? null },
    );
  }
}
