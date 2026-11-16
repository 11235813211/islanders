import type { GameState, MapProposal } from '../types';
import { type Handlers, needPhase, requireRule } from './core';
import { requireHost } from './lobby';

/** Map proposals only live in the lobby, and only count people still seated. */
export function pruneMapProposals(next: GameState): void {
  if (!next.mapProposals.length) return;
  const seated = new Set(next.phase === 'lobby' ? next.players.map(p => p.id) : []);
  next.mapProposals = next.mapProposals
    .map(p => ({ ...p, by: p.by.filter(id => seated.has(id)) }))
    .filter(p => p.by.length);
}

/** Lobby map proposals: players put maps forward and back them; the host picks one (choose-map) or turns one down. */
export const mapProposalHandlers: Pick<Handlers, 'propose-map' | 'decline-map'> = {
  /**
   * Any seated person puts a map forward or backs one already proposed; each person backs one map
   * at a time, and backing the same one again takes it back.
   */
  'propose-map'({ next, playerId, design }, action) {
    needPhase(next, 'lobby');
    const base = action.mapId === 'base';
    requireRule(base || design?.id === action.mapId, 'That map is not available.');
    const layoutFor = action.layoutFor ?? null;
    const same = (p: MapProposal) => p.mapId === action.mapId && p.layoutFor === layoutFor;
    const backing = next.mapProposals.find(same)?.by.includes(playerId);
    next.mapProposals = next.mapProposals
      .map(p => ({ ...p, by: p.by.filter(id => id !== playerId) }))
      .filter(p => p.by.length);
    if (backing) return;
    const existing = next.mapProposals.find(same);
    if (existing) existing.by.push(playerId);
    else
      next.mapProposals.push({
        mapId: action.mapId,
        name: base ? 'Base game' : design!.name,
        layoutFor,
        by: [playerId],
      });
  },

  'decline-map'({ next, playerId }, action) {
    needPhase(next, 'lobby');
    requireHost(next, playerId, 'turn down maps');
    next.mapProposals = next.mapProposals.filter(p => p.mapId !== action.mapId);
  },
};
