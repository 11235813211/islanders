import { readFileSync, writeFileSync } from 'node:fs';
import type { Brain } from '../shared/bots';
import { makeAdvanced } from '../shared/bots/advanced';
import { Economy } from '../shared/bots/advanced/economy';
import { makeParams, type StoredParams } from '../shared/bots/advanced/params';
import { forecastRank, planChance } from '../shared/bots/advanced/plan-forecast';
import { canStart, rankedPlans } from '../shared/bots/advanced/plan-turn';
import { applyAction, getActivePlayerId, getView } from '../shared/engine';
import type { GameAction, GameState } from '../shared/types';
import { loadCheckpoint, paramsOf } from './checkpoints';
import { runJobs } from './pool';
import { drawScenario, type ScenarioFilter } from './scenarios';
import { determinize } from './search';
import { NOW, playGame, playOn, seeded } from './sim';

/**
 * Where a new idea disagrees with the shipped bot, who is right? In shipped self-play, each build
 * decision is shown to the shipped brain and to a variant. When their moves differ, both are
 * played out many times on the same resampled hidden facts and dice, with shipped bots afterward.
 * This judges single choices far more sharply than whole-game win rates, and says which kinds of
 * change help. It sees one move's worth, so plans that need follow-through are undervalued.
 */

export interface OverrideJob {
  override: {
    seed: number;
    filter?: ScenarioFilter;
    perGame: number;
    rollouts: number;
    variants: Record<string, Record<string, number>>;
  };
}

export interface OverrideRow {
  variant: string;
  seed: number;
  players: number;
  stage: string;
  shipped: string;
  other: string;
  /** Forecast chance of the variant's plan minus the shipped plan's (0 if not comparable). */
  forecastGap: number;
  /** Win share of the variant's move minus the shipped move's, per rollout. */
  diffs: number[];
}

const label = (a: GameAction) => a.type.replace('build-', '').replace('buy-', '').replace('place-', 'start ');
const OPTIONS = { builds: 0, allowOffers: false };

/** Whether `id` wins after `action`, played out by `table` on this seed's dice. */
export function outcome(g: GameState, id: string, action: GameAction, table: Brain[], mix: number): number {
  const random = seeded(mix);
  const next = applyAction(g, id, action, random, NOW);
  return playOn(next, table, random).state.winnerId === id ? 1 : 0;
}

/** How much better the forecast rates its preferred plan than the planner's. */
function forecastGap(econ: Economy): number {
  const plans = rankedPlans(econ);
  if (!plans[0]) return 0;
  const preferred = forecastRank(econ, plans, p => canStart(econ, p))[0]!;
  return planChance(econ, preferred) - planChance(econ, plans[0]);
}

/** One shipped game's disagreements, a few per variant, each played out both ways (worker job). */
export function overrideGame(job: OverrideJob['override']): OverrideRow[] {
  const stored = paramsOf(loadCheckpoint('shipped')) as StoredParams;
  const shipped = makeAdvanced(makeParams(stored));
  const scenario = drawScenario(job.seed, job.filter);
  const n = scenario.players;
  const table = Array.from({ length: n }, () => shipped);
  const variants = Object.entries(job.variants).map(([name, knobs]) => {
    const params = makeParams({ ...stored, knobs: { ...stored.knobs, ...knobs } });
    return { name, knobs: params.knobs, brain: makeAdvanced(params) };
  });
  const found = new Map<
    string,
    { g: GameState; id: string; a: GameAction; b: GameAction; gap: number; leader: number }[]
  >();
  playGame(scenario, table, job.seed, {
    beforeMove(g, seat) {
      const id = `p${seat}`;
      const placing = g.phase === 'setup-settlement';
      if ((g.phase !== 'build' && !placing) || g.tradeOffers.length || getActivePlayerId(g) !== id) return;
      const view = getView(g, id);
      const a = shipped.turn(view, OPTIONS);
      for (const v of variants) {
        const b = v.brain.turn(view, OPTIONS);
        if (JSON.stringify(a) === JSON.stringify(b)) continue;
        const gap = placing ? 0 : forecastGap(new Economy(view, v.knobs));
        const list = found.get(v.name) ?? [];
        list.push({ g, id, a, b, gap, leader: Math.max(...view.players.map(p => p.points)) });
        found.set(v.name, list);
      }
    },
  });
  const rows: OverrideRow[] = [];
  for (const [variant, list] of found) {
    const random = seeded(job.seed ^ 0x51ed27);
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j]!, list[i]!];
    }
    for (const d of list.slice(0, job.perGame)) {
      const diffs: number[] = [];
      for (let k = 0; k < job.rollouts; k++) {
        const mix = Math.imul(job.seed, 7919) ^ Math.imul(d.g.version, 104729) ^ Math.imul(k + 1, 2654435761);
        const sample = determinize(d.g, d.id, seeded(mix ^ 0x5bd1e995));
        diffs.push(outcome(sample, d.id, d.b, table, mix) - outcome(sample, d.id, d.a, table, mix));
      }
      rows.push({
        variant,
        seed: job.seed,
        players: n,
        stage: d.leader < 5 ? 'early' : d.leader < 8 ? 'mid' : 'late',
        shipped: label(d.a),
        other: label(d.b),
        forecastGap: d.gap,
        diffs,
      });
    }
  }
  return rows;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Mean of per-decision effects with an error clustered by game. */
function effect(rows: OverrideRow[]): string {
  const values = rows.map(r => mean(r.diffs));
  const m = mean(values);
  const byGame = new Map<number, number>();
  values.forEach((v, i) => {
    byGame.set(rows[i]!.seed, (byGame.get(rows[i]!.seed) ?? 0) + v - m);
  });
  const se = Math.sqrt([...byGame.values()].reduce((n, x) => n + x * x, 0)) / values.length;
  return `${(m * 100).toFixed(1).padStart(6)} ±${(se * 100).toFixed(1).padEnd(4)} pp  (${rows.length})`;
}

function table(title: string, rows: OverrideRow[], key: (r: OverrideRow) => string, least = 8): void {
  console.log(`  ${title}`);
  const groups = new Map<string, OverrideRow[]>();
  for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  for (const [name, some] of [...groups].sort((a, b) => b[1].length - a[1].length))
    if (some.length >= least) console.log(`    ${name.padEnd(30)}${effect(some)}`);
}

/** Runs the study and prints each variant's disagreements by kind. */
function report(rows: OverrideRow[], variants: string[]): void {
  for (const variant of variants) {
    const some = rows.filter(r => r.variant === variant);
    console.log(`\n${variant}: variant's move minus shipped move, win share: ${effect(some)}`);
    table('by change', some, r => `${r.shipped} → ${r.other}`);
    table('by change and stage', some, r => `${r.shipped} → ${r.other}, ${r.stage}`, 12);
    table('by stage', some, r => r.stage);
    table('by players', some, r => `${r.players} players`);
    table('by forecast gap', some, r =>
      r.forecastGap < 0.01 ? 'under 1 pp' : r.forecastGap < 0.03 ? '1 to 3 pp' : 'over 3 pp',
    );
  }
}

/** Reprints a saved study. */
export function overrideReport(file: string): void {
  const rows = JSON.parse(readFileSync(file, 'utf8')) as OverrideRow[];
  report(rows, [...new Set(rows.map(r => r.variant))]);
}

export async function overrideStudy(
  games: number,
  firstSeed: number,
  variants: Record<string, Record<string, number>>,
  options: { filter?: ScenarioFilter; perGame: number; rollouts: number; out?: string },
): Promise<void> {
  const jobs: OverrideJob[] = Array.from({ length: games }, (_, i) => ({
    override: {
      seed: firstSeed + i,
      filter: options.filter,
      perGame: options.perGame,
      rollouts: options.rollouts,
      variants,
    },
  }));
  const rows = (await runJobs<OverrideJob, OverrideRow[]>(jobs)).flat();
  if (options.out) writeFileSync(options.out, JSON.stringify(rows));
  report(rows, Object.keys(variants));
}
