import { TUNING } from '../default-settings';
import type { GameState, GameView, MapProposal } from '../types';
import { type Handlers, MAX_PLAYERS, needPhase, requireRule } from './core';
import { requireHost } from './lobby';

/** How many maps this person proposes or backs right now (at most TUNING.mapProposalsPerPlayer). */
export function proposalsBy(proposals: readonly MapProposal[], playerId: string): number {
  return proposals.filter(p => p.by.includes(playerId)).length;
}

/** The player count the lobby shows and proposes maps for: the host's number, else the seats. */
export function boardPlayerCount(room: Pick<GameView, 'boardPlayers' | 'players'>): number {
  return room.boardPlayers ?? room.players.length;
}

/** Map proposals only live in the lobby, and only count people still seated. */
export function pruneMapProposals(next: GameState): void {
  if (!next.mapProposals.length) return;
  const seated = new Set(next.phase === 'lobby' ? next.players.map(p => p.id) : []);
  next.mapProposals = next.mapProposals
    .map(p => ({ ...p, by: p.by.filter(id => seated.has(id)) }))
    .filter(p => p.by.length);
}

/** Lobby map proposals: players put maps forward and back them; the host picks one (choose-map) or turns one down. */
export const mapProposalHandlers: Pick<Handlers, 'propose-map' | 'decline-map' | 'set-board-players'> = {
  /**
   * Any seated person, the host too, puts a map forward or backs one already proposed, up to
   * TUNING.mapProposalsPerPlayer at a time; backing the same one again takes it back.
   */
  'propose-map'({ next, playerId, design }, action) {
    needPhase(next, 'lobby');
    const base = action.mapId === 'base';
    requireRule(base || design?.id === action.mapId, 'That map is not available.');
    const layoutFor = action.layoutFor ?? null;
    const same = (p: MapProposal) => p.mapId === action.mapId && p.layoutFor === layoutFor;
    const existing = next.mapProposals.find(same);
    if (existing?.by.includes(playerId)) {
      next.mapProposals = next.mapProposals
        .map(p => (p === existing ? { ...p, by: p.by.filter(id => id !== playerId) } : p))
        .filter(p => p.by.length);
      return;
    }
    const most = TUNING.mapProposalsPerPlayer;
    requireRule(proposalsBy(next.mapProposals, playerId) < most, `You can propose up to ${most} maps.`);
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

  /** Only changes which maps people see first; the game still uses the seats at the start. */
  'set-board-players'({ next, playerId }, action) {
    needPhase(next, 'lobby');
    requireHost(next, playerId, 'set the player count for maps');
    const { players } = action;
    requireRule(players === undefined || (players >= 2 && players <= MAX_PLAYERS), 'Choose 2 to 6 players.');
    next.boardPlayers = players ?? null;
  },
};
