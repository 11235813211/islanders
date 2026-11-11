import { SETUP_FEATURES } from '../shared/bots/advanced/setup';
import { VALUE_FEATURES } from '../shared/bots/advanced/value';
import { type Checkpoint, loadCheckpoint, paramsOf, saveCheckpoint, seatFor } from './checkpoints';
import { type Kind, loadRows, saveRows } from './datasets';
import { heroFitness } from './evaluate';
import type { GameJob, JobResult, SeatSpec } from './jobs';
import { trainNet } from './mlp';
import { runJobs } from './pool';
import type { ScenarioFilter } from './scenarios';

/**
 * The two networks, collected and trained the same way. Both predict how a seat's game turns out
 * (a soft label: mostly "won", partly the share of the target reached).
 *
 *   setup: the starting position once setup ends (SETUP_FEATURES). Explorers sometimes take
 *     another good corner (setupExplore), so the data covers starts the policy wouldn't pick.
 *   value: positions during play, sampled at the start of turns, every seat (VALUE_FEATURES).
 *     Explorers sometimes take a random build move (valueExplore).
 *
 * collect plays self-play games (half the seats exploring copies of `from`, the rest a mix of
 * Intermediate and `from`) and saves rows; fit trains a network and saves a child checkpoint.
 */

export const FEATURES: Record<Kind, readonly string[]> = { setup: SETUP_FEATURES, value: VALUE_FEATURES };

/** The soft label for one seat. */
export function label(r: JobResult, seat: number): number {
  return 0.75 * (r.winner === seat ? 1 : 0) + 0.25 * Math.min(1, r.points[seat]! / r.victoryPoints);
}

export async function collect(
  kind: Kind,
  options: { from: string; games: number; firstSeed: number; explore: number; out: string; filter?: ScenarioFilter },
): Promise<void> {
  const base = loadCheckpoint(options.from);
  const explore = kind === 'setup' ? { setupExplore: options.explore } : { valueExplore: options.explore };
  const hero: SeatSpec = { advanced: { ...paramsOf(base), knobs: { ...base.knobs, ...explore } } };
  const field = [seatFor('intermediate'), { advanced: paramsOf(base) }];
  const jobs: GameJob[] = Array.from({ length: options.games }, (_, i) => ({
    seed: options.firstSeed + i,
    hero,
    field,
    heroes: 'half',
    record: kind,
    filter: options.filter,
  }));
  let last = 0;
  const results = await runJobs(jobs, done => {
    if (done - last >= 500) {
      last = done;
      process.stderr.write(`  ${done}/${options.games} games\r`);
    }
  });
  const rows: number[] = [];
  for (const r of results) {
    if (r.winner === null) continue;
    for (const { seat, features } of r.recorded ?? []) rows.push(...features, label(r, seat), r.seed);
  }
  const width = FEATURES[kind].length;
  const path = saveRows(kind, options.out, FEATURES[kind], rows, {
    from: options.from,
    games: options.games,
    seed: options.firstSeed,
    explore: options.explore,
  });
  const fitness = results.reduce((s, r) => s + heroFitness(r), 0) / results.length;
  const e = results.reduce(
    (t, r) => ({
      decisions: t.decisions + r.exploration.decisions,
      explored: t.explored + r.exploration.explored,
      differed: t.differed + r.exploration.differed,
    }),
    { decisions: 0, explored: 0, differed: 0 },
  );
  console.log(
    `value-network decisions ${e.decisions}, explored ${e.explored}, of which differed from its choice ${e.differed}` +
      (kind === 'value' && !e.decisions ? ' (none: the policy has no value network, so this is planner play)' : ''),
  );
  console.log(`wrote ${rows.length / (width + 2)} rows to ${path} (explorers' fitness ${fitness.toFixed(3)})`);
}

export function fitNetwork(
  kind: Kind,
  options: { from: string; data: string[]; name: string; hidden: number[]; epochs: number; fresh: boolean },
): Checkpoint {
  const parent = loadCheckpoint(options.from);
  const features = FEATURES[kind];
  const data = loadRows(kind, options.data, features);
  const previous = kind === 'setup' ? parent.setupNet : (parent.valueNet ?? null);
  console.log(`${data.rows} rows, ${features.length} features, hidden ${JSON.stringify(options.hidden)}`);
  const result = trainNet(data, [...features], {
    hidden: options.hidden,
    epochs: options.epochs,
    batch: 64,
    rate: 0.002,
    decay: 1e-4,
    validation: 0.15,
    seed: 7,
    start: options.fresh ? null : previous,
    log: line => console.log(line),
  });
  console.log(
    `valid loss ${result.validLoss.toFixed(5)} vs base ${result.baseLoss.toFixed(5)} (train ${result.trainLoss.toFixed(5)}, best epoch ${result.epochs})`,
  );
  const checkpoint: Checkpoint = {
    ...parent,
    name: options.name,
    parent: options.from,
    createdAt: new Date().toISOString(),
    ...(kind === 'setup' ? { setupNet: result.net } : { valueNet: result.net }),
    notes: [
      ...parent.notes,
      `${options.name}: ${kind} net ${JSON.stringify(options.hidden)} on ${options.data.join('+')} (${data.rows} rows): valid ${result.validLoss.toFixed(5)} vs base ${result.baseLoss.toFixed(5)}`,
    ],
  };
  console.log(`saved ${saveCheckpoint(checkpoint)}`);
  return checkpoint;
}
