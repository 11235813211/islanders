import { isIdentifier, parseAction } from '../shared/actions';
import { GameError } from '../shared/engine';
import type { ClientMessage, GameAction } from '../shared/types';

export const ROOM_PATTERN = /^(?:[A-Z]{3,12}\d{2}|[A-HJ-NP-Z2-9]{8})$/;
export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
export const MAX_BODY_BYTES = 2048;
/** Saved boards are larger than other requests: a few hundred tiles. */
export const MAX_BOARD_BYTES = 96 * 1024;
export const MAX_MESSAGE_BYTES = 4096;
export const AUTH_TIMEOUT_MS = 10_000;

export class ProtocolError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseCredentials(body: unknown): { username: string; displayName: string; password: string } {
  if (!record(body) || typeof body.username !== 'string' || typeof body.password !== 'string')
    throw new ProtocolError('Enter a username and password.');
  const displayName = body.username.trim();
  const username = displayName.toLowerCase();
  if (!USERNAME_PATTERN.test(username))
    throw new ProtocolError('Use a username of 3–24 letters, numbers, or underscores.');
  if (body.password.length < 12 || body.password.length > 128)
    throw new ProtocolError('Use a password of 12–128 characters.');
  return { username, displayName, password: body.password };
}

export function parseAuthorization(header: string | null): { username: string; token: string } | null {
  if (!header) return null;
  const match = /^Bearer ([a-z0-9_]{3,24}):([a-f0-9]{64})$/.exec(header);
  if (!match) throw new ProtocolError('Sign in again to continue.', 401);
  return { username: match[1]!, token: match[2]! };
}

export function parseName(body: unknown): string {
  if (!record(body) || typeof body.name !== 'string') throw new ProtocolError('Enter your name.');
  const name = body.name.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 24 || /[\p{Cc}\p{Cf}<>]/u.test(name)) {
    throw new ProtocolError('Use a name of 1–24 characters, without markup or control characters.');
  }
  return name;
}

/** A blank or missing name means "pick a guest name for me" (see shared/guest-names.ts). */
export function parseOptionalName(body: unknown): string | null {
  if (record(body) && (body.name == null || (typeof body.name === 'string' && !body.name.trim()))) return null;
  return parseName(body);
}

/** Parse a client's action with the shared table (shared/actions.ts), dropping unknown fields. */
export function validateAction(value: unknown): GameAction {
  try {
    return parseAction(value, { strict: false });
  } catch (error) {
    if (error instanceof GameError) throw new ProtocolError(error.message);
    throw error;
  }
}

/** Body of a password reset: username, recovery code, and the new password. */
export function parseRecovery(body: unknown): { username: string; code: string; password: string } {
  if (!record(body) || typeof body.code !== 'string' || body.code.length > 64)
    throw new ProtocolError('Enter your recovery code.');
  const { username, password } = parseCredentials(body);
  return { username, code: body.code, password };
}

/** Body that only carries the current password (for account changes). */
export function parsePassword(body: unknown): string {
  if (!record(body) || typeof body.password !== 'string' || body.password.length > 128)
    throw new ProtocolError('Enter your password.');
  return body.password;
}

export function parseMessage(raw: string | ArrayBuffer): ClientMessage {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) {
    throw new ProtocolError('Message is too large or is not text.');
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ProtocolError('Invalid JSON.');
  }
  if (!record(value)) throw new ProtocolError('Invalid message.');
  if (value.type === 'auth' && typeof value.token === 'string' && /^[a-f0-9]{64}$/.test(value.token)) {
    return { type: 'auth', token: value.token };
  }
  if (value.type === 'consent' && typeof value.value === 'boolean') return { type: 'consent', value: value.value };
  if (value.type === 'view-as' && isIdentifier(value.playerId)) return { type: 'view-as', playerId: value.playerId };
  if (
    value.type === 'action' &&
    isIdentifier(value.id) &&
    Number.isSafeInteger(value.version) &&
    (value.version as number) >= 0
  ) {
    return { type: 'action', id: value.id, version: value.version as number, action: validateAction(value.action) };
  }
  throw new ProtocolError('Invalid message.');
}

export function originAllowed(
  origin: string | null,
  configuredOrigins: string,
  requestOrigin?: string,
  development = false,
): boolean {
  if (!origin || origin === 'null') return false;
  if (
    configuredOrigins
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .includes(origin)
  )
    return true;
  if (requestOrigin && origin === requestOrigin) return true;
  if (!development) return false;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.protocol !== 'http:' || url.port !== '5173') return false;
    const parts = url.hostname.split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    return (
      parts[0] === 10 ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31)
    );
  } catch {
    return false;
  }
}

export async function readBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    throw new ProtocolError('Send application/json.', 415);
  }
  const length = request.headers.get('content-length');
  if (length && Number(length) > maxBytes) throw new ProtocolError('Request is too large.', 413);
  if (!request.body) throw new ProtocolError('Request body is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ProtocolError('Request is too large.', 413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ProtocolError('Invalid JSON.');
  }
}

export function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 0x1_0000_0000;
}

export function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** A new room's code: a word and two digits, like LUMBER42. */
export function roomCode(): string {
  const words = [
    'ANCHOR',
    'BADGER',
    'BAMBOO',
    'BEACON',
    'BEAVER',
    'BIRCH',
    'BISON',
    'BREEZE',
    'BRIDGE',
    'BRONZE',
    'CANYON',
    'CEDAR',
    'CHERRY',
    'CIPHER',
    'CLOVER',
    'COBALT',
    'COMET',
    'COPPER',
    'CORAL',
    'CRANE',
    'CRICKET',
    'CROWN',
    'CRYSTAL',
    'DAGGER',
    'DOLPHIN',
    'DRAGON',
    'DRIFT',
    'EAGLE',
    'EMBER',
    'FALCON',
    'FERN',
    'FJORD',
    'FLINT',
    'FOREST',
    'FOX',
    'FROST',
    'GARNET',
    'GLACIER',
    'GROVE',
    'HARBOR',
    'HAWK',
    'HERON',
    'HICKORY',
    'HORIZON',
    'HUSKY',
    'ISLAND',
    'IVORY',
    'JASPER',
    'JUNIPER',
    'KESTREL',
    'KITE',
    'LAGOON',
    'LANTERN',
    'LAUREL',
    'LEOPARD',
    'LINDEN',
    'LOTUS',
    'LYNX',
    'MAPLE',
    'MARBLE',
    'MARLIN',
    'MEADOW',
    'MERLIN',
    'MOOSE',
    'MOSS',
    'NOVA',
    'OAK',
    'OCEAN',
    'ONYX',
    'ORBIT',
    'ORCHID',
    'OSPREY',
    'OTTER',
    'PANDA',
    'PEBBLE',
    'PELICAN',
    'PINE',
    'PLUM',
    'POPLAR',
    'PUFFIN',
    'QUARTZ',
    'RAVEN',
    'REEF',
    'RIDGE',
    'RIVER',
    'ROBIN',
    'ROWAN',
    'RUBY',
    'SAFFRON',
    'SAILOR',
    'SALMON',
    'SEQUOIA',
    'SHARK',
    'SIERRA',
    'SPARROW',
    'SPRUCE',
    'SUMMIT',
    'THISTLE',
    'TIGER',
    'TIMBER',
    'TOPAZ',
    'TUNDRA',
    'TURTLE',
    'VALLEY',
    'WALRUS',
    'WILLOW',
    'WOLF',
    'WREN',
    'YARROW',
    'ZEPHYR',
  ];
  // 10–99: a number never starts with 0, which reads like the letter O.
  return `${words[randomIndex(words.length)]}${10 + randomIndex(90)}`;
}

function randomIndex(length: number): number {
  const maximum = Math.floor(0x1_0000_0000 / length) * length;
  let value: number;
  do {
    value = crypto.getRandomValues(new Uint32Array(1))[0]!;
  } while (value >= maximum);
  return value % length;
}
