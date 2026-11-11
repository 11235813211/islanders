import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { GameJob as Job, JobResult } from './jobs';

/**
 * Runs jobs on worker threads (one per core by default, THREADS to override). Jobs are sent in
 * small batches so results stream back and slow games don't hold up a whole core's share.
 */
export async function runJobs(jobs: Job[], onProgress?: (done: number) => void): Promise<JobResult[]> {
  const threads = Math.max(1, Math.min(Number(process.env.THREADS ?? availableParallelism() - 1), jobs.length));
  const results: JobResult[] = new Array(jobs.length);
  const file = join(dirname(fileURLToPath(import.meta.url)), 'worker.mjs');
  let next = 0;
  let done = 0;
  const batch = Math.max(1, Math.min(8, Math.floor(jobs.length / (threads * 6))));
  await Promise.all(
    Array.from({ length: threads }, async () => {
      const worker = new Worker(file);
      try {
        while (next < jobs.length) {
          const start = next;
          next = Math.min(jobs.length, next + batch);
          const out = await new Promise<JobResult[]>((resolve, reject) => {
            worker.once('message', resolve);
            worker.once('error', reject);
            worker.postMessage(jobs.slice(start, next));
          });
          worker.removeAllListeners('error');
          out.forEach((r, i) => {
            results[start + i] = r;
          });
          done += out.length;
          onProgress?.(done);
        }
      } finally {
        await worker.terminate();
      }
    }),
  );
  return results;
}
