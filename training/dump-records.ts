import { loadRecords, replayGame } from './replays';
import { eventCollector, writeDump } from './study';

/**
 * Dump saved games on an older engine. Records replay only on the engine they were played on, and
 * the CLI doesn't build against old `shared/` code, so this entry needs only replays.ts and
 * study.ts. In a worktree at the game's commit (training/README.md, saved games):
 *   cp training/{replays,study,dump-records}.ts <worktree>/training/
 *   npx esbuild <worktree>/training/dump-records.ts --bundle --platform=node --format=esm --outfile=<dir>/dump.mjs
 *   node <dir>/dump.mjs <records.json> <out dir> [0,4]
 * Prints ok or why each record failed; dumps the ones that end as recorded.
 */
const [file, out, only] = process.argv.slice(2);
const wanted = only?.split(',').map(Number);
for (const [i, record] of loadRecords(file!).entries()) {
  if (wanted && !wanted.includes(i)) continue;
  try {
    const collect = eventCollector();
    const end = replayGame(record, collect.onStep);
    if (end.version !== record.finalVersion) {
      console.log(`${i} DIFFERS`);
      continue;
    }
    writeDump(out!, i, { ...record, final: end, events: collect.events, turns: collect.turns });
    console.log(`${i} ok`);
  } catch (error) {
    console.log(`${i} FAILS ${(error as Error).message}`);
  }
}
