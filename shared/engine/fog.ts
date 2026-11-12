import { boardIndex, isLandTerrain, terrainResource } from '../seafaring';
import type { GameState } from '../types';
import { addLog, bumpStat, discoveriesLeft, ownBoard } from './core';

/**
 * Fog (the Fog Islands rules): placing a road or ship that touches a corner of a fog tile reveals
 * it, from the hidden stack drawn when the board was set up. Land rewards the builder with one
 * card of what it produces (a jungle, a discovery); gold or a volcano found during their build
 * lets them pick one resource; sea and desert give nothing.
 */
export function revealFog(next: GameState, edgeId: string, playerId: string): void {
  const edge = boardIndex(next.board).edge.get(edgeId)!;
  const player = next.players.find(p => p.id === playerId)!;
  const hexIds = new Set([edge.a, edge.b].flatMap(v => boardIndex(next.board).vertex.get(v)!.hexIds));
  if (![...hexIds].some(id => next.fog[id])) return;
  ownBoard(next);
  const index = boardIndex(next.board);
  for (const hexId of hexIds) {
    const hex = index.hex.get(hexId)!;
    const hidden = next.fog[hexId];
    if (hex.terrain !== 'fog' || !hidden) continue;
    hex.terrain = hidden.terrain;
    hex.number = hidden.number;
    delete next.fog[hexId];
    if (isLandTerrain(hex.terrain)) {
      const neighbour = next.board.hexes.find(
        h => h.island !== undefined && h.id !== hex.id && h.vertexIds.some(v => hex.vertexIds.includes(v)),
      );
      hex.island = neighbour?.island ?? Math.max(0, ...next.board.hexes.map(h => h.island ?? 0)) + 1;
    }
    addLog(next, `${player.name} explored the fog and found ${FOUND[hex.terrain] ?? hex.terrain}.`, {
      kind: 'discover',
      playerId,
      hexId,
      terrain: hex.terrain,
    });
    reward(next, playerId, hex.terrain);
  }
}

const FOUND: Partial<Record<string, string>> = {
  sea: 'open sea',
  wood: 'a forest',
  brick: 'hills',
  sheep: 'a pasture',
  wheat: 'fields',
  ore: 'mountains',
  desert: 'a desert',
  gold: 'a gold field',
  jungle: 'a jungle',
  volcano: 'a volcano',
};

function reward(next: GameState, playerId: string, terrain: GameState['board']['hexes'][number]['terrain']): void {
  const player = next.players.find(p => p.id === playerId)!;
  const resource = terrainResource(terrain);
  if (resource && next.bank[resource] > 0) {
    next.bank[resource]--;
    player.resources[resource]++;
    bumpStat(next, playerId, 'gained');
  } else if (terrain === 'jungle' && discoveriesLeft(next) > 0) player.discoveries++;
  else if ((terrain === 'gold' || terrain === 'volcano') && next.phase === 'build') {
    next.pendingGold[playerId] = (next.pendingGold[playerId] ?? 0) + 1;
    next.phase = 'gold';
  }
}
