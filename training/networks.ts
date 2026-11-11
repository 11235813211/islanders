import type { Net } from '../shared/bots/advanced/net';
import { seatChances } from '../shared/bots/advanced/net';
import { SETUP_FEATURES } from '../shared/bots/advanced/setup';
import { MAX_SEATS, SEAT_FEATURES } from '../shared/bots/advanced/value';
import { type Checkpoint, loadCheckpoint, paramsOf, saveCheckpoint, seatFor } from './checkpoints';
import { type Kind, loadRows, saveRows } from './datasets';
import { heroFitness } from './evaluate';
import type { GameJob, JobResult, SeatSpec } from './jobs';
import { type Dataset, type SeatDataset, trainNet, trainSeatNet } from './mlp';
import { runJobs } from './pool';
import { joinSeats, movesDataset, type RolloutOptions, TARGET_COLUMNS } from './rollouts';
import type { ScenarioFilter } from './scenarios';

/**
 * The two networks, collected and trained the same way. Both predict how a seat's game turns out
 * (a soft label: mostly "won", partly the share of the target reached).
 *
 *   setup: the starting position once setup ends (SETUP_FEATURES). Explorers sometimes take
 *     another good corner (setupExplore), so the data covers starts the policy wouldn't pick.
 *   value: positions during play, sampled at the start of turns from one seat's view per game,
 *     every seat's summary (SEAT_FEATURES, padded to MAX_SEATS); the label is the winner. Fitting
 *     turns that into TD(λ) targets with the parent's network (seatTargets). Explorers sometimes
 *     take a random build move (valueExplore).
 *
 * collect plays self-play games (half the seats exploring copies of `from`, the rest a mix of
 * Intermediate and `from`) and saves rows; fit trains a network and saves a child checkpoint.
 */

/** Stored columns of a value row: seats present, then each seat's block. */
const VALUE_COLUMNS = [
  'seats',
  ...Array.from({ length: MAX_SEATS }, (_, k) => SEAT_FEATURES.map(f => `${f}${k}`)).flat(),
];

export const FEATURES: Record<Kind, readonly string[]> = {
  setup: SETUP_FEATURES,
  value: VALUE_COLUMNS,
  moves: [...VALUE_COLUMNS, ...TARGET_COLUMNS],
};

/** A row's stored label: the winner (seat order from the viewer) for value rows, none for moves. */
function rowLabel(kind: Kind, r: JobResult, seat: number, n: number): number {
  if (kind === 'value') return (r.winner! - seat + n) % n;
  return kind === 'moves' ? 0 : label(r, seat);
}

/** The soft label for one seat. */
export function label(r: JobResult, seat: number): number {
  return 0.75 * (r.winner === seat ? 1 : 0) + 0.25 * Math.min(1, r.points[seat]! / r.victoryPoints);
}

export async function collect(
  kind: Kind,
  options: {
    from: string;
    games: number;
    firstSeed: number;
    explore: number;
    out: string;
    filter?: ScenarioFilter;
    /** Move comparisons: rollouts per move, turns per rollout, share of decisions. */
    rollouts?: Omit<RolloutOptions, 'scorer'>;
    /** Checkpoint whose value network scores rollouts (default: `from`). */
    scorer?: string;
  },
): Promise<void> {
  const base = loadCheckpoint(options.from);
  const explore = { setup: { setupExplore: options.explore }, value: { valueExplore: options.explore }, moves: {} }[
    kind
  ];
  const scorer = loadCheckpoint(options.scorer ?? options.from).valueNet;
  if (kind === 'moves' && scorer?.inputs.join() !== SEAT_FEATURES.join())
    throw new Error(`${options.scorer ?? options.from} has no seat value network to score rollouts with.`);
  const rollouts = kind === 'moves' ? { ...options.rollouts!, scorer: scorer! } : undefined;
  const hero: SeatSpec = { advanced: { ...paramsOf(base), knobs: { ...base.knobs, ...explore } } };
  const field = [seatFor('intermediate'), { advanced: paramsOf(base) }];
  const jobs: GameJob[] = Array.from({ length: options.games }, (_, i) => ({
    seed: options.firstSeed + i,
    hero,
    field,
    heroes: 'half',
    record: kind,
    rollouts,
    filter: options.filter,
  }));
  let last = 0;
  const results = await runJobs(jobs, done => {
    if (done - last >= 500) {
      last = done;
      process.stderr.write(`  ${done}/${options.games} games\r`);
    }
  });
  const rows: number[][] = [];
  for (const r of results) {
    if (r.winner === null) continue;
    const n = r.players;
    for (const { seat, features } of r.recorded ?? []) rows.push([...features, rowLabel(kind, r, seat, n), r.seed]);
  }
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
  console.log(`wrote ${rows.length} rows to ${path} (explorers' fitness ${fitness.toFixed(3)})`);
}

export function fitNetwork(
  kind: Kind,
  options: {
    from: string;
    data: string[];
    name: string;
    hidden: number[];
    epochs: number;
    fresh: boolean;
    lambda: number;
    /** Move-comparison files to train on alongside the value rows. */
    moves?: string[];
  },
): Checkpoint {
  const parent = loadCheckpoint(options.from);
  const features = FEATURES[kind];
  const data = loadRows(kind, options.data, features);
  const previous = kind === 'setup' ? parent.setupNet : (parent.valueNet ?? null);
  const fit = {
    hidden: options.hidden,
    epochs: options.epochs,
    batch: 64,
    rate: 0.002,
    decay: 1e-4,
    validation: 0.15,
    seed: 7,
    log: (line: string) => console.log(line),
  };
  let result: ReturnType<typeof trainNet>;
  if (kind === 'value') {
    const usable = previous?.inputs.join() === SEAT_FEATURES.join() ? previous : null;
    const lambda = usable ? options.lambda : 1;
    console.log(
      `${data.rows} positions, ${SEAT_FEATURES.length} features per seat, TD λ ${lambda}, hidden ${JSON.stringify(options.hidden)}`,
    );
    let seats = seatTargets(data, usable, lambda);
    if (options.moves?.length) {
      const moves = movesDataset(loadRows('moves', options.moves, FEATURES.moves));
      console.log(`${moves.rows} move comparisons`);
      seats = joinSeats(seats, moves);
    }
    result = trainSeatNet(seats, [...SEAT_FEATURES], {
      ...fit,
      start: options.fresh ? null : usable,
    });
  } else {
    console.log(`${data.rows} rows, ${features.length} features, hidden ${JSON.stringify(options.hidden)}`);
    result = trainNet(data, [...features], { ...fit, start: options.fresh ? null : previous });
  }
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

/**
 * Seat rows with TD(λ) targets: each position learns from the network's chances at the game's
 * next sampled position, blended with the final result (λ 1: the result alone). Dice luck after
 * a position mostly cancels, since the next position's chances already include it.
 */
function seatTargets(data: Dataset, net: Net | null, lambda: number): SeatDataset {
  const W = SEAT_FEATURES.length;
  const out: SeatDataset = {
    x: new Float32Array(data.rows * MAX_SEATS * W),
    y: new Float32Array(data.rows * MAX_SEATS),
    seats: new Uint8Array(data.rows),
    group: data.group,
    width: W,
    rows: data.rows,
  };
  const chances = (row: number) => {
    const n = out.seats[row]!;
    const seats = Array.from({ length: n }, (_, k) =>
      Array.from(out.x.subarray((row * MAX_SEATS + k) * W, (row * MAX_SEATS + k + 1) * W)),
    );
    return seatChances(net!, seats);
  };
  for (let row = 0; row < data.rows; row++) {
    out.seats[row] = data.x[row * data.width]!;
    out.x.set(data.x.subarray(row * data.width + 1, (row + 1) * data.width), row * MAX_SEATS * W);
  }
  // Rows of one game are consecutive and in order; walk each game backwards.
  let target: number[] = [];
  for (let row = data.rows - 1; row >= 0; row--) {
    const n = out.seats[row]!;
    const lastOfGame = row === data.rows - 1 || data.group[row + 1] !== data.group[row];
    if (lastOfGame || !net || lambda >= 1) {
      if (lastOfGame) target = Array.from({ length: n }, (_, k) => (k === data.y[row] ? 1 : 0));
    } else {
      const next = chances(row + 1);
      target = target.map((g, k) => (1 - lambda) * next[k]! + lambda * g);
    }
    out.y.set(target, row * MAX_SEATS);
  }
  return out;
}
