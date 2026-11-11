import { describe, expect, it } from 'vitest';
import { advanceTime, applyAction, botDueAt } from '../shared/engine';
import {
  anonymizeLobby,
  buildRecord,
  type GameRecord,
  type RecordedStep,
  renameIds,
  replayRecord,
  seatIds,
  shouldRecord,
  tape,
  toStep,
} from '../shared/replay';
import type { GameState } from '../shared/types';
import { makeLobby, seeded, TEST_NOW } from './fixtures';

/** A state as a record keeps it: the room code is replaced and log text (which has names) is blanked. */
function plain(state: GameState): GameState {
  return { ...state, roomId: 'REPLAY', log: state.log.map(entry => ({ ...entry, text: '' })) };
}

/** Play a bot-only game the way the server does, keeping a record. */
function recordGame(seed: number, withChat = false) {
  const random = seeded(seed);
  const lobby = makeLobby(3);
  lobby.players.forEach((p, i) => {
    p.name = `Seat ${i + 1}`;
    p.bot = 'intermediate';
  });
  const ids = seatIds(lobby);
  const initial = anonymizeLobby(lobby, ids);
  const steps: RecordedStep[] = [];
  const keep = (step: RecordedStep) => {
    const stored = toStep(ids, step);
    if (stored) steps.push(stored);
  };
  const first = tape(random);
  let game = applyAction(lobby, 'p0', { type: 'start' }, first.random, TEST_NOW, { online: ['p0'] });
  keep({ kind: 'action', actor: 'p0', action: { type: 'start' }, now: TEST_NOW, random: first.draws, online: ['p0'] });
  let now = TEST_NOW;
  for (let i = 0; i < 6000 && game.phase !== 'finished'; i++) {
    now = Math.max(now, botDueAt(game)!);
    if (withChat && i === 20) {
      const chat = tape(random);
      now += 2000;
      game = applyAction(game, 'p1', { type: 'chat', text: 'secret words' }, chat.random, now);
      keep({ kind: 'action', actor: 'p1', action: { type: 'chat', text: 'secret words' }, now, random: chat.draws });
    }
    const t = tape(random);
    game = advanceTime(game, now, t.random);
    keep({ kind: 'time', now, random: t.draws });
  }
  return { record: buildRecord(initial, steps, game, ids, now), final: plain(renameIds(game, ids)) };
}

describe('recording consent', () => {
  it('records only when every human consented; bots need none', () => {
    const lobby = makeLobby(3);
    lobby.players[2]!.bot = 'beginner';
    expect(shouldRecord(lobby, { p0: true, p1: true })).toBe(true);
    expect(shouldRecord(lobby, { p0: true })).toBe(false);
    expect(shouldRecord(lobby, { p0: true, p1: false })).toBe(false);
    expect(shouldRecord(lobby, {})).toBe(false);
  });

  it('does not record solo test rooms or all-bot tables', () => {
    const lobby = makeLobby(2);
    lobby.testMode = true;
    expect(shouldRecord(lobby, { p0: true, p1: true })).toBe(false);
    const bots = makeLobby(2);
    bots.players.forEach(p => {
      p.bot = 'beginner';
    });
    expect(shouldRecord(bots, {})).toBe(false);
  });
});

describe('game records', () => {
  it('replays to the identical final state', () => {
    const { record, final } = recordGame(11);
    expect(record.steps.length).toBeGreaterThan(100);
    expect(plain(replayRecord(record))).toEqual(final);
  });

  it('survives a JSON round trip and calls onStep for every step', () => {
    const { record, final } = recordGame(12);
    const copy = JSON.parse(JSON.stringify(record)) as GameRecord;
    let seen = 0;
    expect(plain(replayRecord(copy, () => seen++))).toEqual(final);
    expect(seen).toBe(copy.steps.length);
  });

  it('keeps no names, player ids, or chat text', () => {
    const { record } = recordGame(13, true);
    const text = JSON.stringify(record);
    expect(text).not.toContain('secret words');
    expect(text).not.toMatch(/"p[0-9]"/);
    expect(record.seats).toEqual(['intermediate', 'intermediate', 'intermediate']);
    expect(record.winnerSeat).not.toBeNull();
    expect(replayRecord(record).chat).toHaveLength(1);
  });

  it('rejects a record whose random numbers no longer match', () => {
    const { record } = recordGame(14);
    const bad = structuredClone(record);
    bad.steps[0]!.random.pop();
    expect(() => replayRecord(bad)).toThrow();
  });
});
