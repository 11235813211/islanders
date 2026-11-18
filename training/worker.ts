import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parentPort } from 'node:worker_threads';
import { type GameJob, runJob, setRefBots } from './jobs';
import { type RecordDecision, scoreDecision } from './record-disagree';
import { type BenchJob, benchPosition, type PositionsJob, positionsOf } from './scorer-bench';

/** Worker thread: runs each batch of jobs it is sent and posts the results back. */
const refFile = join(dirname(fileURLToPath(import.meta.url)), 'ref.mjs');
// Bots from another git ref (run.mjs --ref), for seats named ref:<level>.
const ready = existsSync(refFile) ? import(refFile).then(m => setRefBots(m.BOTS)) : Promise.resolve();

type Job = GameJob | RecordDecision | BenchJob | PositionsJob;

/** Decisions from saved games (records-disagree) carry the person's move; bench jobs say so; the rest are games. */
function run(job: Job) {
  if ('person' in job) return scoreDecision(job);
  if ('bench' in job) return benchPosition(job.bench);
  if ('positionsOf' in job) return positionsOf(job.positionsOf);
  return runJob(job);
}

parentPort!.on('message', async (jobs: Job[]) => {
  await ready;
  parentPort!.postMessage(jobs.map(run));
});
