import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parentPort } from 'node:worker_threads';
import { type GameJob, runJob, setRefBots } from './jobs';
import { type RecordDecision, scoreDecision } from './record-disagree';

/** Worker thread: runs each batch of jobs it is sent and posts the results back. */
const refFile = join(dirname(fileURLToPath(import.meta.url)), 'ref.mjs');
// Bots from another git ref (run.mjs --ref), for seats named ref:<level>.
const ready = existsSync(refFile) ? import(refFile).then(m => setRefBots(m.BOTS)) : Promise.resolve();
parentPort!.on('message', async (jobs: (GameJob | RecordDecision)[]) => {
  await ready;
  // Decisions from saved games (records-disagree) carry the person's move; everything else is a game.
  parentPort!.postMessage(jobs.map(job => ('person' in job ? scoreDecision(job) : runJob(job))));
});
