import type { AccountRoomStatus } from '../shared/types';
import type { AccountIdentity, Revoked } from './accounts';
import { accountStub, canPlaytest, checkLimit, type Env, failure, json, logError, roomStub } from './env';
import {
  hashToken,
  originAllowed,
  ProtocolError,
  parseAuthorization,
  parseCredentials,
  parseOptionalName,
  parsePassword,
  parseRecovery,
  ROOM_PATTERN,
  readBody,
  record,
  roomCode,
} from './protocol';

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

/** End the given login sessions in every room they joined. */
async function revokeInRooms(env: Env, username: string, revoked: Revoked): Promise<void> {
  await Promise.all(
    revoked.rooms.flatMap(room => revoked.hashes.map(hash => roomStub(env, room.roomId).revoke(username, hash))),
  );
}

/** "My rooms" with live status; rooms that closed or that the player left are dropped. */
async function roomStatuses(env: Env, identity: AccountIdentity, rooms: { roomId: string; playerId: string }[]) {
  // RPC results are disposable stubs; copy them into plain objects.
  const results: (AccountRoomStatus | null)[] = await Promise.all(
    rooms.map(async room => {
      try {
        const status = await roomStub(env, room.roomId).status(room.playerId);
        return status ? { ...status, players: [...status.players] } : null;
      } catch {
        return null;
      }
    }),
  );
  const gone = rooms.filter((_, i) => !results[i]).map(room => room.roomId);
  if (gone.length) await accountStub(env, identity.username).forget(gone);
  return results.filter((status): status is AccountRoomStatus => !!status);
}

async function handleAccounts(operation: string, request: Request, env: Env, requester: string): Promise<Response> {
  const method = operation === 'me' ? 'GET' : 'POST';
  if (request.method !== method) throw new ProtocolError(`Use ${method} for this endpoint.`, 405);

  if (operation === 'register' || operation === 'login' || operation === 'recover') {
    await checkLimit(env.AUTH_LIMITER, `ip:${requester}`);
    const body = await readBody(request);
    if (operation === 'recover') {
      const input = parseRecovery(body);
      await checkLimit(env.AUTH_LIMITER, `account:${input.username}`);
      const result = await accountStub(env, input.username).recover(input.code, input.password);
      if (!result.ok) return json({ error: result.error }, result.status);
      if (result.revoked) await revokeInRooms(env, input.username, result.revoked);
      return json({ ...result.session, recoveryCode: result.recoveryCode });
    }
    const input = parseCredentials(body);
    await checkLimit(env.AUTH_LIMITER, `account:${input.username}`);
    const result = await accountStub(env, input.username).authenticate(
      input.username,
      input.password,
      operation === 'register',
    );
    if (!result.ok) return json({ error: result.error }, result.status);
    if (result.revoked) await revokeInRooms(env, input.username, result.revoked);
    return json(
      { ...result.session, ...(result.recoveryCode ? { recoveryCode: result.recoveryCode } : {}) },
      operation === 'register' ? 201 : 200,
    );
  }

  await checkLimit(env.CONNECTION_LIMITER, `account:${requester}`);
  const identity = (await accountFor(request, env, true))!;
  const stub = accountStub(env, identity.username);
  switch (operation) {
    case 'me': {
      const current = await stub.current(identity.sessionHash);
      if (!current) throw new ProtocolError('Sign in again to continue.', 401);
      return json({
        username: identity.username,
        rooms: await roomStatuses(env, identity, current.rooms),
        playtest: canPlaytest(env, identity),
        hasRecoveryCode: current.hasRecoveryCode,
      });
    }
    case 'recovery-code': {
      await checkLimit(env.AUTH_LIMITER, `account:${identity.username}`);
      const result = await stub.replaceRecoveryCode(identity.sessionHash, parsePassword(await readBody(request)));
      return result.ok ? json({ recoveryCode: result.recoveryCode }) : json({ error: result.error }, result.status);
    }
    case 'delete': {
      await checkLimit(env.AUTH_LIMITER, `account:${identity.username}`);
      const result = await stub.deleteAccount(identity.sessionHash, parsePassword(await readBody(request)));
      if (!result.ok) return json({ error: result.error }, result.status);
      await revokeInRooms(env, identity.username, result);
      return json({ ok: true });
    }
    default: {
      // logout
      const removed = await stub.logout(identity.sessionHash);
      if (removed)
        await revokeInRooms(env, identity.username, { hashes: [identity.sessionHash], rooms: removed.rooms });
      return json({ ok: true });
    }
  }
}

/** Browser errors reported by the client, logged so they show up in Workers Observability. */
async function handleClientError(request: Request, env: Env, requester: string): Promise<Response> {
  await checkLimit(env.CONNECTION_LIMITER, `client-error:${requester}`);
  const body = await readBody(request);
  if (!record(body)) throw new ProtocolError('Invalid report.');
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : undefined);
  console.error(
    JSON.stringify({
      level: 'error',
      where: 'client',
      message: text(body.message, 300),
      stack: text(body.stack, 1200),
      page: text(body.page, 200),
    }),
  );
  return new Response(null, { status: 204 });
}

async function handleRooms(url: URL, request: Request, env: Env): Promise<Response> {
  if (url.pathname === '/api/rooms' && request.method === 'POST') {
    const body = await readBody(request);
    const identity = await accountFor(request, env);
    const name = identity?.username ?? parseOptionalName(body);
    if (!record(body)) throw new ProtocolError('Invalid room request.');
    if (body.playtest !== undefined && typeof body.playtest !== 'boolean')
      throw new ProtocolError('Invalid playtest setting.');
    if (body.playtest === true && !canPlaytest(env, identity))
      throw new ProtocolError('Solo test rooms are not available on this account.', 403);
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = roomCode();
      const response = await roomStub(env, code).fetch(
        new Request(`https://room.internal/create/${code}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, identity, playtest: body.playtest === true }),
        }),
      );
      if (response.status !== 409) return response;
    }
    throw new ProtocolError('Could not allocate a room. Try again.', 503);
  }
  const match = /^\/api\/rooms\/([^/]+)\/(join|socket)$/.exec(url.pathname);
  const code = match?.[1]?.toUpperCase();
  if (!match || !code || !ROOM_PATTERN.test(code))
    throw new ProtocolError('Room not found. Check the word and two-digit code.', 404);
  const operation = match[2]!;
  const method = operation === 'join' ? 'POST' : 'GET';
  if (request.method !== method) throw new ProtocolError(`Use ${method} for this endpoint.`, 405);
  const stub = roomStub(env, code);
  if (operation === 'join') {
    const body = await readBody(request);
    const identity = await accountFor(request, env);
    const name = identity?.username ?? parseOptionalName(body);
    return stub.fetch(
      new Request('https://room.internal/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          identity,
          spectate: record(body) && body.spectate === true,
          autoSpectate: record(body) && body.autoSpectate === true,
        }),
      }),
    );
  }
  const internal = new URL(request.url);
  internal.pathname = '/socket';
  internal.search = '';
  return stub.fetch(new Request(internal, request));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (url.pathname === '/api/health' && request.method === 'GET')
      return json({ ok: true, service: 'islanders', protocol: 3 });
    const origin = request.headers.get('Origin');
    // Same-origin GET fetches can omit Origin; /me still requires its bearer credential.
    const readAccount = request.method === 'GET' && url.pathname === '/api/accounts/me' && !origin;
    if (!readAccount && !originAllowed(origin, env.ALLOWED_ORIGINS || '', url.origin, env.DEV_MODE === 'true'))
      return json({ error: 'This origin is not allowed.' }, 403);
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin);
    const requester = request.headers.get('CF-Connecting-IP') ?? 'local-development';
    let response: Response;
    try {
      const accountMatch = /^\/api\/accounts\/(register|login|me|logout|recover|recovery-code|delete)$/.exec(
        url.pathname,
      );
      if (accountMatch) response = await handleAccounts(accountMatch[1]!, request, env, requester);
      else if (url.pathname === '/api/client-errors' && request.method === 'POST')
        response = await handleClientError(request, env, requester);
      else {
        await checkLimit(
          url.pathname === '/api/rooms' ? env.ROOM_CREATION_LIMITER : env.CONNECTION_LIMITER,
          `http:${requester}`,
        );
        response = await handleRooms(url, request, env);
      }
    } catch (error) {
      response = failure(error);
    }
    if (response.status >= 500)
      logError('response', new Error(`${request.method} ${url.pathname} → ${response.status}`));
    return cors(response, origin);
  },
} satisfies ExportedHandler<Env>;
