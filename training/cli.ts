import type { Knob } from '../shared/bots/advanced/params';
import { makeParams } from '../shared/bots/advanced/params';
import { getView } from '../shared/engine';
import { isLandVertex } from '../shared/seafaring';
import { listCheckpoints, loadCheckpoint, promote, seatFor } from './checkpoints';
import type { Kind } from './datasets';
import { endDiagnostics, type RouteLog, traceRoutes } from './diagnostics';
import { reportDisagreements } from './disagree';
import { pairedDifference, playMatch, report, summarize } from './evaluate';
import { runGauntlet } from './gauntlet';
import { brainFor, heroSeats, runJob, type SeatSpec } from './jobs';
import { collect, fitNetwork } from './networks';
import { runJobs } from './pool';
import { loadRecords, replayGame } from './replays';
import type { RolloutOptions } from './rollouts';
import { drawScenario, type ScenarioFilter } from './scenarios';
import { playGame } from './sim';
import { TUNABLE, tune } from './tune';

/**
 * Training commands (node training/run.mjs <command> --flag value). See training/README.md.
 * Common flags: --games N, --seed N (first seed), --maps id,id, --players 3,4, THREADS=n env.
 */

const [command, ...rest] = process.argv.slice(2);
export const flags: Record<string, string> = {};
for (let i = 0; i < rest.length; i++)
  if (rest[i]!.startsWith('--')) {
    const next = rest[i + 1];
    flags[rest[i]!.slice(2)] = next && !next.startsWith('--') ? next : 'true';
  }

const list = (value: string | undefined) => (value ? value.split(',').map(s => s.trim()) : undefined);
export function filterFromFlags(): ScenarioFilter | undefined {
  const maps = list(flags.maps);
  const players = list(flags.players)?.map(Number);
  return maps || players ? { maps, players } : undefined;
}

/** Apply --knobs '{"name":value}' on top of an Advanced seat. */
function withKnobs(seat: SeatSpec): SeatSpec {
  if (flags.knobs && 'hybrid' in seat) return { hybrid: { ...seat.hybrid, with: withKnobs(seat.hybrid.with) } };
  if (!flags.knobs || !('advanced' in seat)) return seat;
  return { advanced: { ...seat.advanced, knobs: { ...seat.advanced?.knobs, ...JSON.parse(flags.knobs) } } };
}

const COMMANDS: Record<string, () => Promise<void> | void> = {
  /** Time single-thread games (no workers) to check engine and bot speed. */
  profile() {
    const games = Number(flags.games ?? 10);
    const hero = withKnobs(seatFor(flags.hero ?? 'shipped'));
    const field = (list(flags.field) ?? ['intermediate']).map(seatFor);
    let total = 0;
    for (let i = 0; i < games; i++) {
      const r = runJob({
        seed: Number(flags.seed ?? 1) + i,
        hero,
        field,
        heroes: flags.heroes === 'half' ? 'half' : 1,
        filter: filterFromFlags(),
      });
      total += r.ms;
      console.log(
        r.scenario.padEnd(24),
        `${r.ms.toFixed(0)}ms`,
        r.steps,
        'steps',
        r.turns,
        'turns',
        'winner',
        r.winner,
        'hero',
        r.heroSeats,
      );
    }
    console.log(`avg ${(total / games).toFixed(0)}ms per game`);
  },

  /** Hero against a field: --hero shipped --field intermediate [--heroes half] [--by-map]. */
  async eval() {
    const hero = withKnobs(seatFor(flags.hero ?? 'shipped'));
    const field = (list(flags.field) ?? ['intermediate']).map(seatFor);
    const results = await playMatch(hero, field, {
      games: Number(flags.games ?? 400),
      firstSeed: Number(flags.seed ?? 100_000),
      filter: filterFromFlags(),
      heroes: flags.heroes === 'half' ? 'half' : 1,
      rotate: flags.rotate === 'true',
    });
    report(`${flags.hero ?? 'shipped'} vs ${flags.field ?? 'intermediate'}`, summarize(results), !!flags['by-map']);
    const stuck = results.filter(r => r.winner === null).map(r => `${r.scenario} seed ${r.seed} (turn ${r.turns})`);
    if (stuck.length) console.log(`unfinished: ${stuck.join(', ')}`);
  },
};

async function collectFor(kind: Kind, explore: number) {
  await collect(kind, {
    scorer: flags.scorer,
    rollouts: {
      rollouts: Number(flags.rollouts ?? 16),
      rounds: Number(flags.rounds ?? 4),
      rate: Number(flags.rate ?? 0.05),
    },
    from: flags.from ?? 'shipped',
    games: Number(flags.games ?? 2000),
    firstSeed: Number(flags.seed ?? 1),
    explore: Number(flags.explore ?? explore),
    out: flags.out ?? 'a',
    filter: filterFromFlags(),
  });
}

function fitFor(kind: Kind, hidden: string) {
  fitNetwork(kind, {
    from: flags.from ?? 'shipped',
    data: list(flags.data) ?? ['a'],
    name: flags.name ?? kind,
    hidden: flags.hidden === '0' ? [] : (list(flags.hidden) ?? [hidden]).map(Number),
    epochs: Number(flags.epochs ?? 30),
    fresh: flags.fresh === 'true',
    lambda: Number(flags.lambda ?? 0.7),
    moves: list(flags.moves),
  });
}

Object.assign(COMMANDS, {
  /** Replay saved games and check they end as recorded: --file records.json (from /api/records). */
  replays() {
    for (const record of loadRecords(flags.file ?? '')) {
      const end = replayGame(record);
      const ok = end.version === record.finalVersion && end.phase === 'finished';
      console.log(
        `${ok ? 'ok' : 'DIFFERS'}  ${record.steps.length} steps  ${end.players.length} players  turn ${end.turn}`,
      );
    }
  },
  /** Self-play recording starting positions: --from shipped --games 40000 --out r1 [--explore 0.35]. */
  'setup-collect': () => collectFor('setup', 0.35),
  /** Self-play recording positions during play: --from s1 --games 20000 --out v1 [--explore 0.1]. */
  'value-collect': () => collectFor('value', 0.1),
  /**
   * Move comparisons in --from's games, scored by --scorer's value network (default --from):
   * --from shipped --scorer w1 --games 4000 --out m1
   * [--rollouts 16 --rounds 4 --rate 0.05 (share of build decisions)].
   */
  'moves-collect': () => collectFor('moves', 0),
  /** Train the setup network: --from shipped --data r1,r2 --name s2 [--hidden 16] [--fresh]. */
  'setup-fit': () => fitFor('setup', '16'),
  /** Train the value network: --from s1 --data v1 --name v1 [--moves m1] [--hidden 32] [--fresh] [--lambda 0.7]. */
  'value-fit': () => fitFor('value', '32'),
  /**
   * Tune knobs by evolution strategies: --from shipped --name t1 [--generations 20 --pairs 8
   * --games 150 --sigma 0.08 --rate 0.03 --knobs a,b --field intermediate,shipped].
   */
  async tune() {
    const from = flags.from ?? 'shipped';
    await tune({
      from,
      name: flags.name ?? 'tuned',
      generations: Number(flags.generations ?? 20),
      pairs: Number(flags.pairs ?? 8),
      games: Number(flags.games ?? 150),
      sigma: Number(flags.sigma ?? 0.08),
      rate: Number(flags.rate ?? 0.03),
      knobs: (list(flags.knobs) as Knob[] | undefined) ?? TUNABLE,
      field: list(flags.field) ?? ['intermediate', 'intermediate', from, 'style:trader', 'style:hoarder'],
      firstSeed: Number(flags.seed ?? 5_000_000),
    });
  },
  /** Copy a checkpoint into shared/bots/advanced/weights.json (what the game plays): --name t1. */
  promote() {
    const checkpoint = loadCheckpoint(flags.name ?? '');
    promote(checkpoint);
    console.log(`promoted ${checkpoint.name}; run npm run format and the bot tests`);
  },
  /**
   * Paired comparison: --a s2 --b s1 [--games 1000 seeds] [--field intermediate]. Both heroes play
   * the very same games, each seed once per seat; prints A − B with its standard error.
   */
  async compare() {
    const field = (list(flags.field) ?? ['intermediate']).map(seatFor);
    const options = {
      games: Number(flags.games ?? 600),
      firstSeed: Number(flags.seed ?? 200_000),
      filter: filterFromFlags(),
      rotate: true,
    };
    const a = await playMatch(withKnobs(seatFor(flags.a ?? 'shipped')), field, options);
    const b = await playMatch(seatFor(flags.b ?? 'intermediate'), field, options);
    report(`A ${flags.a}`, summarize(a));
    report(`B ${flags.b}`, summarize(b));
    const p = pairedDifference(a, b);
    const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
    console.log(
      `A − B: wins ${pct(p.winDiff)} ±${pct(p.winErr)}, fitness ${p.fitDiff.toFixed(4)} ±${p.fitErr.toFixed(4)} (${p.seeds} seeds, ${p.games} games each)`,
    );
    for (const [size, s] of [...p.bySize].sort((x, y) => x[0] - y[0]))
      console.log(`  ${size} players: ${pct(s.diff)} over ${s.seeds} seeds`);
  },
  /** One game, inline, with a summary of where it ended: --seed 101941 --hero s1 [--field intermediate]. */
  replay() {
    const seed = Number(flags.seed ?? 1);
    const job = {
      seed,
      hero: withKnobs(seatFor(flags.hero ?? 'shipped')),
      field: (list(flags.field) ?? ['intermediate']).map(seatFor),
    };
    const scenario = drawScenario(seed, filterFromFlags());
    const heroes = heroSeats(job, scenario.players);
    let f = 0;
    const seats = Array.from({ length: scenario.players }, (_, i) =>
      heroes.includes(i) ? job.hero : job.field[f++ % job.field.length]!,
    );
    console.log(scenario.name, JSON.stringify(scenario.settings), 'hero', heroes);
    playGame(scenario, seats.map(brainFor), seed, {
      end(g) {
        console.log(
          `phase ${g.phase}, turn ${g.turn}, bank ${JSON.stringify(g.bank)}, deck ${g.developmentDeck.length}`,
        );
        const open = g.board.vertices.filter(
          v =>
            isLandVertex(g.board, v.id) &&
            !g.buildings[v.id] &&
            !v.edgeIds.some(id => {
              const e = g.board.edges.find(x => x.id === id)!;
              return g.buildings[e.a === v.id ? e.b : e.a];
            }),
        );
        console.log(`open land corners (distance rule only): ${open.length}`);
        for (const p of g.players) {
          const v = getView(g, p.id);
          const me = v.players.find(q => q.id === p.id)!;
          console.log(
            `${p.id}: ${me.points} pts, hand ${JSON.stringify(p.resources)}, left s${me.settlementsLeft} c${me.citiesLeft} r${me.roadsLeft} sh${me.shipsLeft}, road ${me.longestRoad}, knights ${p.knights}, cards ${p.development.length}`,
          );
        }
        console.log(
          g.log
            .slice(-12)
            .map(e => e.text)
            .join('\n'),
        );
      },
    });
  },
  /**
   * Where a seat's roads and ships went: --seed 5 --hero shipped [--maps new-board-3 --players 3].
   * Each piece with the target it headed for and how that target ended (ours, taken, open).
   */
  routes() {
    const seed = Number(flags.seed ?? 1);
    const scenario = drawScenario(seed, filterFromFlags());
    const spec = withKnobs(seatFor(flags.hero ?? 'shipped'));
    const log: RouteLog[] = [];
    const knobs = makeParams('advanced' in spec ? spec.advanced : {}).knobs;
    const brains = Array.from({ length: scenario.players }, (_, i) =>
      i === 0 ? traceRoutes(brainFor(spec), knobs, log) : brainFor(spec),
    );
    playGame(scenario, brains, seed, {
      end(g) {
        console.log(scenario.name, 'winner', g.winnerId, 'turn', g.turn);
        for (const r of log) {
          const b = r.target ? g.buildings[r.target] : undefined;
          const fate = !r.target ? '-' : !b ? 'open' : b.playerId === 'p0' ? 'ours' : `taken by ${b.playerId}`;
          const live = (g.roads[r.edge] ?? g.ships[r.edge]) ? '' : ' (moved)';
          console.log(
            `turn ${r.turn} ${r.why.padEnd(6)} target ${r.target ?? '-'} d${r.distance ?? '-'} → ${fate}${live}`,
          );
        }
        console.log(JSON.stringify(endDiagnostics(g)[0]));
      },
    });
  },
  /** How games spread over maps and table sizes: --games 10000 [--seed 1]. */
  scenarios() {
    const counts = new Map<string, number>();
    const games = Number(flags.games ?? 10000);
    for (let i = 0; i < games; i++) {
      const s = drawScenario(Number(flags.seed ?? 1) + i, filterFromFlags());
      counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
    }
    for (const [name, n] of [...counts].sort((a, b) => a[0].localeCompare(b[0])))
      console.log(name.padEnd(24), `${((n / games) * 100).toFixed(1)}%`);
  },
  /**
   * Pick among saved candidates on fresh seeds: --candidates t1-g5,t1-g10,t1 --baseline s1
   * [--games 600 --seed 400000]. Every candidate plays the same rotated games as the baseline;
   * prints each one's paired win difference with its standard error, best first.
   */
  async select() {
    const field = (list(flags.field) ?? ['intermediate']).map(seatFor);
    const options = {
      games: Number(flags.games ?? 600),
      firstSeed: Number(flags.seed ?? 400_000),
      filter: filterFromFlags(),
      rotate: true,
      quiet: true,
    };
    const baseline = await playMatch(seatFor(flags.baseline ?? 'shipped'), field, options);
    const rows: { name: string; diff: number; err: number; edge: number }[] = [];
    for (const name of list(flags.candidates) ?? []) {
      const results = await playMatch(seatFor(name), field, options);
      const p = pairedDifference(results, baseline);
      rows.push({ name, diff: p.winDiff, err: p.winErr, edge: summarize(results).edge });
      console.log(`${name}: ${(p.winDiff * 100).toFixed(2)}% ±${(p.winErr * 100).toFixed(2)}%`);
    }
    console.log(`baseline ${flags.baseline ?? 'shipped'}: edge ×${summarize(baseline).edge.toFixed(3)}`);
    for (const r of rows.sort((a, b) => b.diff - a.diff))
      console.log(
        `  ${r.name.padEnd(16)} ${(r.diff * 100).toFixed(2).padStart(6)}% ±${(r.err * 100).toFixed(2)}%  edge ×${r.edge.toFixed(3)}`,
      );
  },
  /**
   * The gauntlet (PLAN.md): --hero t3 [--baseline shipped] [--games 300 --base-games 200 --seed 900000]
   * [--only intermediate,mixed]. One row per opponent, all scenarios and base island at 4 players.
   */
  async gauntlet() {
    await runGauntlet({
      hero: withKnobs(seatFor(flags.hero ?? 'shipped')),
      baseline: flags.baseline ? seatFor(flags.baseline) : undefined,
      games: Number(flags.games ?? 300),
      baseGames: Number(flags['base-games'] ?? 200),
      firstSeed: Number(flags.seed ?? 900_000),
      filter: filterFromFlags(),
      only: list(flags.only),
    });
  },
  /**
   * Where a challenger's build decisions differ from the field's, and which choice wins more:
   * --base shipped --challenger shipped --knobs '{"planner":1}' [--games 300 --rate 0.1
   * --rollouts 16 --seed 600000 --maps base --players 4]. Knobs apply to the challenger.
   */
  async disagree() {
    const base = seatFor(flags.base ?? 'shipped');
    const jobs = Array.from({ length: Number(flags.games ?? 300) }, (_, i) => ({
      seed: Number(flags.seed ?? 600_000) + i,
      filter: filterFromFlags(),
      hero: base,
      field: [base],
      record: 'disagree' as const,
      challenger: withKnobs(seatFor(flags.challenger ?? 'shipped')),
      rollouts: {
        rollouts: Number(flags.rollouts ?? 16),
        rounds: Infinity,
        rate: Number(flags.rate ?? 0.1),
      } as RolloutOptions,
    }));
    const results = await runJobs(jobs, done => process.stderr.write(`  ${done}/${jobs.length} games\r`));
    reportDisagreements(results.flatMap(r => r.disagreements ?? []));
  },
  /** List checkpoints with their last note. */
  checkpoints() {
    for (const name of listCheckpoints()) console.log(name.padEnd(20), loadCheckpoint(name).notes.at(-1) ?? '');
  },
} satisfies Record<string, () => Promise<void> | void>);

const run = COMMANDS[command ?? ''];
if (!run) {
  console.log(`Commands: ${Object.keys(COMMANDS).join(', ')}`);
  process.exit(1);
}
await run();
