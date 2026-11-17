import { readFileSync } from 'node:fs';
import type { Net } from '../shared/bots/advanced/net';
import { SELECTOR_INPUTS, type Selector, selectorInput } from '../shared/bots/advanced/selector';
import { STRATEGIES } from '../shared/bots/advanced/strategy';
import { type Checkpoint, loadCheckpoint, saveCheckpoint } from './checkpoints';
import { type Dataset, trainNet } from './mlp';
import type { StrategyChoice } from './strategy-search';

/**
 * Trains the strategy selector (shared/bots/advanced/selector.ts) from strategy-probe output: at
 * every recorded choice, each strategy's rollout win share minus the shipped play's is the label
 * (0.5 + difference / 2, so 0.5 means "no better"), and the position's seat summaries are the
 * inputs. One network per strategy; logistic regression unless --hidden says otherwise.
 */

interface ProbeGame {
  seed: number;
  choices?: StrategyChoice[];
}

export interface SelectorFitOptions {
  from: string;
  name: string;
  data: string[];
  hidden: number[];
  epochs: number;
}

/** Fit and save a checkpoint `from` + the selector; prints each network's loss against the baseline. */
export function fitSelector(options: SelectorFitOptions): void {
  const games = options.data.flatMap(file => JSON.parse(readFileSync(file, 'utf8')) as ProbeGame[]);
  const current = STRATEGIES.indexOf('current');
  const selector: Selector = {};
  const notes: string[] = [];
  for (const [s, strategy] of STRATEGIES.entries()) {
    if (strategy === 'current') continue;
    const rows: { x: number[]; y: number; group: number }[] = [];
    for (const game of games)
      for (const c of game.choices ?? []) {
        const mine = c.scores[s];
        const base = c.scores[current];
        if (mine == null || base == null || !c.features || !c.goals) continue;
        rows.push({ x: selectorInput(c.features, c.goals), y: 0.5 + (mine - base) / 2, group: game.seed });
      }
    if (rows.length < 50) {
      console.log(`${strategy}: ${rows.length} rows, skipped`);
      continue;
    }
    const result = trainNet(toDataset(rows), SELECTOR_INPUTS, {
      hidden: options.hidden,
      epochs: options.epochs,
      batch: 64,
      rate: 0.002,
      decay: 1e-3,
      validation: 0.2,
      seed: 7,
    });
    const mean = rows.reduce((n, r) => n + r.y, 0) / rows.length;
    const line = `${strategy}: ${rows.length} rows, mean advantage ${((mean - 0.5) * 2 * 100).toFixed(1)} pp, valid loss ${result.validLoss.toFixed(5)} vs base ${result.baseLoss.toFixed(5)}`;
    console.log(line);
    notes.push(line);
    selector[strategy] = result.net as Net;
  }
  const parent = loadCheckpoint(options.from);
  const checkpoint: Checkpoint = {
    ...parent,
    name: options.name,
    parent: options.from,
    createdAt: new Date().toISOString(),
    selector,
    notes: [...parent.notes, `${options.name}: selector on ${options.data.join('+')}; ${notes.join('; ')}`],
  };
  console.log(`saved ${saveCheckpoint(checkpoint)}`);
}

function toDataset(rows: { x: number[]; y: number; group: number }[]): Dataset {
  const width = rows[0]!.x.length;
  const x = new Float32Array(rows.length * width);
  rows.forEach((r, i) => {
    x.set(r.x, i * width);
  });
  return {
    x,
    y: Float32Array.from(rows, r => Math.min(1, Math.max(0, r.y))),
    group: Float64Array.from(rows, r => r.group),
    width,
    rows: rows.length,
  };
}
