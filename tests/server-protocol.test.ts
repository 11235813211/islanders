import { describe, expect, it } from 'vitest';
import {
  hashToken,
  originAllowed,
  parseMessage,
  parseName,
  ROOM_PATTERN,
  randomToken,
  readBody,
  roomCode,
  validateAction,
} from '../server/protocol';

describe('public protocol boundary', () => {
  it('only accepts exact configured origins, including ports', () => {
    const origins = 'https://example.github.io, http://localhost:5173';
    expect(originAllowed('https://example.github.io', origins)).toBe(true);
    expect(originAllowed('http://localhost:5173', origins)).toBe(true);
    for (const invalid of [
      null,
      'null',
      '',
      'https://example.github.io.evil.test',
      'https://example.github.io/',
      'http://localhost:5174',
      'http://example.github.io',
    ]) {
      expect(originAllowed(invalid, origins)).toBe(false);
    }
  });

  it('normalizes readable player names without accepting markup or invisible controls', () => {
    expect(parseName({ name: '  Alex    Smith  ' })).toBe('Alex Smith');
    expect(parseName({ name: ' Zoë ' })).toBe('Zoë');
    for (const name of ['', ' '.repeat(8), 'x'.repeat(25), '<script>', 'Alex\u200B', 'A\u0000B']) {
      expect(() => parseName({ name })).toThrow();
    }
    for (const value of [null, [], 'Alex', {}, { name: 1 }]) expect(() => parseName(value)).toThrow();
  });

  it('requires authenticated messages and strict versioned command envelopes', () => {
    const token = 'a'.repeat(64);
    expect(parseMessage(JSON.stringify({ type: 'auth', token }))).toEqual({ type: 'auth', token });
    const valid = { type: 'action', id: 'abc-123', version: 3, action: { type: 'roll' } };
    expect(parseMessage(JSON.stringify(valid))).toEqual(valid);
    for (const version of [-1, 0.5, '3', null, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => parseMessage(JSON.stringify({ ...valid, version }))).toThrow();
    }
    for (const id of ['', 'x'.repeat(101), {}, '<html>']) {
      expect(() => parseMessage(JSON.stringify({ ...valid, id }))).toThrow();
    }
    for (const raw of [
      'null',
      '[]',
      '{}',
      'garbage',
      JSON.stringify({ type: 'auth', token: 'short' }),
      ' '.repeat(4097),
    ]) {
      expect(() => parseMessage(raw)).toThrow();
    }
    expect(() => parseMessage(new ArrayBuffer(1))).toThrow();
  });

  it('projects commands to allowed fields instead of forwarding forged identity/state', () => {
    expect(
      validateAction({ type: 'build-road', edgeId: 'e2', playerId: 'victim', resources: { ore: 999 }, version: 1 }),
    ).toEqual({ type: 'build-road', edgeId: 'e2' });
    expect(validateAction({ type: 'trade', give: 'ore', receive: 'wood' })).toEqual({
      type: 'trade',
      give: 'ore',
      receive: 'wood',
    });
    for (const value of [
      null,
      [],
      { type: 'give-resources' },
      { type: 'trade', give: '__proto__', receive: 'wood' },
      { type: 'build-road', edgeId: 2 },
    ]) {
      expect(() => validateAction(value)).toThrow();
    }
  });

  it('requires complete bounded integer discard bags', () => {
    const resources = { wood: 2, brick: 0, sheep: 3, wheat: 1, ore: 0 };
    expect(validateAction({ type: 'discard', resources })).toEqual({ type: 'discard', resources });
    for (const invalid of [
      { ...resources, wood: -1 },
      { ...resources, wood: 0.5 },
      { ...resources, wood: 20 },
      { ...resources, wood: '2' },
      { ...resources, fake: 0 },
      { wood: 2 },
    ]) {
      expect(() => validateAction({ type: 'discard', resources: invalid })).toThrow();
    }
  });

  it('bounds HTTP bodies including a missing content-length header', async () => {
    const request = (body: string, headers = {}) =>
      new Request('https://example.test/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body,
      });
    await expect(readBody(request('{"name":"Alex"}'))).resolves.toEqual({ name: 'Alex' });
    await expect(readBody(request('x'.repeat(2049)))).rejects.toMatchObject({ status: 413 });
    await expect(readBody(request('{}', { 'content-length': '9000' }))).rejects.toMatchObject({ status: 413 });
    await expect(readBody(request('not json'))).rejects.toMatchObject({ status: 400 });
    await expect(readBody(request('{}', { 'content-type': 'text/plain' }))).rejects.toMatchObject({ status: 415 });
    await expect(readBody(request('{}', { 'content-type': 'application/json-bogus' }))).rejects.toMatchObject({
      status: 415,
    });
  });

  it('issues strong bearer tokens and stores only irreversible hashes', async () => {
    const token = randomToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(randomToken()).not.toBe(token);
    const hash = await hashToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(token);
    expect(await hashToken(token)).toBe(hash);
    for (let i = 0; i < 100; i++) expect(ROOM_PATTERN.test(roomCode())).toBe(true);
  });
});
