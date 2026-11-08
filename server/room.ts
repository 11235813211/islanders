import { DurableObject } from 'cloudflare:workers';
import {
  addPlayer,
  addSpectator,
  advanceTime,
  applyAction,
  botDueAt,
  createGame,
  GameError,
  getActivePlayerId,
  getView,
  idlePause,
  idleResume,
  MAX_PLAYERS,
  normalizeGame,
} from '../shared/engine';
import type { BoardDesign } from '../shared/maps';
import { emptyRoomMs, guestName } from '../shared/settings';
import type { AccountRoomStatus, GameAction, GameState, ServerMessage, Session } from '../shared/types';
import type { AccountIdentity } from './accounts';
import { accountStub, checkLimit, type Env, failure, json, libraryStub, logError } from './env';
import {
  AUTH_TIMEOUT_MS,
  hashToken,
  ProtocolError,
  parseMessage,
  parseOptionalName,
  ROOM_PATTERN,
  randomToken,
  readBody,
  secureRandom,
} from './protocol';

interface AccountBinding {
  username: string;
  sessionHash: string;
  expiresAt: number;
}
interface SavedSession {
  playerId: string;
  tokenHash: string;
  processedIds: string[];
  account?: AccountBinding;
  createdAt?: number;
}
interface RoomRecord {
  schema: 1;
  game: GameState;
  sessions: SavedSession[];
  lastActivity: number;
  /** When the last human player disconnected. The game pauses after IDLE_GRACE_MS and the room closes after EMPTY_ROOM_MS. */
  emptySince?: number;
}
interface Attachment {
  playerId: string | null;
  tokenHash?: string;
  controlledId?: string;
  connectedAt: number;
  windowStart: number;
  messageCount: number;
}

const MAX_SOCKETS = 40;
const MAX_PLAYER_SOCKETS = 4;
const MAX_MESSAGES_PER_MINUTE = 90;
/** A reload or brief drop shouldn't pause the game, so wait this long first. */
const IDLE_GRACE_MS = 60_000;
/** Close code the client treats as "you're no longer in this room". */
const LEFT_ROOM = 4000;
/** Lobby actions act for the connected person, not the solo-test seat they're viewing. */
const SELF_ACTIONS = new Set<GameAction['type']>([
  'switch-role',
  'configure',
  'start',
  'choose-color',
  'leave',
  'remove-player',
  'transfer-host',
  'add-bot',
  'set-bot-level',
  'play-again',
  'choose-map',
]);

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

  // ---- helpers ----

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private attachment(socket: WebSocket): Attachment {
    return socket.deserializeAttachment() as Attachment;
  }
  private sockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter(socket => socket.readyState === 1);
  }
  /** Connected members (players and spectators). */
  private online(): string[] {
    return [
      ...new Set(
        this.sockets()
          .map(socket => this.attachment(socket)?.playerId)
          .filter((id): id is string => !!id),
      ),
    ];
  }
  private onlinePlayers(game: GameState): string[] {
    const online = this.online();
    return game.players.filter(p => !p.bot && online.includes(p.id)).map(p => p.id);
  }
  private send(socket: WebSocket, message: ServerMessage): void {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      /* Reconnection reads the durable snapshot. */
    }
  }
  private savedFor(attachment: Attachment): SavedSession | undefined {
    return this.record?.sessions.find(session =>
      attachment.tokenHash ? session.tokenHash === attachment.tokenHash : session.playerId === attachment.playerId,
    );
  }
  private actor(attachment: Attachment): string {
    return this.record?.game.testMode && attachment.playerId === this.record.game.hostId
      ? (attachment.controlledId ?? attachment.playerId)
      : attachment.playerId!;
  }
  private snapshot(socket: WebSocket, acknowledgedId?: string): void {
    const attachment = this.attachment(socket);
    if (!attachment?.playerId || !this.record) return;
    const saved = this.savedFor(attachment);
    if (!saved || (saved.account && saved.account.expiresAt <= Date.now())) {
      socket.close(4401, 'Sign in again to continue.');
      return;
    }
    let state: ReturnType<typeof getView>;
    try {
      state = getView(this.record.game, this.actor(attachment));
    } catch {
      socket.close(LEFT_ROOM, 'You are no longer in this room.');
      return;
    }
    this.send(socket, { type: 'state', state, online: this.online(), ...(acknowledgedId ? { acknowledgedId } : {}) });
  }
  private broadcast(acknowledgedId?: string, actor?: string): void {
    for (const socket of this.sockets())
      this.snapshot(socket, this.attachment(socket)?.playerId === actor ? acknowledgedId : undefined);
  }
  private async commit(next: RoomRecord): Promise<void> {
    await this.ctx.storage.put('room', next);
    this.record = next;
    await this.scheduleAlarm();
  }
  private async scheduleAlarm(): Promise<void> {
    const deadlines = this.sockets()
      .filter(socket => !this.attachment(socket)?.playerId)
      .map(socket => this.attachment(socket).connectedAt + AUTH_TIMEOUT_MS);
    if (this.record) {
      const game = this.record.game;
      if (!this.onlinePlayers(game).length) deadlines.push(this.closesAt(this.record));
      // Only a future pause deadline: once it passes, the alarm below has paused the game (or there was nothing to pause).
      const pauseAt = (this.record.emptySince ?? Number.NEGATIVE_INFINITY) + IDLE_GRACE_MS;
      if (pauseAt > Date.now()) deadlines.push(pauseAt);
      if (game.proposal) deadlines.push(game.proposal.expiresAt);
      if (game.pausedAt === null) {
        if (game.phase === 'roll' && game.rollDeadline !== null) deadlines.push(game.rollDeadline);
        if (game.turnDeadline !== null) deadlines.push(game.turnDeadline);
        if (game.tradeOffer) deadlines.push(game.tradeOffer.expiresAt);
        const bot = botDueAt(game);
        if (bot !== null) deadlines.push(bot);
      }
      for (const socket of this.sockets()) {
        const saved = this.savedFor(this.attachment(socket));
        if (saved?.account) deadlines.push(saved.account.expiresAt);
      }
    }
    if (deadlines.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...deadlines)));
    else await this.ctx.storage.deleteAlarm();
  }
  /** When an empty room closes (later for a game against bots). A room nobody has connected to yet counts from its last join or move. */
  private closesAt(room: RoomRecord): number {
    return (room.emptySince ?? room.lastActivity) + emptyRoomMs(room.game);
  }
  private expired(room: RoomRecord, now = Date.now()): boolean {
    return now >= this.closesAt(room) && !this.onlinePlayers(room.game).length;
  }
  private requireRoom(): RoomRecord {
    if (!this.record || this.expired(this.record))
      throw new ProtocolError('This room does not exist or has expired.', 404);
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
    const saved: SavedSession = {
      playerId,
      tokenHash: await hashToken(token),
      processedIds: [],
      createdAt: Date.now(),
      ...(identity
        ? { account: { username: identity.username, sessionHash: identity.sessionHash, expiresAt: identity.expiresAt } }
        : {}),
    };
    const otherSessions = room.sessions.filter(candidate => candidate.playerId !== playerId);
    const ownSessions = room.sessions.filter(candidate => candidate.playerId === playerId).slice(-11);
    await this.commit({ ...room, sessions: [...otherSessions, ...ownSessions, saved], lastActivity: Date.now() });
    if (identity)
      await accountStub(this.env, identity.username).remember(identity.sessionHash, {
        roomId: session.roomId,
        playerId,
      });
    return session;
  }

  /** Close the room for everyone and delete its storage. */
  private async destroy(reason: string): Promise<void> {
    for (const socket of this.sockets()) socket.close(4404, reason);
    await this.ctx.storage.deleteAll();
    this.record = undefined;
  }

  /** A person left or was removed: end their sessions, close their sockets, and forget the room on their account. */
  private async dropMember(room: RoomRecord, playerId: string, reason: string): Promise<RoomRecord> {
    const gone = room.sessions.filter(s => s.playerId === playerId);
    for (const socket of this.sockets())
      if (this.attachment(socket)?.playerId === playerId) socket.close(LEFT_ROOM, reason);
    await Promise.all(
      [...new Set(gone.flatMap(s => (s.account ? [s.account.username] : [])))].map(username =>
        accountStub(this.env, username).forget([room.game.roomId]),
      ),
    );
    return { ...room, sessions: room.sessions.filter(s => s.playerId !== playerId) };
  }

  /** The library's design for a map id (null for the standard island or an unknown id). */
  private async design(mapId: string): Promise<BoardDesign | undefined> {
    if (mapId === 'base') return undefined;
    const design = await libraryStub(this.env).board(mapId);
    return design ? structuredClone(design) : undefined;
  }

  // ---- RPC ----

  async revoke(username: string, sessionHash: string): Promise<void> {
    await this.serial(async () => {
      if (!this.record) return;
      const revoked = new Set(
        this.record.sessions
          .filter(session => session.account?.username === username && session.account.sessionHash === sessionHash)
          .map(session => session.tokenHash),
      );
      await this.commit({
        ...this.record,
        sessions: this.record.sessions.filter(session => !revoked.has(session.tokenHash)),
      });
      for (const socket of this.sockets())
        if (revoked.has(this.attachment(socket)?.tokenHash ?? '')) socket.close(4401, 'Signed out on this device.');
      this.broadcast();
    });
  }

  /** Summary for "My rooms", or null if the room is gone or this player is no longer in it. */
  async status(playerId: string): Promise<AccountRoomStatus | null> {
    return this.serial(async () => {
      if (!this.record) return null;
      // Rooms saved under older, longer lifetimes close here as soon as someone's room list checks them.
      if (this.expired(this.record)) {
        await this.destroy('This room closed because no players were connected.');
        return null;
      }
      const game = this.record.game;
      const seat = game.players.find(p => p.id === playerId);
      if ((!seat || seat.bot) && !game.spectators.some(s => s.id === playerId)) return null;
      return {
        roomId: game.roomId,
        playerId,
        phase: game.phase,
        players: game.players.map(p => p.name),
        yourTurn: getActivePlayerId(game) === playerId || (game.pendingDiscards[playerId] ?? 0) > 0,
        winner: game.players.find(p => p.id === game.winnerId)?.name ?? null,
      };
    });
  }

  // ---- HTTP (create, join, socket upgrade) ----

  async fetch(request: Request): Promise<Response> {
    return this.serial(async () => {
      try {
        const path = new URL(request.url).pathname;
        const create = /^\/create\/([^/]+)$/.exec(path);
        if (create && ROOM_PATTERN.test(create[1]!) && request.method === 'POST') {
          if (this.record) throw new ProtocolError('Room already exists.', 409);
          const body = (await readBody(request)) as {
            name: string | null;
            identity?: AccountIdentity | null;
            playtest?: boolean;
            mapId?: string;
          };
          const name = parseOptionalName(body) ?? guestName([], secureRandom);
          const identity = body.identity;
          const playerId = identity?.playerId ?? crypto.randomUUID();
          let game = addPlayer(
            createGame(create[1]!, secureRandom, { testMode: body.playtest === true, now: Date.now() }),
            {
              id: playerId,
              name,
            },
          );
          if (body.playtest) {
            for (let seat = 0; seat < 2; seat++)
              game = addPlayer(game, {
                id: crypto.randomUUID(),
                name: guestName(
                  game.players.map(p => p.name),
                  secureRandom,
                ),
              });
          }
          if (body.mapId) {
            const design = await this.design(body.mapId);
            if (design)
              game = applyAction(game, playerId, { type: 'choose-map', mapId: design.id }, secureRandom, Date.now(), {
                design,
              });
          }
          const session = await this.issueSession(
            { schema: 1, game, sessions: [], lastActivity: Date.now() },
            playerId,
            identity,
          );
          return json(session, 201);
        }
        if (path === '/join' && request.method === 'POST') {
          const room = this.requireRoom();
          const body = (await readBody(request)) as {
            name: string | null;
            identity?: AccountIdentity | null;
            spectate?: boolean;
            autoSpectate?: boolean;
          };
          const name =
            parseOptionalName(body) ??
            guestName(
              [...room.game.players, ...room.game.spectators].map(p => p.name),
              secureRandom,
            );
          const identity = body.identity;
          const existing =
            identity && [...room.game.players, ...room.game.spectators].find(player => player.id === identity.playerId);
          if (
            body.autoSpectate &&
            (room.game.testMode || room.game.phase !== 'lobby' || room.game.players.length >= MAX_PLAYERS)
          )
            body.spectate = true;
          if (!existing && room.game.testMode && !body.spectate)
            throw new ProtocolError('This is a solo test room. Join as a spectator or create a multiplayer room.', 409);
          const playerId = existing?.id ?? identity?.playerId ?? crypto.randomUUID();
          let game = existing
            ? room.game
            : body.spectate
              ? addSpectator(room.game, { id: playerId, name })
              : addPlayer(room.game, { id: playerId, name });
          if (
            existing &&
            !body.spectate &&
            game.phase === 'lobby' &&
            !game.testMode &&
            game.spectators.some(p => p.id === playerId)
          ) {
            game = addPlayer(game, { id: playerId, name });
            game.spectators = game.spectators.filter(p => p.id !== playerId);
          }
          const session = await this.issueSession({ ...room, game }, playerId, identity);
          this.broadcast();
          return json(session, existing ? 200 : 201);
        }
        if (path === '/socket' && request.method === 'GET') {
          this.requireRoom();
          if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
            throw new ProtocolError('A WebSocket connection is required.', 426);
          if (this.sockets().length >= MAX_SOCKETS)
            throw new ProtocolError('Too many connections. Try again shortly.', 429);
          const pair = new WebSocketPair();
          const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
          this.ctx.acceptWebSocket(server);
          server.serializeAttachment({
            playerId: null,
            connectedAt: Date.now(),
            windowStart: Date.now(),
            messageCount: 0,
          } satisfies Attachment);
          await this.scheduleAlarm();
          return new Response(null, { status: 101, webSocket: client });
        }
        throw new ProtocolError('Not found.', 404);
      } catch (error) {
        return failure(error);
      }
    });
  }

  // ---- WebSocket ----

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.serial(async () => {
      let actionId: string | undefined;
      try {
        const attachment = this.attachment(socket);
        if (!attachment) {
          socket.close(4401, 'Authentication required.');
          return;
        }
        if (Date.now() - attachment.windowStart >= 60_000) {
          attachment.windowStart = Date.now();
          attachment.messageCount = 0;
        }
        attachment.messageCount++;
        socket.serializeAttachment(attachment);
        if (attachment.messageCount > MAX_MESSAGES_PER_MINUTE) {
          socket.close(4429, 'Too many messages.');
          return;
        }
        const message = parseMessage(raw);
        let room = this.requireRoom();
        if (!attachment.playerId) {
          await this.authenticate(socket, attachment, message, room);
          return;
        }
        const saved = this.savedFor(attachment);
        if (!saved || !(await this.accountValid(saved))) {
          socket.close(4401, 'Signed out. Sign in again.');
          return;
        }
        if (message.type === 'view-as') {
          if (!room.game.testMode || attachment.playerId !== room.game.hostId)
            throw new ProtocolError('Seat switching is only available to the solo test host.', 403);
          if (!room.game.players.some(player => player.id === message.playerId))
            throw new ProtocolError('Unknown seat.');
          attachment.controlledId = message.playerId;
          socket.serializeAttachment(attachment);
          this.snapshot(socket);
          return;
        }
        if (message.type !== 'action') throw new ProtocolError('Already authenticated.');
        actionId = message.id;
        if (saved.processedIds.includes(message.id)) {
          this.snapshot(socket, message.id);
          return;
        }
        await checkLimit(this.env.CONNECTION_LIMITER, `action:${room.game.roomId}:${attachment.playerId}`);
        const timed = advanceTime(room.game, Date.now(), secureRandom);
        if (timed !== room.game) {
          await this.commit({ ...room, game: timed, lastActivity: Date.now() });
          this.broadcast();
          room = this.requireRoom();
        }
        if (message.version !== room.game.version && !['chat', 'vote'].includes(message.action.type)) {
          this.send(socket, {
            type: 'error',
            id: message.id,
            message: 'The game changed. Your board has been refreshed; please try that move again.',
          });
          this.snapshot(socket);
          return;
        }
        const action = message.action;
        const actor = SELF_ACTIONS.has(action.type) ? attachment.playerId : this.actor(attachment);
        const design = action.type === 'choose-map' ? await this.design(action.mapId) : undefined;
        const game = applyAction(room.game, actor, action, secureRandom, Date.now(), {
          online: room.game.testMode ? room.game.players.map(p => p.id) : this.online(),
          design,
        });
        const sessions = room.sessions.map(session =>
          session.tokenHash === saved.tokenHash
            ? { ...session, processedIds: [...session.processedIds, message.id].slice(-64) }
            : session,
        );
        let next: RoomRecord = { ...room, game, sessions, lastActivity: Date.now() };
        if (action.type === 'leave') next = await this.dropMember(next, attachment.playerId, 'You left the room.');
        if (action.type === 'remove-player')
          next = await this.dropMember(next, action.playerId, 'The host removed you from the room.');
        if (!next.game.players.some(p => !p.bot)) {
          await this.destroy('Everyone left, so the room closed.');
          return;
        }
        await this.commit(next);
        this.broadcast(message.id, attachment.playerId);
      } catch (error) {
        const expected = error instanceof GameError || error instanceof ProtocolError;
        this.send(socket, {
          type: 'error',
          message: expected ? error.message : 'The server could not complete that move. Reconnect and try again.',
          ...(actionId ? { id: actionId } : {}),
        });
        if (!this.attachment(socket)?.playerId) socket.close(4401, 'Invalid authentication.');
        else if (error instanceof ProtocolError && error.status === 404) socket.close(4404, 'Room expired.');
        if (!expected) logError('room action', error);
      }
    });
  }

  private async authenticate(
    socket: WebSocket,
    attachment: Attachment,
    message: ReturnType<typeof parseMessage>,
    room: RoomRecord,
  ): Promise<void> {
    if (message.type !== 'auth' || Date.now() - attachment.connectedAt > AUTH_TIMEOUT_MS) {
      socket.close(4401, 'Authenticate before sending actions.');
      return;
    }
    const tokenHash = await hashToken(message.token);
    const saved = room.sessions.find(session => session.tokenHash === tokenHash);
    if (!saved || !(await this.accountValid(saved))) {
      socket.close(4401, 'Invalid session. Sign in again.');
      return;
    }
    const previous = this.sockets()
      .filter(other => other !== socket && this.attachment(other)?.playerId === saved.playerId)
      .sort((a, b) => this.attachment(a).connectedAt - this.attachment(b).connectedAt);
    for (const old of previous.slice(0, Math.max(0, previous.length - MAX_PLAYER_SOCKETS + 1)))
      old.close(4409, 'Session opened on another device.');
    attachment.playerId = saved.playerId;
    attachment.tokenHash = tokenHash;
    attachment.controlledId = saved.playerId;
    socket.serializeAttachment(attachment);
    // Someone is back: cancel a pending idle pause, or resume one that already started.
    if (room.game.players.some(p => p.id === saved.playerId && !p.bot)) {
      const game = idleResume(room.game, Date.now());
      if (game !== room.game || room.emptySince !== undefined)
        await this.commit({ ...room, game, emptySince: undefined });
    }
    await this.scheduleAlarm();
    this.broadcast();
  }

  async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    await this.serial(async () => {
      try {
        socket.close(code === 1005 || code === 1006 ? 1000 : code);
      } catch {
        /* Already closed. */
      }
      if (this.record && !this.onlinePlayers(this.record.game).length && this.record.emptySince === undefined)
        await this.commit({ ...this.record, emptySince: Date.now() });
      this.broadcast();
      await this.scheduleAlarm();
    });
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket, 1011);
  }

  async alarm(): Promise<void> {
    await this.serial(async () => {
      const now = Date.now();
      for (const socket of this.sockets()) {
        const attachment = this.attachment(socket);
        if (!attachment?.playerId && now - attachment.connectedAt >= AUTH_TIMEOUT_MS)
          socket.close(4401, 'Authentication timed out.');
        const saved = this.savedFor(attachment);
        if (saved?.account && saved.account.expiresAt <= now) socket.close(4401, 'Sign-in expired.');
      }
      if (this.record && this.expired(this.record, now)) {
        await this.destroy('This room closed because no players were connected.');
        return;
      }
      if (this.record) {
        let record = this.record;
        if (
          record.emptySince !== undefined &&
          now - record.emptySince >= IDLE_GRACE_MS &&
          !this.onlinePlayers(record.game).length
        ) {
          record = { ...record, game: idlePause(record.game, now) };
        }
        try {
          const game = advanceTime(record.game, now, secureRandom);
          // Bot and timer moves don't count as activity, so abandoned rooms still expire.
          if (game !== record.game) record = { ...record, game };
        } catch (error) {
          // Back off instead of retrying the same overdue deadline in a tight loop.
          logError('alarm', error);
          if (record !== this.record) await this.ctx.storage.put('room', record);
          this.record = record;
          this.broadcast();
          await this.ctx.storage.setAlarm(now + 30_000);
          return;
        }
        if (record !== this.record) {
          await this.commit(record);
          this.broadcast();
        }
      }
      await this.scheduleAlarm();
    });
  }
}
