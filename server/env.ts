import { GameError } from '../shared/engine';
import type { AccountIdentity, AccountStore } from './accounts';
import type { BoardLibraryStore } from './boards';
import { ProtocolError } from './protocol';
import type { GameRoom } from './room';

export interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>;
  ACCOUNTS: DurableObjectNamespace<AccountStore>;
  LIBRARY: DurableObjectNamespace<BoardLibraryStore>;
  ASSETS: Fetcher;
  ALLOWED_ORIGINS: string;
  DEV_MODE?: string;
  /** Comma-separated account usernames allowed to create solo test rooms in production. */
  PLAYTEST_USERS?: string;
  ROOM_CREATION_LIMITER: RateLimit;
  CONNECTION_LIMITER: RateLimit;
  AUTH_LIMITER: RateLimit;
}

export const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: securityHeaders });
}

/** Log an unexpected error with enough detail to debug it in Workers Observability. */
export function logError(where: string, error: unknown): void {
  const detail = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  console.error(JSON.stringify({ level: 'error', where, ...detail }));
}

export function failure(error: unknown): Response {
  if (error instanceof ProtocolError) return json({ error: error.message }, error.status);
  if (error instanceof GameError) return json({ error: error.message }, 409);
  logError('request', error);
  return json({ error: 'The server could not complete that request. Please try again.' }, 500);
}

export const roomStub = (env: Env, roomId: string) => env.ROOMS.get(env.ROOMS.idFromName(roomId));
export const accountStub = (env: Env, username: string) => env.ACCOUNTS.get(env.ACCOUNTS.idFromName(username));
/** The one board library for the whole site. */
export const libraryStub = (env: Env) => env.LIBRARY.get(env.LIBRARY.idFromName('library'));

/** Solo test rooms and the board editor are developer tools: open in local dev, otherwise limited to listed accounts. */
export function canPlaytest(env: Env, identity: AccountIdentity | null): boolean {
  if (env.DEV_MODE === 'true') return true;
  const allowed = (env.PLAYTEST_USERS ?? '')
    .split(',')
    .map(name => name.trim().toLowerCase())
    .filter(Boolean);
  return !!identity && allowed.includes(identity.username);
}

export async function checkLimit(limiter: RateLimit, key: string): Promise<void> {
  if (!(await limiter.limit({ key })).success)
    throw new ProtocolError('Too many requests. Wait a minute and try again.', 429);
}
