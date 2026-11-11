import type { Brain } from '../shared/bots';
import { moveCandidates } from '../shared/bots/advanced/choose';
import { Economy } from '../shared/bots/advanced/economy';
import { type Net, seatChances } from '../shared/bots/advanced/net';
import { makeParams } from '../shared/bots/advanced/params';
import { MAX_SEATS, SEAT_FEATURES, seatFeatures, seatPositions } from '../shared/bots/advanced/value';
import { applyAction, GameError, getActivePlayerId, getView } from '../shared/engine';
import type { GameState } from '../shared/types';
import type { Dataset, SeatDataset } from './mlp';
import { NOW, playOn, seeded } from './sim';

/**
 * Move comparisons (PLAN step 3c): at a sampled build decision, try each candidate move (every
 * build, or stopping), play the game on a few turns many times with the table's own bots, and
 * label the move's result with every seat's average outcome: the winner where the game ended,
 * else the value network's chances where the rollout stopped. The row's inputs are exactly what
 * the bot scores when it chooses (choose.ts), so the network learns "hold or build?" directly.
 *
 * Rollouts know the true hands (labels are averages, the network still sees only the view) but
 * reshuffle the development deck, which the bot can't see either. Every candidate meets the same
 * dice (rollout k uses the same seed for each), so differences between moves aren't luck.
 */

export interface RolloutOptions {
  /** Network that scores a rollout's last position. */
  scorer: Net;
  rollouts: number;
  /** Rounds (every seat's turn) each rollout plays before the network scores it. */
  rounds: number;
  /** Share of build decisions sampled. */
  rate: number;
}

/** Stored columns after the seat columns: each seat's target chance. */
export const TARGET_COLUMNS = Array.from({ length: MAX_SEATS }, (_, k) => `target${k}`);

const knobs = makeParams().knobs;

/** A build decision worth labelling: the active seat, no offer pending, sampled by hash. */
export function isDecision(state: GameState, seat: number, seed: number, rate: number): boolean {
  if (state.phase !== 'build' || state.tradeOffer || getActivePlayerId(state) !== `p${seat}`) return false;
  const h = Math.imul(state.version ^ Math.imul(seed, 2654435761), 2246822519) >>> 0;
  return h / 2 ** 32 < rate;
}

/** Rows [seats, padded seat features, padded targets] for each candidate at one decision. */
export function decisionRows(
  state: GameState,
  seat: number,
  brains: Brain[],
  seed: number,
  options: RolloutOptions,
): number[][] {
  const id = `p${seat}`;
  const econ = new Economy(getView(state, id), knobs);
  const candidates = moveCandidates(econ);
  if (candidates.length < 2) return [];
  const n = state.players.length;
  const next = (seat + 1) % n;
  const rows: number[][] = [];
  for (const candidate of candidates) {
    const totals = new Array(n).fill(0);
    let done = 0;
    for (let k = 0; k < options.rollouts; k++) {
      const random = seeded(Math.imul(seed, 7919) ^ Math.imul(state.version, 104729) ^ (k * 2654435761));
      const outcome = rollout(state, id, candidate.action, brains, random, options);
      if (!outcome) break;
      outcome.forEach((p, j) => {
        totals[j] += p;
      });
      done++;
    }
    if (!done) continue;
    const features = seatFeatures(econ, candidate.seats, next);
    rows.push([
      n,
      ...pad(features.flat(), MAX_SEATS * SEAT_FEATURES.length),
      ...pad(
        totals.map(t => t / done),
        MAX_SEATS,
      ),
    ]);
  }
  return rows.length >= 2 ? rows : [];
}

const pad = (xs: number[], length: number) => [...xs, ...new Array(length - xs.length).fill(0)];

/** One rollout's outcome per seat, ours first; null if the move is illegal. */
function rollout(
  state: GameState,
  id: string,
  action: Parameters<typeof applyAction>[2] | null,
  brains: Brain[],
  random: () => number,
  options: RolloutOptions,
): number[] | null {
  let g: GameState = { ...state, developmentDeck: shuffled(state.developmentDeck, random) };
  try {
    g = applyAction(g, id, action ?? { type: 'end-turn' }, random, NOW);
  } catch (error) {
    if (error instanceof GameError) return null;
    throw error;
  }
  g = playOn(g, brains, random, { untilTurn: state.turn + options.rounds * state.players.length }).state;
  const n = g.players.length;
  const seat = Number(id.slice(1));
  if (g.winnerId) {
    const winner = (Number(g.winnerId.slice(1)) - seat + n) % n;
    return Array.from({ length: n }, (_, k) => (k === winner ? 1 : 0));
  }
  const econ = new Economy(getView(g, id), knobs);
  return seatChances(options.scorer, seatFeatures(econ, seatPositions(econ)));
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Stored move rows (columns: seats, seat blocks, targets) as a training set. */
export function movesDataset(data: Dataset): SeatDataset {
  const W = SEAT_FEATURES.length;
  const block = MAX_SEATS * W;
  const out: SeatDataset = {
    x: new Float32Array(data.rows * block),
    y: new Float32Array(data.rows * MAX_SEATS),
    seats: new Uint8Array(data.rows),
    group: data.group,
    width: W,
    rows: data.rows,
  };
  for (let row = 0; row < data.rows; row++) {
    const at = row * data.width;
    out.seats[row] = data.x[at]!;
    out.x.set(data.x.subarray(at + 1, at + 1 + block), row * block);
    out.y.set(data.x.subarray(at + 1 + block, at + 1 + block + MAX_SEATS), row * MAX_SEATS);
  }
  return out;
}

/** Two training sets as one (groups kept apart). */
export function joinSeats(a: SeatDataset, b: SeatDataset): SeatDataset {
  const join = <T extends Float32Array | Uint8Array | Float64Array>(x: T, y: T, make: (n: number) => T) => {
    const out = make(x.length + y.length);
    out.set(x);
    out.set(y, x.length);
    return out;
  };
  return {
    x: join(a.x, b.x, n => new Float32Array(n)),
    y: join(a.y, b.y, n => new Float32Array(n)),
    seats: join(a.seats, b.seats, n => new Uint8Array(n)),
    group: join(
      a.group,
      b.group.map(g => g + 5e8),
      n => new Float64Array(n),
    ),
    width: a.width,
    rows: a.rows + b.rows,
  };
}
