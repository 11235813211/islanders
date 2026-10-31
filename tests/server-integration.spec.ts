import { expect, test, type APIRequestContext } from '@playwright/test';
import WebSocket from 'ws';
import type { GameAction, GameView, ServerMessage, Session } from '../shared/types';

const server = 'http://127.0.0.1:8787';
const origin = 'http://127.0.0.1:5173';

class PlayerConnection {
  readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  closeCode: number | undefined;
  error: Error | undefined;
  pongs = 0;

  constructor(roomId: string) {
    this.socket = new WebSocket(`${server.replace('http:', 'ws:')}/api/rooms/${roomId}/socket`, { origin });
    this.socket.on('message', data => {
      if (data.toString() === 'pong') this.pongs++;
      else this.messages.push(JSON.parse(data.toString()) as ServerMessage);
    });
    this.socket.on('close', code => { this.closeCode = code; });
    this.socket.on('error', error => { this.error = error; });
  }

  async open() {
    await expect.poll(() => this.error ? 'error' : this.socket.readyState, { timeout: 10_000 }).toBe(WebSocket.OPEN);
  }

  async authenticate(session: Session) {
    await this.open();
    this.socket.send(JSON.stringify({ type: 'auth', token: session.token }));
    return this.waitState();
  }

  get state(): GameView {
    const message = [...this.messages].reverse().find(item => item.type === 'state');
    if (!message || message.type !== 'state') throw new Error('No state received.');
    return message.state;
  }

  async waitMessage(predicate: (message: ServerMessage) => boolean, after = 0): Promise<ServerMessage> {
    let found: ServerMessage | undefined;
    await expect.poll(() => {
      found = this.messages.slice(after).find(predicate);
      return !!found;
    }, { timeout: 10_000 }).toBe(true);
    return found!;
  }

  async waitState(version?: number): Promise<GameView> {
    const message = await this.waitMessage(item => item.type === 'state' && (version === undefined || item.state.version >= version));
    if (message.type !== 'state') throw new Error('Expected a state message.');
    return message.state;
  }

  send(action: GameAction, version = this.state.version, id = crypto.randomUUID()) {
    const after = this.messages.length;
    this.socket.send(JSON.stringify({ type: 'action', id, version, action }));
    return { id, after };
  }

  async action(action: GameAction): Promise<GameView> {
    const { id, after } = this.send(action);
    const message = await this.waitMessage(item => item.type === 'state' && item.acknowledgedId === id, after);
    if (message.type !== 'state') throw new Error('Expected an action acknowledgement.');
    return message.state;
  }

  dispose() { this.socket.close(); }
}

async function join(request: APIRequestContext, name: string, roomId?: string): Promise<Session> {
  const response = await request.post(`${server}/api/rooms${roomId ? `/${roomId}/join` : ''}`, { headers: { Origin: origin }, data: { name } });
  expect(response.status()).toBe(201);
  return response.json() as Promise<Session>;
}

function verifyPrivateView(state: GameView, playerId: string) {
  expect(state.selfId).toBe(playerId);
  expect(Object.keys(state.hand).sort()).toEqual(['brick', 'ore', 'sheep', 'wheat', 'wood']);
  expect(state.players.every(player => !('resources' in player) && !('token' in player))).toBe(true);
  expect('sessions' in state).toBe(false);
  expect('token' in state).toBe(false);
  // Exact stock counts would reveal an opponent's entire hand by subtraction in two-player rooms.
  expect(Object.values(state.bank).every(available => typeof available === 'boolean')).toBe(true);
  expect(state.players.find(player => player.id === playerId)?.resourceCount).toBe(Object.values(state.hand).reduce((total, count) => total + count, 0));
}

test('real room server enforces authority, serializes concurrent moves, and reconnects without replaying actions', async ({ request }) => {
  const hostSession = await join(request, 'Server host');
  const guestSession = await join(request, 'Server guest', hostSession.roomId);
  const connections: PlayerConnection[] = [];
  const connect = (session: Session) => {
    const connection = new PlayerConnection(session.roomId);
    connections.push(connection);
    return connection;
  };
  let host = connect(hostSession);
  const guest = connect(guestSession);
  try {
    await Promise.all([host.authenticate(hostSession), guest.authenticate(guestSession)]);
    expect(host.state.phase).toBe('lobby');
    expect(host.state.players).toHaveLength(2);
    verifyPrivateView(host.state, hostSession.playerId);
    verifyPrivateView(guest.state, guestSession.playerId);

    host.socket.send('ping');
    await expect.poll(() => host.pongs).toBe(1);
    const malformedAt = host.messages.length;
    const initialVersion = host.state.version;
    host.socket.send('{bad json');
    await host.waitMessage(message => message.type === 'error' && message.message === 'Invalid JSON.', malformedAt);
    const oversizedAt = host.messages.length;
    host.socket.send('x'.repeat(4097));
    await host.waitMessage(message => message.type === 'error' && message.message.includes('too large'), oversizedAt);
    expect(host.socket.readyState).toBe(WebSocket.OPEN);
    expect(host.state.version).toBe(initialVersion);

    // Authentication failures must never reveal the room snapshot.
    const forged = connect(hostSession);
    await forged.open();
    forged.socket.send(JSON.stringify({ type: 'auth', token: '0'.repeat(64) }));
    await expect.poll(() => forged.closeCode).toBe(4401);
    expect(forged.messages.some(message => message.type === 'state')).toBe(false);
    const unauthenticated = connect(hostSession);
    await unauthenticated.open();
    unauthenticated.socket.send(JSON.stringify({ type: 'action', id: 'no-auth', version: host.state.version, action: { type: 'start' } }));
    await expect.poll(() => unauthenticated.closeCode).toBe(4401);
    expect(unauthenticated.messages.some(message => message.type === 'state')).toBe(false);

    const lobbyVersion = host.state.version;
    const forgedActorId = crypto.randomUUID();
    guest.socket.send(JSON.stringify({ type: 'action', id: forgedActorId, version: lobbyVersion, playerId: hostSession.playerId, action: { type: 'start' } }));
    const deniedStart = await guest.waitMessage(message => message.type === 'error' && message.id === forgedActorId);
    expect(deniedStart.type === 'error' && deniedStart.message).toContain('host');
    expect(guest.state.version).toBe(lobbyVersion);

    const start = host.send({ type: 'start' });
    const started = await host.waitMessage(message => message.type === 'state' && message.acknowledgedId === start.id, start.after);
    expect(started.type === 'state' && started.state.phase).toBe('setup-settlement');
    await guest.waitState(lobbyVersion + 1);
    const repeatedStart = host.send({ type: 'start' }, lobbyVersion, start.id);
    const replay = await host.waitMessage(message => message.type === 'state' && message.acknowledgedId === start.id, repeatedStart.after);
    expect(replay.type === 'state' && replay.state.version).toBe(lobbyVersion + 1);

    const outOfTurn = guest.send({ type: 'place-settlement', vertexId: host.state.legal.settlements[0]! });
    const rejected = await guest.waitMessage(message => message.type === 'error' && message.id === outOfTurn.id, outOfTurn.after);
    expect(rejected.type === 'error' && rejected.message).toContain('turn');

    // Both commands arrive with the same version: exactly one can commit.
    const setupVersion = host.state.version;
    const placement = { type: 'place-settlement', vertexId: host.state.legal.settlements[0]! } as const;
    const first = host.send(placement, setupVersion);
    const second = host.send(placement, setupVersion);
    const accepted = await host.waitMessage(message => message.type === 'state' && message.acknowledgedId === first.id, first.after);
    const stale = await host.waitMessage(message => message.type === 'error' && message.id === second.id, second.after);
    expect(accepted.type === 'state' && accepted.state.version).toBe(setupVersion + 1);
    expect(stale.type === 'error' && stale.message).toContain('changed');
    expect(Object.keys(host.state.buildings)).toHaveLength(1);
    await guest.waitState(setupVersion + 1);

    // Play the complete setup using only the legal selections sent by the server.
    while (host.state.phase.startsWith('setup-')) {
      const actor = host.state.activePlayerId === hostSession.playerId ? host : guest;
      const view = actor.state;
      const action: GameAction = view.phase === 'setup-settlement'
        ? { type: 'place-settlement', vertexId: view.legal.settlements[0]! }
        : { type: 'place-road', edgeId: view.legal.roads[0]! };
      const next = await actor.action(action);
      await Promise.all([host.waitState(next.version), guest.waitState(next.version)]);
    }
    expect(host.state.phase).toBe('roll');
    expect(Object.keys(host.state.buildings)).toHaveLength(4);
    expect(Object.keys(host.state.roads)).toHaveLength(4);
    expect(host.state.players.every(player => player.points === 2)).toBe(true);
    verifyPrivateView(host.state, hostSession.playerId);
    verifyPrivateView(guest.state, guestSession.playerId);

    const rollVersion = host.state.version;
    const roll = host.send({ type: 'roll' });
    const rolled = await host.waitMessage(message => message.type === 'state' && message.acknowledgedId === roll.id, roll.after);
    if (rolled.type !== 'state') throw new Error('Expected dice result.');
    expect(rolled.state.dice?.every(die => Number.isInteger(die) && die >= 1 && die <= 6)).toBe(true);
    const dice = rolled.state.dice;
    const version = rolled.state.version;

    // The same saved session reclaims its seat; a lost acknowledgement cannot roll again.
    host.dispose();
    await expect.poll(() => host.closeCode).toBeDefined();
    host = connect(hostSession);
    await host.authenticate(hostSession);
    expect(host.state.version).toBe(version);
    expect(host.state.dice).toEqual(dice);
    verifyPrivateView(host.state, hostSession.playerId);
    const retriedRoll = host.send({ type: 'roll' }, rollVersion, roll.id);
    const retried = await host.waitMessage(message => message.type === 'state' && message.acknowledgedId === roll.id, retriedRoll.after);
    expect(retried.type === 'state' && retried.state.version).toBe(version);
    expect(retried.type === 'state' && retried.state.dice).toEqual(dice);

    // A real random seven must also be playable through to the next player's turn.
    if (host.state.phase === 'robber') {
      const victimHex = host.state.board.hexes.find(hex => host.state.legal.robberHexes.includes(hex.id)
        && hex.vertexIds.some(id => host.state.buildings[id]?.playerId === guestSession.playerId));
      await host.action({ type: 'move-robber', hexId: victimHex?.id ?? host.state.legal.robberHexes[0]! });
    }
    if (host.state.phase === 'steal') await host.action({ type: 'steal', playerId: host.state.legal.stealTargets[0]! });
    expect(host.state.phase).toBe('build');
    const nextTurn = await host.action({ type: 'end-turn' });
    await guest.waitState(nextTurn.version);
    expect(guest.state.phase).toBe('roll');
    expect(guest.state.activePlayerId).toBe(guestSession.playerId);
    const guestRoll = await guest.action({ type: 'roll' });
    await host.waitState(guestRoll.version);
    expect(host.state.dice).toEqual(guest.state.dice);

    // Newest tabs are retained deterministically; superseded clients receive a terminal code.
    const secondTab = connect(hostSession);
    await secondTab.authenticate(hostSession);
    const thirdTab = connect(hostSession);
    await thirdTab.authenticate(hostSession);
    const fourthTab = connect(hostSession);
    await fourthTab.authenticate(hostSession);
    const fifthTab = connect(hostSession);
    await fifthTab.authenticate(hostSession);
    await expect.poll(() => host.closeCode).toBe(4409);
    expect(secondTab.socket.readyState).toBe(WebSocket.OPEN);
    expect(thirdTab.state.version).toBe(guestRoll.version);

    const lateJoin = await request.post(`${server}/api/rooms/${hostSession.roomId}/join`, { headers: { Origin: origin }, data: { name: 'Late guest' } });
    expect(lateJoin.status()).toBe(409);
  } finally { connections.forEach(connection => connection.dispose()); }
});

test('HTTP boundary rejects foreign origins, invalid room names, and oversized input', async ({ request }) => {
  const health = await request.get(`${server}/api/health`);
  expect(health.ok()).toBe(true);
  const foreign = await request.post(`${server}/api/rooms`, { headers: { Origin: 'https://untrusted.example' }, data: { name: 'No access' } });
  expect(foreign.status()).toBe(403);
  const absent = await request.post(`${server}/api/rooms`, { data: { name: 'No origin' } });
  expect(absent.status()).toBe(403);
  const badCode = await request.post(`${server}/api/rooms/not-a-code/join`, { headers: { Origin: origin }, data: { name: 'Player' } });
  expect(badCode.status()).toBe(404);
  const large = await request.post(`${server}/api/rooms`, { headers: { Origin: origin }, data: { name: 'x'.repeat(3000) } });
  expect(large.status()).toBe(413);
  const invalidName = await request.post(`${server}/api/rooms`, { headers: { Origin: origin }, data: { name: '<script>' } });
  expect(invalidName.status()).toBe(400);
});

test('accounts reclaim seats across devices and logout revokes only the current login', async ({ request }) => {
  const username = `user_${Date.now().toString(36)}`;
  const password = 'Testing-only-password-492!';
  const credentials = { username, password };
  const signup = await request.post(`${server}/api/accounts/register`, { headers: { Origin: origin }, data: credentials });
  expect(signup.status(), await signup.text()).toBe(201);
  const first = await signup.json() as { username: string; token: string };
  const h1 = { Origin: origin, Authorization: `Bearer ${username}:${first.token}` };
  const bad = await request.post(`${server}/api/accounts/login`, { headers: { Origin: origin }, data: { username, password: 'Wrong-password-123' } });
  expect(bad.status()).toBe(401);
  const login = await request.post(`${server}/api/accounts/login`, { headers: { Origin: origin }, data: credentials });
  expect(login.status()).toBe(200);
  const second = await login.json() as { token: string };
  const h2 = { Origin: origin, Authorization: `Bearer ${username}:${second.token}` };
  const created = await request.post(`${server}/api/rooms`, { headers: h1, data: { name: 'ignored', playtest: true } });
  expect(created.status()).toBe(201);
  const session1 = await created.json() as Session;
  expect(session1.roomId).toMatch(/^[A-Z]{3,12}\d{2}$/);
  const one = new PlayerConnection(session1.roomId);
  const two = new PlayerConnection(session1.roomId);
  try {
    await one.authenticate(session1);
    expect(one.state.players).toHaveLength(3);
    await one.action({ type: 'configure', settings: { autoRollSeconds: 0, trackDice: true } });
    await one.action({ type: 'start' });
    const resumed = await request.post(`${server}/api/rooms/${session1.roomId}/join`, { headers: h2, data: {} });
    expect(resumed.status()).toBe(200);
    const session2 = await resumed.json() as Session;
    expect(session2.playerId).toBe(session1.playerId);
    await two.authenticate(session2);
    expect(two.state.phase).toBe('setup-settlement');
    expect(two.state.players).toHaveLength(3);
    const me = await request.get(`${server}/api/accounts/me`, { headers: h2 });
    expect((await me.json()).rooms).toContainEqual({ roomId: session1.roomId, playerId: session1.playerId });
    const logout = await request.post(`${server}/api/accounts/logout`, { headers: h1, data: {} });
    expect(logout.ok()).toBe(true);
    await expect.poll(() => one.closeCode).toBe(4401);
    expect((await request.get(`${server}/api/accounts/me`, { headers: h1 })).status()).toBe(401);
    expect((await request.get(`${server}/api/accounts/me`, { headers: h2 })).status()).toBe(200);
    const next = await two.action({ type: 'place-settlement', vertexId: two.state.legal.settlements[0]! });
    expect(next.phase).toBe('setup-road');
    // The oldest of eight device logins must stop receiving private room updates.
    for (let device = 0; device < 8; device++) {
      const additional = await request.post(`${server}/api/accounts/login`, { headers: { Origin: origin }, data: credentials });
      expect(additional.status()).toBe(200);
    }
    await expect.poll(() => two.closeCode).toBe(4401);
    expect((await request.get(`${server}/api/accounts/me`, { headers: h2 })).status()).toBe(401);
  } finally { one.dispose(); two.dispose(); }
});

test('solo rooms control all seats and auto-roll once on the durable deadline', async ({ request }) => {
  const response = await request.post(`${server}/api/rooms`, { headers: { Origin: origin }, data: { name: 'Solo tester', playtest: true } });
  const session = await response.json() as Session;
  const client = new PlayerConnection(session.roomId);
  try {
    await client.authenticate(session);
    await client.action({ type: 'configure', settings: { autoRollSeconds: 5, trackDice: true } });
    await client.action({ type: 'start' });
    while (client.state.phase.startsWith('setup')) {
      if (client.state.selfId !== client.state.activePlayerId) {
        const id = client.state.activePlayerId;
        client.socket.send(JSON.stringify({ type: 'view-as', playerId: id }));
        await expect.poll(() => client.state.selfId).toBe(id);
      }
      const state = client.state;
      await client.action(state.phase === 'setup-settlement' ? { type: 'place-settlement', vertexId: state.legal.settlements[0]! } : { type: 'place-road', edgeId: state.legal.roads[0]! });
    }
    const version = client.state.version;
    expect(client.state.rollDeadline).not.toBeNull();
    await expect.poll(() => client.state.phase, { timeout: 9000 }).not.toBe('roll');
    expect(client.state.version).toBe(version + 1);
    expect(Object.values(client.state.diceCounts).reduce((a, b) => a + b, 0)).toBe(1);
    expect(client.state.rollDeadline).toBeNull();
  } finally { client.dispose(); }
});
