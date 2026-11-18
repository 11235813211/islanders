import { writeFileSync } from 'node:fs';
import { makeAdvanced } from '../shared/bots/advanced';
import { Economy } from '../shared/bots/advanced/economy';
import { makeParams, type StoredParams } from '../shared/bots/advanced/params';
import { roadRace } from '../shared/bots/advanced/road-race';
import { getActivePlayerId, getView } from '../shared/engine';
import { type GameAction, type GameState, type GameView, RESOURCES } from '../shared/types';
import { loadCheckpoint, paramsOf } from './checkpoints';
import { outcome } from './override-study';
import { runJobs } from './pool';
import { drawScenario, type ScenarioFilter } from './scenarios';
import { determinize } from './search';
import { playGame, seeded } from './sim';

/**
 * When the shipped bot ends its turn holding usable cards, would something else be better? Each
 * available use (a road or ship, a development card, the most useful bank trade) is played out
 * against ending the turn, on the same resampled hidden facts and dice, with shipped bots after.
 */

export interface TurnEndJob {
  turnEnd: { seed: number; filter?: ScenarioFilter; perGame: number; rollouts: number };
}

export interface TurnEndRow {
  seed: number;
  players: number;
  stage: string;
  /** Cards held against the discard limit. */
  hand: string;
  option: string;
  diffs: number[];
}

/** The ways to use cards instead of ending this turn. */
function optionsAt(view: GameView, econ: Economy): { name: string; action: GameAction }[] {
  const out: { name: string; action: GameAction }[] = [];
  const edge = roadRace(econ).plans.find(
    p => view.legal.roads.includes(p.edge) || view.legal.ships.includes(p.edge),
  )?.edge;
  const link = edge ?? view.legal.roads[0] ?? view.legal.ships[0];
  if (link) {
    const type = view.legal.roads.includes(link) ? 'build-road' : 'build-ship';
    out.push({ name: edge ? 'road for length' : 'any road', action: { type, edgeId: link } });
  }
  if (view.legal.development) out.push({ name: 'development card', action: { type: 'buy-development' } });
  let trade: GameAction | null = null;
  let best = econ.handValue(view.hand);
  for (const give of RESOURCES) {
    if (view.hand[give] < view.tradeRates[give]) continue;
    for (const receive of RESOURCES) {
      if (receive === give || !econ.bankHas(receive)) continue;
      const hand = { ...view.hand };
      hand[give] -= view.tradeRates[give];
      hand[receive]++;
      const value = econ.handValue(hand);
      if (value > best) [best, trade] = [value, { type: 'trade', give, receive }];
    }
  }
  if (trade) out.push({ name: 'bank trade', action: trade });
  return out;
}

function handBucket(view: GameView): string {
  const cards = RESOURCES.reduce((n, r) => n + view.hand[r], 0);
  const limit = view.settings.discardLimit;
  return cards > limit ? 'over the limit' : cards >= limit - 1 ? 'near the limit' : 'safe';
}

/** One shipped game's end-of-turn decisions, each option played out (worker job). */
export function turnEndGame(job: TurnEndJob['turnEnd']): TurnEndRow[] {
  const stored = paramsOf(loadCheckpoint('shipped')) as StoredParams;
  const params = makeParams(stored);
  const brain = makeAdvanced(params);
  const knobs = { ...params.knobs, roadRace: 1, roadFrom: 25 };
  const scenario = drawScenario(job.seed, job.filter);
  const table = Array.from({ length: scenario.players }, () => brain);
  const found: { g: GameState; id: string; view: GameView; options: ReturnType<typeof optionsAt> }[] = [];
  playGame(scenario, table, job.seed, {
    beforeMove(g, seat) {
      const id = `p${seat}`;
      if (g.phase !== 'build' || g.tradeOffers.length || getActivePlayerId(g) !== id) return;
      const view = getView(g, id);
      if (brain.turn(view, { builds: 0, allowOffers: false }).type !== 'end-turn') return;
      const options = optionsAt(view, new Economy(view, knobs));
      if (options.length) found.push({ g, id, view, options });
    },
  });
  const random = seeded(job.seed ^ 0x2f6e2b1);
  for (let i = found.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [found[i], found[j]] = [found[j]!, found[i]!];
  }
  const rows: TurnEndRow[] = [];
  for (const d of found.slice(0, job.perGame)) {
    const leader = Math.max(...d.view.players.map(p => p.points));
    const stop: GameAction = { type: 'end-turn' };
    // A rare resampled position can leave a gold payout no bot can make: drop that sample.
    const play = (state: GameState, action: GameAction, mix: number) => {
      try {
        return outcome(state, d.id, action, table, mix);
      } catch {
        return null;
      }
    };
    const samples = Array.from({ length: job.rollouts }, (_, k) => {
      const mix = Math.imul(job.seed, 7919) ^ Math.imul(d.g.version, 104729) ^ Math.imul(k + 1, 2654435761);
      const state = determinize(d.g, d.id, seeded(mix ^ 0x5bd1e995));
      return { mix, state, base: play(state, stop, mix) };
    });
    for (const o of d.options) {
      const diffs: number[] = [];
      for (const s of samples) {
        const result = s.base === null ? null : play(s.state, o.action, s.mix);
        if (result !== null) diffs.push(result - s.base!);
      }
      if (!diffs.length) continue;
      rows.push({
        seed: job.seed,
        players: scenario.players,
        stage: leader < 5 ? 'early' : leader < 8 ? 'mid' : 'late',
        hand: handBucket(d.view),
        option: o.name,
        diffs,
      });
    }
  }
  return rows;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function line(name: string, rows: TurnEndRow[]): void {
  const values = rows.map(r => mean(r.diffs));
  const m = mean(values);
  const games = new Map<number, number>();
  values.forEach((v, i) => {
    games.set(rows[i]!.seed, (games.get(rows[i]!.seed) ?? 0) + v - m);
  });
  const se = Math.sqrt([...games.values()].reduce((n, x) => n + x * x, 0)) / values.length;
  console.log(
    `  ${name.padEnd(38)}${(m * 100).toFixed(1).padStart(6)} ±${(se * 100).toFixed(1).padEnd(4)} pp  (${rows.length})`,
  );
}

/** Runs the audit and prints each option's effect against ending the turn. */
export async function turnEndAudit(
  games: number,
  firstSeed: number,
  options: { filter?: ScenarioFilter; perGame: number; rollouts: number; out?: string },
): Promise<void> {
  const jobs: TurnEndJob[] = Array.from({ length: games }, (_, i) => ({
    turnEnd: { seed: firstSeed + i, filter: options.filter, perGame: options.perGame, rollouts: options.rollouts },
  }));
  const rows = (await runJobs<TurnEndJob, TurnEndRow[]>(jobs)).flat();
  if (options.out) writeFileSync(options.out, JSON.stringify(rows));
  const by = (key: (r: TurnEndRow) => string, least = 8) => {
    const groups = new Map<string, TurnEndRow[]>();
    for (const r of rows) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
    for (const [name, some] of [...groups].sort()) if (some.length >= least) line(name, some);
  };
  console.log('option instead of ending the turn, win share');
  by(r => r.option);
  console.log('by option and hand');
  by(r => `${r.option}, ${r.hand}`);
  console.log('by option and stage');
  by(r => `${r.option}, ${r.stage}`);
}
