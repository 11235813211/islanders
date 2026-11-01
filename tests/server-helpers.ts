import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import WebSocket from 'ws';
import type { GameAction, GameView, ServerMessage, Session } from '../shared/types';

export const server = 'http://127.0.0.1:8787';
export const origin = 'http://127.0.0.1:5173';

export class PlayerConnection {
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

export async function join(request: APIRequestContext, name: string, roomId?: string): Promise<Session> {
  let response: APIResponse;
  // Suites share the real local IP limit. Retry only explicit rate rejections, never successful mutations.
  await expect.poll(async () => {
    response = await request.post(`${server}/api/rooms${roomId ? `/${roomId}/join` : ''}`, { headers: { Origin: origin }, data: { name } });
    return response.status();
  }, { timeout: 65_000, intervals: [1000, 2000, 5000] }).not.toBe(429);
  expect(response!.status()).toBe(201);
  return response!.json() as Promise<Session>;
}

export function verifyPrivateView(state: GameView, playerId: string) {
  expect(state.selfId).toBe(playerId);
  expect(Object.keys(state.hand).sort()).toEqual(['brick', 'ore', 'sheep', 'wheat', 'wood']);
  expect(state.players.every(player => !('resources' in player) && !('token' in player))).toBe(true);
  expect('sessions' in state).toBe(false);
  expect('token' in state).toBe(false);
  // Exact stock counts would reveal an opponent's entire hand by subtraction in two-player rooms.
  expect(Object.values(state.bank).every(available => typeof available === 'boolean')).toBe(true);
  expect(state.players.find(player => player.id === playerId)?.resourceCount).toBe(Object.values(state.hand).reduce((total, count) => total + count, 0));
}

