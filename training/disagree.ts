import type { Brain } from '../shared/bots';
import { actWith } from '../shared/bots';
import { getView } from '../shared/engine';
import type { GameAction, GameState } from '../shared/types';
import { rollout } from './rollouts';
import { seeded } from './sim';

/**
 * Where two policies part ways (PLAN: diagnose before scaling). At sampled build decisions in a
 * normal game, ask the challenger what it would do; where it differs from the seat's own move,
 * play both moves to the end many times on the same dice (everyone, the deciding seat included,
 * then plays the baseline) and record which won more often. Grouped by the pair of moves, this
 * says which kinds of decisions the challenger gets right or wrong.
 */

export interface Disagreement {
  /** "baseline move → challenger move", by action type (with the build kind). */
  kind: string;
  /** Challenger's win share minus the baseline's, over the rollouts. */
  diff: number;
  seed: number;
  turn: number;
}

const label = (a: GameAction) => a.type;

/** Disagreements at one decision (empty when both pick the same move). */
export function disagreement(
  state: GameState,
  seat: number,
  brains: Brain[],
  challenger: Brain,
  seed: number,
  rollouts: number,
): Disagreement | null {
  const view = getView(state, `p${seat}`);
  const base = actWith(brains[seat]!, view, { builds: 0 });
  const other = actWith(challenger, view, { builds: 0 });
  if (JSON.stringify(base) === JSON.stringify(other)) return null;
  // Offers to players resolve over several moves; compare builds, trades, cards, and stopping only.
  if ([base, other].some(a => a.type === 'offer-trade')) return null;
  let diff = 0;
  let done = 0;
  for (let k = 0; k < rollouts; k++) {
    const make = () => seeded(Math.imul(seed, 7919) ^ Math.imul(state.version, 104729) ^ (k * 2654435761));
    const a = rollout(state, `p${seat}`, base, brains, make(), { rounds: Infinity });
    const b = rollout(state, `p${seat}`, other, brains, make(), { rounds: Infinity });
    if (!a || !b) return null;
    diff += b[0]! - a[0]!;
    done++;
  }
  return { kind: `${label(base)} → ${label(other)}`, diff: diff / done, seed, turn: state.turn };
}

/** Per pair of moves: how often, and the challenger's average edge with its standard error. */
export function reportDisagreements(all: Disagreement[]): void {
  const groups = new Map<string, number[]>();
  for (const d of all) groups.set(d.kind, [...(groups.get(d.kind) ?? []), d.diff]);
  const stats = (xs: number[]) => {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(1, xs.length - 1));
    return { mean, err: sd / Math.sqrt(xs.length) };
  };
  const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
  console.log(`${all.length} disagreements; challenger − baseline win chance per decision:`);
  for (const [kind, xs] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const s = stats(xs);
    console.log(
      `  ${kind.padEnd(40)} ${String(xs.length).padStart(5)}  ${pct(s.mean).padStart(7)} ±${(s.err * 100).toFixed(1)}%`,
    );
  }
  if (all.length) {
    const s = stats(all.map(d => d.diff));
    console.log(
      `  ${'all'.padEnd(40)} ${String(all.length).padStart(5)}  ${pct(s.mean).padStart(7)} ±${(s.err * 100).toFixed(1)}%`,
    );
  }
}
