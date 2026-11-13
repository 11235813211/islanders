import { DurableObject } from 'cloudflare:workers';
import type { AccountRoom, AccountSession } from '../shared/types';
import type { Env } from './env';
import { derivePassword, verifyPassword } from './password';
import { hashToken, randomToken, signInDisplayName } from './protocol';

export interface AccountIdentity {
  username: string;
  /** What other players see: the registered capitalisation of `username`. */
  displayName: string;
  playerId: string;
  sessionHash: string;
  expiresAt: number;
  /** The person's choice to have their games saved for bot training. */
  saveGames?: boolean;
}
interface SavedLogin {
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
}
interface AccountRecord {
  version: 1;
  username: string;
  /** Username with the capitals the person registered with. */
  displayName?: string;
  playerId: string;
  salt: string;
  passwordHash: string;
  /** SHA-256 of the one-time recovery code. Missing for accounts made before recovery codes. */
  recoveryHash?: string;
  sessions: SavedLogin[];
  rooms: AccountRoom[];
  /** Consent to record games with this person in them (off unless set). */
  saveGames?: boolean;
}
/** Login sessions that ended, and the rooms whose seats should drop them. */
export interface Revoked {
  hashes: string[];
  rooms: AccountRoom[];
}
type Failure = { ok: false; status: number; error: string };
type AuthResult = { ok: true; session: AccountSession; recoveryCode?: string; revoked?: Revoked } | Failure;

const LOGIN_LIFETIME = 30 * 24 * 60 * 60 * 1000;
const MAX_LOGINS = 8;
const MAX_ROOMS = 30;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 20 random characters in groups of five (about 100 bits). */
function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const chars = Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return chars.match(/.{5}/g)!.join('-');
}
const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashCode = (code: string) => hashToken(normalizeCode(code));

/** Credentials and login sessions are isolated by normalized username. */
export class AccountStore extends DurableObject<Env> {
  private account: AccountRecord | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.account = await ctx.storage.get<AccountRecord>('account');
    });
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

  private liveSession(sessionHash: string): SavedLogin | undefined {
    return this.account?.sessions.find(login => login.tokenHash === sessionHash && login.expiresAt > Date.now());
  }

  /** Expensive check that runs even for unknown usernames, so timing doesn't reveal which exist. */
  private async passwordMatches(password: string): Promise<boolean> {
    const salt = this.account?.salt ?? '0'.repeat(64);
    const expected = this.account?.passwordHash ?? '0'.repeat(64);
    return (await verifyPassword(password, salt, expected)) && !!this.account;
  }

  private async newLogin(sessions: SavedLogin[]): Promise<{ session: AccountSession; sessions: SavedLogin[] }> {
    const token = randomToken();
    const expiresAt = Date.now() + LOGIN_LIFETIME;
    const kept = sessions.filter(s => s.expiresAt > Date.now()).slice(-(MAX_LOGINS - 1));
    return {
      session: {
        username: this.account!.username,
        displayName: this.account!.displayName ?? this.account!.username,
        token,
        expiresAt,
      },
      sessions: [...kept, { tokenHash: await hashToken(token), createdAt: Date.now(), expiresAt }],
    };
  }

  async authenticate(username: string, displayName: string, password: string, register: boolean): Promise<AuthResult> {
    return this.serial(async () => {
      if (register && this.account) return { ok: false, status: 409, error: 'That username is already taken.' };
      if (register) {
        const salt = randomToken();
        const recoveryCode = newRecoveryCode();
        this.account = {
          version: 1,
          username,
          displayName,
          playerId: crypto.randomUUID(),
          salt,
          passwordHash: await derivePassword(password, salt),
          recoveryHash: await hashCode(recoveryCode),
          sessions: [],
          rooms: [],
        };
        const { session, sessions } = await this.newLogin([]);
        await this.save({ ...this.account, sessions });
        return { ok: true, session, recoveryCode };
      }
      if (!(await this.passwordMatches(password)))
        return { ok: false, status: 401, error: 'Incorrect username or password.' };
      const account = this.account!;
      const named = signInDisplayName(account.displayName, displayName);
      if (named !== account.displayName) this.account = { ...account, displayName: named };
      const { session, sessions } = await this.newLogin(account.sessions);
      const revoked = {
        hashes: account.sessions
          .filter(old => !sessions.some(s => s.tokenHash === old.tokenHash))
          .map(old => old.tokenHash),
        rooms: account.rooms,
      };
      await this.save({ ...this.account!, sessions });
      return { ok: true, session, revoked };
    });
  }

  /** Reset the password with the recovery code. Signs out every device and issues a fresh code. */
  async recover(code: string, password: string): Promise<AuthResult> {
    return this.serial(async () => {
      const valid = !!this.account?.recoveryHash && (await hashCode(code)) === this.account.recoveryHash;
      if (!this.account || !valid)
        return { ok: false, status: 401, error: 'That username and recovery code do not match.' };
      const salt = randomToken();
      const recoveryCode = newRecoveryCode();
      const revoked = { hashes: this.account.sessions.map(s => s.tokenHash), rooms: this.account.rooms };
      const { session, sessions } = await this.newLogin([]);
      await this.save({
        ...this.account,
        salt,
        passwordHash: await derivePassword(password, salt),
        recoveryHash: await hashCode(recoveryCode),
        sessions,
      });
      return { ok: true, session, recoveryCode, revoked };
    });
  }

  /** Replace the recovery code (the old one stops working). Requires the current password. */
  async replaceRecoveryCode(
    sessionHash: string,
    password: string,
  ): Promise<{ ok: true; recoveryCode: string } | Failure> {
    return this.serial(async () => {
      if (!this.liveSession(sessionHash)) return { ok: false, status: 401, error: 'Sign in again to continue.' };
      if (!(await this.passwordMatches(password))) return { ok: false, status: 401, error: 'Incorrect password.' };
      const recoveryCode = newRecoveryCode();
      await this.save({ ...this.account!, recoveryHash: await hashCode(recoveryCode) });
      return { ok: true, recoveryCode };
    });
  }

  /** Permanently delete the account. Returns the sessions and rooms to clean up. */
  async deleteAccount(sessionHash: string, password: string): Promise<({ ok: true } & Revoked) | Failure> {
    return this.serial(async () => {
      if (!this.liveSession(sessionHash)) return { ok: false, status: 401, error: 'Sign in again to continue.' };
      if (!(await this.passwordMatches(password))) return { ok: false, status: 401, error: 'Incorrect password.' };
      const revoked = { hashes: this.account!.sessions.map(s => s.tokenHash), rooms: this.account!.rooms };
      await this.ctx.storage.deleteAll();
      this.account = undefined;
      return { ok: true, ...revoked };
    });
  }

  async current(
    sessionHash: string,
  ): Promise<{ identity: AccountIdentity; rooms: AccountRoom[]; hasRecoveryCode: boolean } | null> {
    return this.serial(async () => {
      const session = this.liveSession(sessionHash);
      if (!this.account || !session) return null;
      return {
        identity: {
          username: this.account.username,
          displayName: this.account.displayName ?? this.account.username,
          playerId: this.account.playerId,
          sessionHash,
          expiresAt: session.expiresAt,
          saveGames: this.account.saveGames === true,
        },
        rooms: this.account.rooms,
        hasRecoveryCode: !!this.account.recoveryHash,
      };
    });
  }

  /** Remember whether this account's games may be recorded. */
  async setSaveGames(sessionHash: string, value: boolean): Promise<boolean> {
    return this.serial(async () => {
      if (!this.account || !this.liveSession(sessionHash)) return false;
      await this.save({ ...this.account, saveGames: value });
      return true;
    });
  }

  async remember(sessionHash: string, room: AccountRoom): Promise<boolean> {
    return this.serial(async () => {
      if (!this.account || !this.liveSession(sessionHash)) return false;
      const rooms = [room, ...this.account.rooms.filter(saved => saved.roomId !== room.roomId)].slice(0, MAX_ROOMS);
      await this.save({ ...this.account, rooms });
      return true;
    });
  }

  /** Drop rooms from "My rooms" (expired, left, or removed). */
  async forget(roomIds: string[]): Promise<void> {
    return this.serial(async () => {
      if (!this.account || !roomIds.length) return;
      await this.save({ ...this.account, rooms: this.account.rooms.filter(room => !roomIds.includes(room.roomId)) });
    });
  }

  async logout(sessionHash: string): Promise<{ username: string; rooms: AccountRoom[] } | null> {
    return this.serial(async () => {
      if (!this.account) return null;
      const { rooms, username } = this.account;
      await this.save({
        ...this.account,
        sessions: this.account.sessions.filter(session => session.tokenHash !== sessionHash),
      });
      return { username, rooms };
    });
  }
}
