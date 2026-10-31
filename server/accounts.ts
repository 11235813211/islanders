import { DurableObject } from 'cloudflare:workers';
import type { AccountRoom, AccountSession } from '../shared/types';
import type { Env } from './index';
import { hashToken, randomToken } from './protocol';
import { derivePassword, verifyPassword } from './password';

export interface AccountIdentity { username: string; playerId: string; sessionHash: string; expiresAt: number }
interface SavedLogin { tokenHash: string; createdAt: number; expiresAt: number }
interface AccountRecord {
  version: 1; username: string; playerId: string; salt: string; passwordHash: string;
  sessions: SavedLogin[]; rooms: AccountRoom[];
}
type AuthResult = { ok: true; session: AccountSession; revoked?: { hashes: string[]; rooms: AccountRoom[] } } | { ok: false; status: number; error: string };
const LOGIN_LIFETIME = 30 * 24 * 60 * 60 * 1000;
const MAX_LOGINS = 8;

/** Credentials and login sessions are isolated by normalized username. */
export class AccountStore extends DurableObject<Env> {
  private account: AccountRecord | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.account = await ctx.storage.get<AccountRecord>('account'); });
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async save(next: AccountRecord): Promise<void> {
    await this.ctx.storage.put('account', next);
    this.account = next;
  }

  async authenticate(username: string, password: string, register: boolean): Promise<AuthResult> {
    return this.serial(async () => {
      if (register && this.account) return { ok: false, status: 409, error: 'That username is already taken.' };
      if (register) {
        const salt = randomToken();
        const passwordHash = await derivePassword(password, salt);
        const token = randomToken();
        const expiresAt = Date.now() + LOGIN_LIFETIME;
        const tokenHash = await hashToken(token);
        await this.save({ version: 1, username, playerId: crypto.randomUUID(), salt, passwordHash,
          sessions: [{ tokenHash, createdAt: Date.now(), expiresAt }], rooms: [] });
        return { ok: true, session: { username, token, expiresAt } };
      }
      // Run a comparable expensive check for unknown usernames as well.
      const salt = this.account?.salt ?? '0'.repeat(64);
      const expected = this.account?.passwordHash ?? '0'.repeat(64);
      const valid = await verifyPassword(password, salt, expected);
      if (!this.account || !valid) return { ok: false, status: 401, error: 'Incorrect username or password.' };
      const token = randomToken();
      const expiresAt = Date.now() + LOGIN_LIFETIME;
      const sessions = this.account.sessions.filter(session => session.expiresAt > Date.now()).slice(-(MAX_LOGINS - 1));
      const revoked = { hashes: this.account.sessions.filter(old => !sessions.includes(old)).map(old => old.tokenHash), rooms: this.account.rooms };
      sessions.push({ tokenHash: await hashToken(token), createdAt: Date.now(), expiresAt });
      await this.save({ ...this.account, sessions });
      return { ok: true, session: { username: this.account.username, token, expiresAt }, revoked };
    });
  }

  async current(sessionHash: string): Promise<{ identity: AccountIdentity; rooms: AccountRoom[] } | null> {
    return this.serial(async () => {
      const session = this.account?.sessions.find(login => login.tokenHash === sessionHash && login.expiresAt > Date.now());
      if (!this.account || !session) return null;
      return { identity: { username: this.account.username, playerId: this.account.playerId, sessionHash, expiresAt: session.expiresAt }, rooms: this.account.rooms };
    });
  }

  async remember(sessionHash: string, room: AccountRoom): Promise<boolean> {
    return this.serial(async () => {
      if (!this.account?.sessions.some(session => session.tokenHash === sessionHash && session.expiresAt > Date.now())) return false;
      const rooms = [room, ...this.account.rooms.filter(saved => saved.roomId !== room.roomId)].slice(0, 40);
      await this.save({ ...this.account, rooms });
      return true;
    });
  }

  async logout(sessionHash: string): Promise<{ username: string; rooms: AccountRoom[] } | null> {
    return this.serial(async () => {
      if (!this.account) return null;
      const rooms = this.account.rooms;
      const username = this.account.username;
      await this.save({ ...this.account, sessions: this.account.sessions.filter(session => session.tokenHash !== sessionHash) });
      return { username, rooms };
    });
  }
}
