import type { GameState } from '../shared/types';

/**
 * A guest who signs in keeps their seat: every mention of the guest's player id (seat, host,
 * sessions, log events, answers) becomes the account's id. Player ids are random UUIDs, so a
 * plain text replacement over the stored room can't touch anything else.
 */
export function rekeyPlayer<T extends { game: GameState }>(room: T, guestId: string, accountId: string): T {
  return JSON.parse(JSON.stringify(room).replaceAll(JSON.stringify(guestId), JSON.stringify(accountId))) as T;
}

/** In the lobby the seat also takes the account's name. */
export function renameInLobby(game: GameState, playerId: string, name: string | null): GameState {
  if (!name || game.phase !== 'lobby') return game;
  return { ...game, players: game.players.map(p => (p.id === playerId ? { ...p, name } : p)) };
}
