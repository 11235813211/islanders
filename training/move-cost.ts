import type { BotThought, Brain } from '../shared/bots';
import { makeAdvanced } from '../shared/bots/advanced';
import { makeParams, type StoredParams } from '../shared/bots/advanced/params';
import type { GameAction, GameView } from '../shared/types';
import { loadCheckpoint, paramsOf } from './checkpoints';
import { drawScenario, type ScenarioFilter } from './scenarios';
import { playGame } from './sim';

/**
 * CPU per bot decision, overall and by phase, for the free Workers budget (about 10 ms per
 * request). Single-threaded, so the times are comparable between settings.
 */

/** Running hash of every action chosen: a speedup must leave it unchanged. */
class Fingerprint {
  value = 2166136261;
  add(action: GameAction): void {
    for (const ch of JSON.stringify(action)) this.value = Math.imul(this.value ^ ch.charCodeAt(0), 16777619);
  }
}

/** A brain that records how long each of its turn decisions takes, by phase. */
function timed(brain: Brain, times: Map<string, number[]>, print: Fingerprint, split: boolean): Brain {
  const note = (view: GameView, started: number) => {
    const list = times.get(view.phase) ?? [];
    list.push(performance.now() - started);
    times.set(view.phase, list);
  };
  return {
    ...brain,
    turn(view, options) {
      let thought: BotThought | undefined;
      for (let piece = 1; split; piece++) {
        const started = performance.now();
        const next = brain.think?.(view, thought);
        if (!next) break;
        const list = times.get(`piece ${piece}`) ?? [];
        list.push(performance.now() - started);
        times.set(`piece ${piece}`, list);
        thought = next;
      }
      const started = performance.now();
      const action = brain.turn(view, { ...options, thought });
      note(view, started);
      print.add(action);
      return action;
    },
  };
}

const at = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;

/** Plays games with these knobs in every seat and prints decision times (`split`: slow ones in pieces). */
export function moveCost(
  games: number,
  firstSeed: number,
  knobs: Record<string, number>,
  filter?: ScenarioFilter,
  split = false,
): void {
  const stored = paramsOf(loadCheckpoint('shipped')) as StoredParams;
  const brain = makeAdvanced(makeParams({ ...stored, knobs: { ...stored.knobs, ...knobs } }));
  const times = new Map<string, number[]>();
  const print = new Fingerprint();
  const seat = timed(brain, times, print, split);
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
  console.log(`actions fingerprint ${(print.value >>> 0).toString(16)}`);
}
