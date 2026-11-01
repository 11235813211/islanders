import { DurableObject } from 'cloudflare:workers';
import { addPlayer, addSpectator, advanceTime, applyAction, createGame, GameError, getView, normalizeGame } from '../shared/engine';
import type { GameState, ServerMessage, Session } from '../shared/types';
import { AccountStore, type AccountIdentity } from './accounts';
import { AUTH_TIMEOUT_MS, hashToken, originAllowed, parseAuthorization, parseCredentials, parseMessage, parseName, ProtocolError, randomToken, readBody, record, ROOM_LIFETIME_MS, ROOM_PATTERN, roomCode, secureRandom } from './protocol';
export { AccountStore } from './accounts';

export interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>;
  ACCOUNTS: DurableObjectNamespace<AccountStore>;
  ASSETS: Fetcher;
  ALLOWED_ORIGINS: string;
  DEV_MODE?: string;
  ROOM_CREATION_LIMITER: RateLimit;
  CONNECTION_LIMITER: RateLimit;
  AUTH_LIMITER: RateLimit;
}

interface AccountBinding { username: string; sessionHash: string; expiresAt: number }
interface SavedSession { playerId: string; tokenHash: string; processedIds: string[]; account?: AccountBinding; createdAt?: number }
interface RoomRecord { schema: 1; game: GameState; sessions: SavedSession[]; lastActivity: number }
interface Attachment { playerId: string | null; tokenHash?: string; controlledId?: string; connectedAt: number; windowStart: number; messageCount: number }

const MAX_SOCKETS = 40;
const MAX_PLAYER_SOCKETS = 4;
const MAX_MESSAGES_PER_MINUTE = 90;
const securityHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

function json(body: unknown, status = 200): Response { return Response.json(body, { status, headers: securityHeaders }); }
function failure(error: unknown): Response {
  if (error instanceof ProtocolError) return json({ error: error.message }, error.status);
  if (error instanceof GameError) return json({ error: error.message }, 409);
  console.error('Room request failed unexpectedly.');
  return json({ error: 'The server could not complete that request. Please try again.' }, 500);
}
function cors(response: Response, origin: string | null): Response {
  if (response.status === 101 || !origin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, { status: response.status, headers });
}
function accountStub(env: Env, username: string) { return env.ACCOUNTS.get(env.ACCOUNTS.idFromName(username)); }
async function accountFor(request: Request, env: Env, required = false): Promise<AccountIdentity | null> {
  const authorization = parseAuthorization(request.headers.get('Authorization'));
  if (!authorization) {
    if (required) throw new ProtocolError('Sign in to continue.', 401);
    return null;
  }
  const current = await accountStub(env, authorization.username).current(await hashToken(authorization.token));
  if (!current) throw new ProtocolError('Your sign-in expired. Please sign in again.', 401);
  return current.identity;
}
async function checkLimit(limiter: RateLimit, key: string): Promise<void> {
  if (!(await limiter.limit({ key })).success) throw new ProtocolError('Too many requests. Wait a minute and try again.', 429);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true, service: 'islanders', protocol: 2 });
    const origin = request.headers.get('Origin');
    // Same-origin GET fetches can omit Origin; /me still requires its bearer credential.
    const readAccount = request.method === 'GET' && url.pathname === '/api/accounts/me' && !origin;
    if (!readAccount && !originAllowed(origin, env.ALLOWED_ORIGINS || '', url.origin, env.DEV_MODE === 'true')) return json({ error: 'This origin is not allowed.' }, 403);
    let response: Response;
    try {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin);
      const requester = request.headers.get('CF-Connecting-IP') ?? 'local-development';
      const authMatch = /^\/api\/accounts\/(register|login|me|logout)$/.exec(url.pathname);
      if (authMatch) {
        const operation = authMatch[1]!;
        const method = operation === 'me' ? 'GET' : 'POST';
        if (request.method !== method) throw new ProtocolError(`Use ${method} for this endpoint.`, 405);
        if (operation === 'register' || operation === 'login') {
          await checkLimit(env.AUTH_LIMITER, `ip:${requester}`);
          const input = parseCredentials(await readBody(request));
          await checkLimit(env.AUTH_LIMITER, `account:${input.username}`);
          const result = await accountStub(env, input.username).authenticate(input.username, input.password, operation === 'register');
          if (result.ok && result.revoked) {
            await Promise.all(result.revoked.rooms.flatMap(room => result.revoked!.hashes.map(hash =>
              env.ROOMS.get(env.ROOMS.idFromName(room.roomId)).revoke(input.username, hash))));
          }
          return cors(result.ok ? json(result.session, operation === 'register' ? 201 : 200) : json({ error: result.error }, result.status), origin);
        }
        await checkLimit(env.CONNECTION_LIMITER, `account:${requester}`);
        const identity = (await accountFor(request, env, true))!;
        const stub = accountStub(env, identity.username);
        if (operation === 'me') {
          const current = await stub.current(identity.sessionHash);
          if (!current) throw new ProtocolError('Sign in again to continue.', 401);
          return cors(json({ username: identity.username, rooms: current.rooms }), origin);
        }
        const removed = await stub.logout(identity.sessionHash);
        if (removed) await Promise.all(removed.rooms.map(room => env.ROOMS.get(env.ROOMS.idFromName(room.roomId)).revoke(identity.username, identity.sessionHash)));
        return cors(json({ ok: true }), origin);
      }
      await checkLimit(url.pathname === '/api/rooms' ? env.ROOM_CREATION_LIMITER : env.CONNECTION_LIMITER, `http:${requester}`);
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        const body = await readBody(request);
        const identity = await accountFor(request, env);
        const name = identity?.username ?? parseName(body);
        if (!record(body)) throw new ProtocolError('Invalid room request.');
        if (body.playtest !== undefined && typeof body.playtest !== 'boolean') throw new ProtocolError('Invalid playtest setting.');
        for (let attempt = 0; attempt < 20; attempt++) {
          const code = roomCode();
          const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
          response = await stub.fetch(new Request(`https://room.internal/create/${code}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, identity, playtest: body.playtest === true }),
          }));
          if (response.status !== 409) return cors(response, origin);
        }
        throw new ProtocolError('Could not allocate a room. Try again.', 503);
      }
      const match = /^\/api\/rooms\/([^/]+)\/(join|socket)$/.exec(url.pathname);
      const code = match?.[1]?.toUpperCase();
      if (!match || !code || !ROOM_PATTERN.test(code)) throw new ProtocolError('Room not found. Check the word and two-digit code.', 404);
      const operation = match[2]!;
      const method = operation === 'join' ? 'POST' : 'GET';
      if (request.method !== method) throw new ProtocolError(`Use ${method} for this endpoint.`, 405);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      if (operation === 'join') {
        const body = await readBody(request);
        const identity = await accountFor(request, env);
        const name = identity?.username ?? parseName(body);
        response = await stub.fetch(new Request('https://room.internal/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, identity, spectate: record(body) && body.spectate === true, autoSpectate: record(body) && body.autoSpectate === true }) }));
      } else {
        const internal = new URL(request.url);
        internal.pathname = '/socket'; internal.search = '';
        response = await stub.fetch(new Request(internal, request));
      }
    } catch (error) { response = failure(error); }
    return cors(response, origin);
  },
} satisfies ExportedHandler<Env>;

/** One serialized, durable source of truth per invite code. No client owns game state. */
export class GameRoom extends DurableObject<Env> {
  private record: RoomRecord | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.record = await ctx.storage.get<RoomRecord>('room');
      if (this.record) this.record.game = normalizeGame(this.record.game, Date.now(), secureRandom);
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation); this.queue = result.catch(() => undefined); return result;
  }
  private attachment(socket: WebSocket): Attachment { return socket.deserializeAttachment() as Attachment; }
  private sockets(): WebSocket[] { return this.ctx.getWebSockets().filter(socket => socket.readyState === 1); }
  private online(): string[] { return [...new Set(this.sockets().map(socket => this.attachment(socket)?.playerId).filter((id): id is string => !!id))]; }
  private send(socket: WebSocket, message: ServerMessage): void {
    try { socket.send(JSON.stringify(message)); } catch { /* Reconnection reads the durable snapshot. */ }
  }
  private savedFor(attachment: Attachment): SavedSession | undefined {
    return this.record?.sessions.find(session => attachment.tokenHash ? session.tokenHash === attachment.tokenHash : session.playerId === attachment.playerId);
  }
  private actor(attachment: Attachment): string {
    return this.record?.game.testMode && attachment.playerId === this.record.game.hostId ? attachment.controlledId ?? attachment.playerId : attachment.playerId!;
  }
  private snapshot(socket: WebSocket, acknowledgedId?: string): void {
    const attachment = this.attachment(socket);
    if (!attachment?.playerId || !this.record) return;
    const saved = this.savedFor(attachment);
    if (!saved || (saved.account && saved.account.expiresAt <= Date.now())) { socket.close(4401, 'Sign in again to continue.'); return; }
    this.send(socket, { type: 'state', state: getView(this.record.game, this.actor(attachment)), online: this.online(), ...(acknowledgedId ? { acknowledgedId } : {}) });
  }
  private broadcast(acknowledgedId?: string, actor?: string): void {
    for (const socket of this.sockets()) this.snapshot(socket, this.attachment(socket)?.playerId === actor ? acknowledgedId : undefined);
  }
  private async commit(next: RoomRecord): Promise<void> {
    await this.ctx.storage.put('room', next); this.record = next; await this.scheduleAlarm();
  }
  private async scheduleAlarm(): Promise<void> {
    const deadlines = this.sockets().filter(socket => !this.attachment(socket)?.playerId).map(socket => this.attachment(socket).connectedAt + AUTH_TIMEOUT_MS);
    if (this.record) {
      deadlines.push(this.record.lastActivity + ROOM_LIFETIME_MS);
      const game = this.record.game;
      if (game.proposal) deadlines.push(game.proposal.expiresAt);
      if (game.pausedAt === null) {
        if (game.phase === 'roll' && game.rollDeadline !== null) deadlines.push(game.rollDeadline);
        if (game.turnDeadline !== null) deadlines.push(game.turnDeadline);
        if (game.tradeOffer) deadlines.push(game.tradeOffer.expiresAt);
      }
      for (const socket of this.sockets()) {
        const saved = this.savedFor(this.attachment(socket));
        if (saved?.account) deadlines.push(saved.account.expiresAt);
      }
    }
    if (deadlines.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...deadlines)));
    else await this.ctx.storage.deleteAlarm();
  }
  private requireRoom(): RoomRecord {
    if (!this.record || Date.now() - this.record.lastActivity >= ROOM_LIFETIME_MS) throw new ProtocolError('This room does not exist or has expired.', 404);
    return this.record;
  }
  private async accountValid(saved: SavedSession): Promise<boolean> {
    if (!saved.account) return true;
    const current = await accountStub(this.env, saved.account.username).current(saved.account.sessionHash);
    return current?.identity.playerId === saved.playerId;
  }
  private async issueSession(room: RoomRecord, playerId: string, identity?: AccountIdentity | null): Promise<Session> {
    const token = randomToken();
    const session: Session = { roomId: room.game.roomId, playerId, token };
    const saved: SavedSession = { playerId, tokenHash: await hashToken(token), processedIds: [], createdAt: Date.now(),
      ...(identity ? { account: { username: identity.username, sessionHash: identity.sessionHash, expiresAt: identity.expiresAt } } : {}) };
    const otherSessions = room.sessions.filter(candidate => candidate.playerId !== playerId);
    const ownSessions = room.sessions.filter(candidate => candidate.playerId === playerId).slice(-11);
    await this.commit({ ...room, sessions: [...otherSessions, ...ownSessions, saved], lastActivity: Date.now() });
    if (identity) await accountStub(this.env, identity.username).remember(identity.sessionHash, { roomId: session.roomId, playerId });
    return session;
  }
  async revoke(username: string, sessionHash: string): Promise<void> {
    await this.serial(async () => {
      if (!this.record) return;
      const revoked = new Set(this.record.sessions.filter(session => session.account?.username === username && session.account.sessionHash === sessionHash).map(session => session.tokenHash));
      await this.commit({ ...this.record, sessions: this.record.sessions.filter(session => !revoked.has(session.tokenHash)) });
      for (const socket of this.sockets()) if (revoked.has(this.attachment(socket)?.tokenHash ?? '')) socket.close(4401, 'Signed out on this device.');
      this.broadcast();
    });
  }
  async fetch(request: Request): Promise<Response> {
    return this.serial(async () => {
      try {
        const path = new URL(request.url).pathname;
        const create = /^\/create\/([^/]+)$/.exec(path);
        if (create && ROOM_PATTERN.test(create[1]!) && request.method === 'POST') {
          if (this.record) throw new ProtocolError('Room already exists.', 409);
          const body = await readBody(request) as { name: string; identity?: AccountIdentity | null; playtest?: boolean };
          const name = parseName(body);
          const identity = body.identity;
          const playerId = identity?.playerId ?? crypto.randomUUID();
          let game = addPlayer(createGame(create[1]!, secureRandom, { testMode: body.playtest === true }), { id: playerId, name });
          if (body.playtest) {
            game = addPlayer(game, { id: crypto.randomUUID(), name: 'Test player 2' });
            game = addPlayer(game, { id: crypto.randomUUID(), name: 'Test player 3' });
          }
          const session = await this.issueSession({ schema: 1, game, sessions: [], lastActivity: Date.now() }, playerId, identity);
          return json(session, 201);
        }
        if (path === '/join' && request.method === 'POST') {
          const room = this.requireRoom();
          const body = await readBody(request) as { name: string; identity?: AccountIdentity | null; spectate?: boolean; autoSpectate?: boolean };
          const name = parseName(body);
          const identity = body.identity;
          const existing = identity && [...room.game.players, ...room.game.spectators].find(player => player.id === identity.playerId);
          if (body.autoSpectate && (room.game.testMode || room.game.phase !== 'lobby' || room.game.players.length >= 4)) body.spectate = true;
          if (!existing && room.game.testMode && !body.spectate) throw new ProtocolError('This is a solo test room. Join as a spectator or create a multiplayer room.', 409);
          const playerId = existing?.id ?? identity?.playerId ?? crypto.randomUUID();
          let game = existing ? room.game : body.spectate ? addSpectator(room.game, { id: playerId, name }) : addPlayer(room.game, { id: playerId, name });
          if (existing && !body.spectate && game.phase === 'lobby' && !game.testMode && game.spectators.some(p => p.id === playerId)) {
            game = addPlayer(game, { id: playerId, name });
            game.spectators = game.spectators.filter(p => p.id !== playerId);
          }
          const session = await this.issueSession({ ...room, game }, playerId, identity);
          this.broadcast();
          return json(session, existing ? 200 : 201);
        }
        if (path === '/socket' && request.method === 'GET') {
          this.requireRoom();
          if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') throw new ProtocolError('A WebSocket connection is required.', 426);
          if (this.sockets().length >= MAX_SOCKETS) throw new ProtocolError('Too many connections. Try again shortly.', 429);
          const pair = new WebSocketPair();
          const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
          this.ctx.acceptWebSocket(server);
          server.serializeAttachment({ playerId: null, connectedAt: Date.now(), windowStart: Date.now(), messageCount: 0 } satisfies Attachment);
          await this.scheduleAlarm();
          return new Response(null, { status: 101, webSocket: client });
        }
        throw new ProtocolError('Not found.', 404);
      } catch (error) { return failure(error); }
    });
  }
  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.serial(async () => {
      let actionId: string | undefined;
      try {
        const attachment = this.attachment(socket);
        if (!attachment) { socket.close(4401, 'Authentication required.'); return; }
        if (Date.now() - attachment.windowStart >= 60_000) { attachment.windowStart = Date.now(); attachment.messageCount = 0; }
        attachment.messageCount++; socket.serializeAttachment(attachment);
        if (attachment.messageCount > MAX_MESSAGES_PER_MINUTE) { socket.close(4429, 'Too many messages.'); return; }
        const message = parseMessage(raw);
        let room = this.requireRoom();
        if (!attachment.playerId) {
          if (message.type !== 'auth' || Date.now() - attachment.connectedAt > AUTH_TIMEOUT_MS) { socket.close(4401, 'Authenticate before sending actions.'); return; }
          const tokenHash = await hashToken(message.token);
          const saved = room.sessions.find(session => session.tokenHash === tokenHash);
          if (!saved || !(await this.accountValid(saved))) { socket.close(4401, 'Invalid session. Sign in again.'); return; }
          const previous = this.sockets().filter(other => other !== socket && this.attachment(other)?.playerId === saved.playerId)
            .sort((a, b) => this.attachment(a).connectedAt - this.attachment(b).connectedAt);
          for (const old of previous.slice(0, Math.max(0, previous.length - MAX_PLAYER_SOCKETS + 1))) old.close(4409, 'Session opened on another device.');
          attachment.playerId = saved.playerId; attachment.tokenHash = tokenHash; attachment.controlledId = saved.playerId;
          socket.serializeAttachment(attachment); await this.scheduleAlarm(); this.broadcast(); return;
        }
        const saved = this.savedFor(attachment);
        if (!saved || !(await this.accountValid(saved))) { socket.close(4401, 'Signed out. Sign in again.'); return; }
        if (message.type === 'view-as') {
          if (!room.game.testMode || attachment.playerId !== room.game.hostId) throw new ProtocolError('Seat switching is only available to the solo test host.', 403);
          if (!room.game.players.some(player => player.id === message.playerId)) throw new ProtocolError('Unknown seat.');
          attachment.controlledId = message.playerId; socket.serializeAttachment(attachment); this.snapshot(socket); return;
        }
        if (message.type !== 'action') throw new ProtocolError('Already authenticated.');
        actionId = message.id;
        if (saved.processedIds.includes(message.id)) { this.snapshot(socket, message.id); return; }
        await checkLimit(this.env.CONNECTION_LIMITER, `action:${room.game.roomId}:${attachment.playerId}`);
        const timed = advanceTime(room.game, Date.now(), secureRandom);
        if (timed !== room.game) { await this.commit({ ...room, game: timed, lastActivity: Date.now() }); this.broadcast(); room = this.requireRoom(); }
        if (message.version !== room.game.version && !['chat', 'vote'].includes(message.action.type)) {
          this.send(socket, { type: 'error', id: message.id, message: 'The game changed. Your board has been refreshed; please try that move again.' });
          this.snapshot(socket); return;
        }
        const actor = ['configure', 'start'].includes(message.action.type) ? attachment.playerId : this.actor(attachment);
        const game = applyAction(room.game, actor, message.action, secureRandom, Date.now(), { online: room.game.testMode ? room.game.players.map(p => p.id) : this.online() });
        const sessions = room.sessions.map(session => session.tokenHash === saved.tokenHash ? { ...session, processedIds: [...session.processedIds, message.id].slice(-64) } : session);
        await this.commit({ ...room, game, sessions, lastActivity: Date.now() }); this.broadcast(message.id, attachment.playerId);
      } catch (error) {
        const expected = error instanceof GameError || error instanceof ProtocolError;
        this.send(socket, { type: 'error', message: expected ? error.message : 'The server could not complete that move. Reconnect and try again.', ...(actionId ? { id: actionId } : {}) });
        if (!this.attachment(socket)?.playerId) socket.close(4401, 'Invalid authentication.');
        else if (error instanceof ProtocolError && error.status === 404) socket.close(4404, 'Room expired.');
        if (!expected) console.error('Room action failed unexpectedly.');
      }
    });
  }
  async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    await this.serial(async () => {
      try { socket.close(code === 1005 || code === 1006 ? 1000 : code); } catch { /* Already closed. */ }
      this.broadcast(); await this.scheduleAlarm();
    });
  }
  async webSocketError(socket: WebSocket): Promise<void> { await this.webSocketClose(socket, 1011); }
  async alarm(): Promise<void> {
    await this.serial(async () => {
      const now = Date.now();
      for (const socket of this.sockets()) {
        const attachment = this.attachment(socket);
        if (!attachment?.playerId && now - attachment.connectedAt >= AUTH_TIMEOUT_MS) socket.close(4401, 'Authentication timed out.');
        const saved = this.savedFor(attachment);
        if (saved?.account && saved.account.expiresAt <= now) socket.close(4401, 'Sign-in expired.');
      }
      if (this.record && now - this.record.lastActivity >= ROOM_LIFETIME_MS) {
        for (const socket of this.sockets()) socket.close(4404, 'Room expired after seven days without a move.');
        await this.ctx.storage.deleteAll(); this.record = undefined; return;
      }
      if (this.record) {
        const game = advanceTime(this.record.game, now, secureRandom);
        if (game !== this.record.game) { await this.commit({ ...this.record, game, lastActivity: now }); this.broadcast(); }
      }
      await this.scheduleAlarm();
    });
  }
}
