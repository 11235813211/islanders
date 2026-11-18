import type { Brain } from '../shared/bots';
import { makeAdvanced } from '../shared/bots/advanced';
import { makeParams, type StoredParams } from '../shared/bots/advanced/params';
import type { GameView } from '../shared/types';
import { loadCheckpoint, paramsOf } from './checkpoints';
import { drawScenario, type ScenarioFilter } from './scenarios';
import { playGame } from './sim';

/**
 * CPU per bot decision, overall and by phase, for the free Workers budget (about 10 ms per
 * request). Single-threaded, so the times are comparable between settings.
 */

/** A brain that records how long each of its turn decisions takes, by phase. */
function timed(brain: Brain, times: Map<string, number[]>): Brain {
  const note = (view: GameView, started: number) => {
    const list = times.get(view.phase) ?? [];
    list.push(performance.now() - started);
    times.set(view.phase, list);
  };
  return {
    ...brain,
    turn(view, options) {
      const started = performance.now();
      const action = brain.turn(view, options);
      note(view, started);
      return action;
    },
  };
}

const at = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;

/** Plays games with these knobs in every seat and prints decision times. */
export function moveCost(
  games: number,
  firstSeed: number,
  knobs: Record<string, number>,
  filter?: ScenarioFilter,
): void {
  const stored = paramsOf(loadCheckpoint('shipped')) as StoredParams;
  const brain = makeAdvanced(makeParams({ ...stored, knobs: { ...stored.knobs, ...knobs } }));
  const times = new Map<string, number[]>();
  const seat = timed(brain, times);
  for (let i = 0; i < games; i++) {
    const scenario = drawScenario(firstSeed + i, filter);
    playGame(
      scenario,
      Array.from({ length: scenario.players }, () => seat),
      firstSeed + i,
    );
  }
  const row = (name: string, xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    console.log(
      `${name.padEnd(18)}${String(s.length).padStart(8)}  median ${at(s, 0.5).toFixed(2)}  p99 ${at(s, 0.99).toFixed(2)}  worst ${(s.at(-1) ?? 0).toFixed(2)} ms`,
    );
  };
  row('all decisions', [...times.values()].flat());
  for (const [phase, xs] of [...times].sort()) row(phase, xs);
}
