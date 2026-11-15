import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { isAdminOnlyCategory } from '../shared/maps';
import type { BoardLibrary } from '../shared/maps/types';
import type { GameRecord, RecordInfo } from '../shared/replay';

/**
 * Data from the deployed site. `auth` is `username:token` for a `PLAYTEST_USERS` account (the
 * token is in the browser's `islanders-account` localStorage entry), from ISLANDERS_AUTH.
 */

export const SITE = 'https://play.islandersgame.workers.dev';

async function getJson(site: string, path: string, auth?: string): Promise<unknown> {
  const headers: Record<string, string> = auth ? { Authorization: `Bearer ${auth}` } : {};
  const response = await fetch(new URL(path, site), { headers });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

/** Every saved game record (`/api/records`, playtest accounts only). */
export async function fetchRecords(site: string, auth: string): Promise<GameRecord[]> {
  const list = (await getJson(site, '/api/records', auth)) as RecordInfo[];
  const records: GameRecord[] = [];
  for (const info of list) records.push((await getJson(site, `/api/records/${info.id}`, auth)) as GameRecord);
  return records;
}

/**
 * Save the live board library to `file` (training/boards/library.json). Without `auth` the site
 * hides admin-only categories (the "AI Training" boards), so those are kept from the old snapshot.
 */
export async function saveLibrary(site: string, file: string, auth?: string): Promise<string> {
  const live = (await getJson(site, '/api/boards', auth)) as BoardLibrary;
  let kept = 0;
  if (!auth) {
    const old = JSON.parse(readFileSync(file, 'utf8')) as BoardLibrary;
    const hidden = old.categories.filter(isAdminOnlyCategory);
    const ids = new Set(hidden.map(c => c.id));
    const boards = old.boards.filter(b => ids.has(b.categoryId) && !live.boards.some(x => x.id === b.id));
    live.categories.push(...hidden.filter(c => !live.categories.some(x => x.id === c.id)));
    live.boards.push(...boards);
    kept = boards.length;
  }
  const stamped = { fetchedFrom: `${site}/api/boards`, fetchedAt: new Date().toISOString().slice(0, 10), ...live };
  writeFileSync(file, `${JSON.stringify(stamped, null, 2)}\n`);
  return `${live.boards.length} boards saved to ${file}${kept ? ` (${kept} admin-only kept from the old snapshot)` : ''}`;
}

/**
 * The playtest login for these requests: ISLANDERS_AUTH if set, else asked for in the terminal with
 * the token hidden as it is typed (so it stays out of shell history and logs).
 */
export async function askAuth(): Promise<string> {
  if (process.env.ISLANDERS_AUTH) return process.env.ISLANDERS_AUTH;
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  const lines = rl[Symbol.asyncIterator]();
  const next = async () => String((await lines.next()).value ?? '').trim();
  process.stdout.write('Playtest username: ');
  const username = await next();
  // Echo nothing while the token is typed.
  const out = rl as unknown as { _writeToOutput: (text: string) => void };
  out._writeToOutput = () => {};
  process.stdout.write('Token (hidden): ');
  const token = await next();
  rl.close();
  process.stdout.write('\n');
  return `${username}:${token}`;
}
