import { renameId } from '../copy';
import { DEFAULT_BOT_LEVEL, type GameState } from '../types';
import { addLog, type Handlers, requireRule } from './core';
import { requireHost } from './lobby';

/** Most spectators a room holds. */
const MAX_SPECTATORS = 16;

/**
 * The id a bot plays a person's seat under once the host hands it over. The person keeps their own
 * id (an account's id is the same in every room), so they can still watch or rejoin as themselves.
 */
export function botSeatId(state: GameState, personId: string): string {
  const taken = new Set([...state.players, ...state.spectators].map(p => p.id));
  let id = `${personId}.bot`;
  while (taken.has(id)) id += '.bot';
  return id;
}

export const seatHandlers: Pick<Handlers, 'seat-to-bot'> = {
  /**
   * Host, mid-game: an Advanced bot takes over someone's seat (pieces, cards, and points stay with
   * the seat). With `watch` the person stays as a spectator; otherwise they leave the room.
   */
  'seat-to-bot'({ next, playerId }, action) {
    requireRule(next.phase !== 'lobby' && next.phase !== 'finished', 'Seats can be handed to bots only during a game.');
    requireHost(next, playerId, 'hand seats to bots');
    const seat = next.players.find(p => p.id === action.playerId);
    requireRule(seat && !seat.bot, 'Choose a person at the table.');
    requireRule(seat.id !== playerId, 'Use Leave game to give up your own seat.');
    requireRule(!action.watch || next.spectators.length < MAX_SPECTATORS, 'This room already has sixteen spectators.');
    const botId = botSeatId(next, seat.id);
    // The board never holds player ids, so it is left out of the (whole-state) rename.
    const { board: _board, ...rest } = next;
    Object.assign(next, renameId(rest, seat.id, botId));
    next.players.find(p => p.id === botId)!.bot = DEFAULT_BOT_LEVEL;
    if (next.proposal?.required.includes(botId)) next.proposal = null;
    if (action.watch) {
      next.spectators.push({ id: seat.id, name: seat.name });
      addLog(next, `${seat.name} is now watching. A bot is playing their seat.`);
    } else addLog(next, `${seat.name} left. A bot is playing their seat.`);
  },
};
