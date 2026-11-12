import { DurableObject } from 'cloudflare:workers';
import {
  anonymizeLobby,
  buildRecord,
  type RecordedStep,
  type RecordInfo,
  type SeatIds,
  seatIds,
  toStep,
} from '../shared/replay';
import type { GameState } from '../shared/types';
import type { Env } from './env';

/** Where a room's game is being recorded. Steps live in the room's own storage until the game ends. */
export interface Recording {
  count: number;
  ids: SeatIds;
}

/** Records are small, so a game that runs this long (or compresses this big) is dropped instead. */
export const MAX_STEPS = 8000;
export const MAX_RECORD_BYTES = 1_000_000;
/** Newest records kept in the store. */
export const KEEP_RECORDS = 500;

const INIT_KEY = 'rec:init';
const stepKey = (n: number) => `rec:s:${String(n).padStart(6, '0')}`;

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gzip(text: string): Promise<Uint8Array> {
  const source = new Blob([text]).stream();
  return readAll(source.pipeThrough(new CompressionStream('gzip')));
}
async function gunzip(bytes: Uint8Array): Promise<string> {
  const source = new Blob([bytes]).stream();
  return new TextDecoder().decode(await readAll(source.pipeThrough(new DecompressionStream('gzip'))));
}

/** Start recording at `start`: keep the anonymized lobby. */
export async function beginRecording(storage: DurableObjectStorage, lobby: GameState): Promise<Recording> {
  const ids = seatIds(lobby);
  await storage.put(INIT_KEY, anonymizeLobby(lobby, ids));
  return { count: 0, ids };
}

/** Add one step. Returns the updated recording, or undefined when it was dropped (too long, or from a spectator: unchanged). */
export async function appendStep(
  storage: DurableObjectStorage,
  recording: Recording,
  step: RecordedStep,
): Promise<Recording | undefined> {
  const stored = toStep(recording.ids, step);
  if (!stored) return recording;
  if (recording.count >= MAX_STEPS) {
    await discardRecording(storage);
    return undefined;
  }
  await storage.put(stepKey(recording.count), stored);
  return { ...recording, count: recording.count + 1 };
}

/** Forget a recording (the game ended early, or it was too long). */
export async function discardRecording(storage: DurableObjectStorage): Promise<void> {
  const keys = [...(await storage.list({ prefix: 'rec:' })).keys()];
  for (let i = 0; i < keys.length; i += 128) await storage.delete(keys.slice(i, i + 128));
}

/** Game over: assemble the record, compress it, and hand it to the record store with one write. */
export async function finishRecording(
  env: Env,
  storage: DurableObjectStorage,
  recording: Recording,
  final: GameState,
  now: number,
): Promise<void> {
  const initial = await storage.get<GameState>(INIT_KEY);
  const steps = [...(await storage.list<RecordedStep>({ prefix: 'rec:s:' })).values()];
  await discardRecording(storage);
  if (!initial || steps.length !== recording.count) return;
  const record = buildRecord(initial, steps, final, recording.ids, now);
  const bytes = await gzip(JSON.stringify(record));
  if (bytes.byteLength > MAX_RECORD_BYTES) return;
  await recordsStub(env).add({ endedAt: now, seats: record.seats, turns: record.turns, steps: steps.length }, bytes);
}

const recordsStub = (env: Env) => env.RECORDS.get(env.RECORDS.idFromName('records'));

export { recordsStub };

/** All saved game records for the site (one instance), newest kept up to KEEP_RECORDS. */
export class GameRecordStore extends DurableObject<Env> {
  /** Save a compressed record and drop the oldest beyond the limit. */
  async add(info: Omit<RecordInfo, 'id' | 'bytes'>, bytes: Uint8Array): Promise<void> {
    const index = (await this.ctx.storage.get<RecordInfo[]>('index')) ?? [];
    const id = `${info.endedAt}-${crypto.randomUUID().slice(0, 8)}`;
    const next = [...index, { ...info, id, bytes: bytes.byteLength }];
    const dropped = next.splice(0, Math.max(0, next.length - KEEP_RECORDS));
    await this.ctx.storage.put({ [`r:${id}`]: bytes, index: next });
    if (dropped.length) await this.ctx.storage.delete(dropped.map(old => `r:${old.id}`));
  }

  async list(): Promise<RecordInfo[]> {
    return (await this.ctx.storage.get<RecordInfo[]>('index')) ?? [];
  }

  /** Delete one record; false if there was none. */
  async remove(id: string): Promise<boolean> {
    const index = (await this.ctx.storage.get<RecordInfo[]>('index')) ?? [];
    const next = index.filter(info => info.id !== id);
    if (next.length === index.length) return false;
    await this.ctx.storage.put('index', next);
    await this.ctx.storage.delete(`r:${id}`);
    return true;
  }

  /** One record as JSON text, or null if it is gone. */
  async get(id: string): Promise<string | null> {
    const bytes = await this.ctx.storage.get<Uint8Array>(`r:${id}`);
    return bytes ? gunzip(bytes) : null;
  }
}
