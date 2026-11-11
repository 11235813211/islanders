import { readFileSync } from 'node:fs';
import { type GameRecord, type ReplayEvent, replayRecord } from '../shared/replay';
import type { GameState } from '../shared/types';

/**
 * Step through a recorded game (see shared/replay.ts and docs in training/README.md). `onMove` gets
 * the state before and after every step, e.g. to ask a bot what it would have played and compare.
 * Returns the final state.
 */
export function replayGame(record: GameRecord, onMove?: (event: ReplayEvent) => void): GameState {
  return replayRecord(record, onMove);
}

/** Load records from a file holding one record or an array of them (the export endpoint's output). */
export function loadRecords(file: string): GameRecord[] {
  const data = JSON.parse(readFileSync(file, 'utf8')) as GameRecord | GameRecord[];
  return Array.isArray(data) ? data : [data];
}
