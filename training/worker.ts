import { parentPort } from 'node:worker_threads';
import { type GameJob as Job, runJob } from './jobs';

/** Worker thread: runs each batch of jobs it is sent and posts the results back. */
parentPort!.on('message', (jobs: Job[]) => {
  parentPort!.postMessage(jobs.map(runJob));
});
