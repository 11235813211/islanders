import { CUSTOM_ROOM_CODE } from '../shared/settings';
import type { GameState } from '../shared/types';
import { canPlaytest, type Env, roomStub } from './env';
import { ProtocolError } from './protocol';

/**
 * An admin host's own room code. The room keeps its first code as its address (sessions, sockets,
 * accounts); the chosen code is a second Durable Object that holds only an alias and forwards joins.
 */

/** Throws unless this person may give the room its own code now: an admin host, in the lobby, once. */
export function checkCodeChange(
  env: Env,
  game: GameState,
  playerId: string,
  account: { username: string } | undefined,
  code: string,
): void {
  if (game.hostId !== playerId || !canPlaytest(env, account ?? null))
    throw new ProtocolError('Only an admin host can set the room code.', 403);
  if (game.phase !== 'lobby') throw new ProtocolError('The room code can only be set before the game starts.');
  if (game.inviteCode) throw new ProtocolError('This room already has its own code.');
  if (!CUSTOM_ROOM_CODE.test(code) || code === game.roomId)
    throw new ProtocolError('Use 4–12 letters and digits, starting with a letter.');
}

/** Take `code` for the room `roomId`. False when another room (or alias) already has it. */
export async function claimCode(env: Env, code: string, roomId: string): Promise<boolean> {
  const response = await roomStub(env, code).fetch(
    new Request('https://room.internal/alias', { method: 'POST', body: JSON.stringify({ target: roomId }) }),
  );
  return response.ok;
}

/** Free the room's own code when the room closes. */
export async function releaseCode(env: Env, code: string, roomId: string): Promise<void> {
  await roomStub(env, code).fetch(
    new Request('https://room.internal/unalias', { method: 'POST', body: JSON.stringify({ target: roomId }) }),
  );
}
