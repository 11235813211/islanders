import { renameId } from '../copy';
import { DEFAULT_BOT_LEVEL, type GameState, type Player } from '../types';
import { addLog, cloneState, emptyStats, type Handlers, MAX_PLAYERS, requireRule } from './core';
import { newSeat, requireHost } from './lobby';

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

/**
 * The bot seat playing for `personId`: their own seat after they left mid-game, or the one the host
 * handed to a bot (`<person>.bot`, see botSeatId). Undefined when no bot is standing in for them.
 */
export function botSeatFor<P extends { id: string; bot?: Player['bot'] | null }>(
  state: { players: readonly P[] },
  personId: string,
): P | undefined {
  const standsIn = (id: string) =>
    id === personId || (id.startsWith(personId) && /^(\.bot)+$/.test(id.slice(personId.length)));
  return state.players.find(p => p.bot && standsIn(p.id));
}

/**
 * The person a bot is playing for takes the seat back as it stands (cards, pieces, points), so
 * handing a seat to a bot or leaving mid-game can always be undone by coming back.
 */
export function reclaimSeat(state: GameState, personId: string): GameState {
  const next = cloneState(state);
  takeBackSeat(next, personId);
  next.version++;
  return next;
}

/** reclaimSeat's change, made in place. */
function takeBackSeat(next: GameState, personId: string): void {
  const seat = botSeatFor(next, personId);
  requireRule(seat, 'No bot is playing a seat of yours.');
  requireRule(!next.players.some(p => p.id === personId && !p.bot), 'You already have a seat.');
  const watcher = next.spectators.find(s => s.id === personId);
  next.spectators = next.spectators.filter(s => s.id !== personId);
  if (seat.id !== personId) renameSeat(next, seat.id, personId);
  const taken = next.players.find(p => p.id === personId)!;
  delete taken.bot;
  if (watcher) taken.name = watcher.name;
  if (next.proposal?.required.includes(personId)) next.proposal = null;
  addLog(next, `${taken.name} took back their seat.`);
}

/** Swap one player id for another everywhere in the game (the board never holds player ids). */
function renameSeat(next: GameState, from: string, to: string): void {
  const { board: _board, chat: _chat, ...rest } = next;
  Object.assign(next, renameId(rest, from, to));
}

/**
 * Who should host while the host is away: the first connected person in seat order, or null when
 * nobody else is here (the server calls this once the host has been gone a while).
 */
export function awayHostSuccessor(state: GameState, online: readonly string[]): string | null {
  if (state.testMode || online.includes(state.hostId)) return null;
  return state.players.find(p => !p.bot && p.id !== state.hostId && online.includes(p.id))?.id ?? null;
}

/** Hosting moves to `id`, a person at the table. Returns the same object when that changes nothing. */
export function passHost(state: GameState, id: string): GameState {
  const player = state.players.find(p => p.id === id && !p.bot);
  if (!player || state.hostId === id) return state;
  const next = cloneState(state);
  next.hostId = id;
  next.version++;
  addLog(next, `${player.name} is now the host while the host is away.`);
  return next;
}

export const seatHandlers: Pick<Handlers, 'seat-to-bot' | 'seat-spectator'> = {
  /**
   * Host: someone watching takes a seat. In the lobby that can be an open seat; otherwise (and at
   * any time during a game) they take over a player's or bot's seat as it stands, and a person they
   * replace starts watching.
   */
  'seat-spectator'({ next, playerId }, action) {
    requireRule(next.phase !== 'finished', 'This game has finished.');
    requireRule(!next.testMode, 'Solo test rooms have fixed seats.');
    requireHost(next, playerId, 'seat spectators');
    const watcher = next.spectators.find(s => s.id === action.spectatorId);
    requireRule(watcher, 'Choose someone who is watching.');
    next.spectators = next.spectators.filter(s => s.id !== watcher.id);
    if (!action.playerId) {
      requireRule(next.phase === 'lobby', 'Choose a seat to take over.');
      requireRule(next.players.length < MAX_PLAYERS, 'This island already has eight players.');
      next.players.push(newSeat(next, watcher.id, watcher.name));
      next.stats[watcher.id] = emptyStats();
      addLog(next, `${watcher.name} took a seat.`);
      return;
    }
    const seat = next.players.find(p => p.id === action.playerId);
    requireRule(seat, 'Choose a seat to take over.');
    requireRule(seat.id !== playerId, 'Move yourself to the spectators instead.');
    if (botSeatFor(next, watcher.id) === seat) {
      next.spectators.push(watcher);
      takeBackSeat(next, watcher.id);
      return;
    }
    const replaced = { id: seat.id, name: seat.name, bot: seat.bot };
    renameSeat(next, replaced.id, watcher.id);
    const taken = next.players.find(p => p.id === watcher.id)!;
    taken.name = watcher.name;
    delete taken.bot;
    if (next.proposal?.required.includes(watcher.id)) next.proposal = null;
    if (!replaced.bot) next.spectators.push({ id: replaced.id, name: replaced.name });
    addLog(next, `${watcher.name} took over ${replaced.name}’s seat.`);
  },

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
    renameSeat(next, seat.id, botId);
    next.players.find(p => p.id === botId)!.bot = DEFAULT_BOT_LEVEL;
    if (next.proposal?.required.includes(botId)) next.proposal = null;
    if (action.watch) {
      next.spectators.push({ id: seat.id, name: seat.name });
      addLog(next, `${seat.name} is now watching. A bot is playing their seat.`);
    } else addLog(next, `${seat.name} left. A bot is playing their seat.`);
  },
};
