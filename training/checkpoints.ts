import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Net } from '../shared/bots/advanced/net';
import type { StoredParams } from '../shared/bots/advanced/params';
import type { BotLevel } from '../shared/types';
import type { Part, SeatSpec } from './jobs';

/**
 * Saved Advanced parameter sets. Each checkpoint names its parent, so training continues from
 * where the last run stopped (`--from <name>`) instead of starting over. Names that aren't files:
 *   default       the KNOBS defaults, no setup network
 *   shipped       shared/bots/advanced/weights.json (what the game plays)
 *   beginner, intermediate   the hand-written bots
 */

export interface Checkpoint {
  name: string;
  parent: string | null;
  createdAt: string;
  knobs: Record<string, number>;
  setupNet: Net | null;
  valueNet?: Net | null;
  /** Free-form record of how it was made and how it scored. */
  notes: string[];
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CHECKPOINTS = join(ROOT, 'training', 'checkpoints');
export const SHIPPED = join(ROOT, 'shared', 'bots', 'advanced', 'weights.json');
export const DATA = join(ROOT, 'training', 'data');

const LEVELS: BotLevel[] = ['beginner', 'intermediate'];

/**
 * Opponent styles for a varied field ("style:trader"): the shipped Advanced bot with knobs pushed
 * one way, so tuning can't win by exploiting one opponent's habits.
 */
export const STYLES: Record<string, Record<string, number>> = {
  /** Offers and accepts trades freely. */
  trader: { offersPerTurn: 3, tradeMargin: -0.05, partnerGain: 0, generousOffers: 1, tradeCutoff: 1 },
  /** Never offers, rarely accepts. */
  hoarder: { offersPerTurn: 0, counters: 0, tradeMargin: 0.4, partnerGain: 1.5 },
  /** Buys development cards and plays for Largest Army. */
  cards: { developmentValue: 3, spareDevelopment: 5, cityValue: 1.5, longestRoadReach: 0 },
  /** Roads and settlements first, chases Longest Road. */
  builder: { settlementValue: 3.5, spareRoads: 4, longestRoadReach: 4, developmentValue: 0.6, spareDevelopment: 0 },
};

export function loadCheckpoint(name: string): Checkpoint {
  if (name === 'default') return { name, parent: null, createdAt: '', knobs: {}, setupNet: null, notes: [] };
  if (name === 'shipped') {
    const w = JSON.parse(readFileSync(SHIPPED, 'utf8'));
    return {
      name,
      parent: null,
      createdAt: '',
      knobs: w.knobs ?? {},
      setupNet: w.setupNet ?? null,
      valueNet: w.valueNet ?? null,
      notes: [],
    };
  }
  const path = join(CHECKPOINTS, `${name}.json`);
  if (!existsSync(path)) throw new Error(`No checkpoint "${name}" (looked in training/checkpoints/).`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function saveCheckpoint(checkpoint: Checkpoint): string {
  mkdirSync(CHECKPOINTS, { recursive: true });
  const path = join(CHECKPOINTS, `${checkpoint.name}.json`);
  writeFileSync(path, `${JSON.stringify(checkpoint, null, 1)}\n`);
  return path;
}

export function listCheckpoints(): string[] {
  return existsSync(CHECKPOINTS)
    ? readdirSync(CHECKPOINTS)
        .filter(f => f.endsWith('.json'))
        .map(f => f.slice(0, -5))
    : [];
}

/**
 * A seat spec from a name: a bot level, a checkpoint, or a hybrid "base+with:part,part"
 * (e.g. "intermediate+shipped:setup" plays Intermediate with the shipped Advanced setup).
 */
export function seatFor(name: string): SeatSpec {
  const hybrid = /^(.+)\+(.+):(.+)$/.exec(name);
  if (hybrid)
    return {
      hybrid: { base: seatFor(hybrid[1]!), with: seatFor(hybrid[2]!), parts: hybrid[3]!.split(',') as Part[] },
    };
  if ((LEVELS as string[]).includes(name)) return { level: name as BotLevel };
  if (name.startsWith('style:')) {
    const style = STYLES[name.slice(6)];
    if (!style) throw new Error(`No style "${name}" (styles: ${Object.keys(STYLES).join(', ')}).`);
    const base = loadCheckpoint('shipped');
    return { advanced: { ...paramsOf(base), knobs: { ...base.knobs, ...style } } };
  }
  return { advanced: paramsOf(loadCheckpoint(name)) };
}

/** A checkpoint's parameters as an Advanced seat takes them. */
export function paramsOf(c: Checkpoint): StoredParams {
  return { knobs: c.knobs, setupNet: c.setupNet, valueNet: c.valueNet ?? null };
}

/** Write a checkpoint's parameters to the file the game ships with (rounded to keep it small). */
export function promote(checkpoint: Checkpoint): void {
  const round = (x: unknown): unknown =>
    typeof x === 'number' ? Number(x.toPrecision(5)) : Array.isArray(x) ? x.map(round) : x;
  const small = (net: Net | null | undefined) =>
    net && {
      ...net,
      mean: round(net.mean),
      scale: round(net.scale),
      layers: net.layers.map(l => ({ w: round(l.w), b: round(l.b) })),
    };
  const knobs = Object.fromEntries(Object.entries(checkpoint.knobs).map(([k, v]) => [k, round(v)]));
  const stored = {
    source: checkpoint.name,
    knobs,
    setupNet: small(checkpoint.setupNet),
    valueNet: small(checkpoint.valueNet),
  };
  writeFileSync(SHIPPED, `${JSON.stringify(stored)}\n`);
}
