import { readFileSync, writeFileSync } from 'node:fs';
import type { Knob } from '../shared/bots/advanced/params';
import { makeParams } from '../shared/bots/advanced/params';
import { getView } from '../shared/engine';
import { isLandVertex } from '../shared/seafaring';
import { reportAwards } from './awards';
import { analyzeBench } from './bench-analysis';
import { reportBench } from './bench-report';
import { listCheckpoints, loadCheckpoint, promote, seatFor } from './checkpoints';
import type { Kind } from './datasets';
import { endDiagnostics, type RouteLog, traceRoutes } from './diagnostics';
import { reportDisagreements } from './disagree';
import { matchJobs, pairedDifference, playMatch, report, summarize } from './evaluate';
import { runGauntlet } from './gauntlet';
import { goalReport } from './goal-report';
import { brainFor, heroSeats, runJob, type SeatSpec } from './jobs';
import { askAuth, fetchRecords, SITE, saveLibrary } from './live';
import { collect, fitNetwork } from './networks';
import { reportPlacements } from './placements';
import { runJobs } from './pool';
import { raceCheck, raceCheckPeople } from './races';
import {
  type DecisionResult,
  decisionsAt,
  type Position,
  type RecordDecision,
  recordPositions,
  reportRecordDecisions,
} from './record-disagree';
import { loadRecords, replayGame } from './replays';
import type { RolloutOptions } from './rollouts';
import { drawScenario, type ScenarioFilter } from './scenarios';
import type { BenchJob, BenchPosition, BenchResult, PositionsJob } from './scorer-bench';
import { fitSelector } from './selector-fit';
import { playGame } from './sim';
import { reportStrategyChoices } from './strategy-search';
import { eventCollector, studyDumps, writeDump } from './study';
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
  const cartographers = flags.cartographers === 'true';
  // --settings '{"friendlyRobber":true,"discardLimit":10}' fixes room settings for every game.
  const settings = flags.settings ? JSON.parse(flags.settings) : undefined;
  return maps || players || cartographers || settings ? { maps, players, cartographers, settings } : undefined;
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
  /** Refresh training/boards/library.json from the live site ([ISLANDERS_AUTH=user:token] for the admin-only boards). */
  async boards() {
    console.log(await saveLibrary(flags.site ?? SITE, 'training/boards/library.json', process.env.ISLANDERS_AUTH));
  },
  /** Seat-by-seat table of dumped games (`replays --file f --dump dir`): records-study --dir dir. */
  'records-study'() {
    const rows = studyDumps(flags.dir ?? 'training/data/dumps');
    const keys = Object.keys(rows[0] ?? {});
    console.log(keys.join('\t'));
    for (const row of rows) console.log(keys.map(k => row[k]).join('\t'));
  },
  /** Award races in dumped games: records-awards [--dir training/data/dumps --only 24,26]. */
  'records-awards'() {
    reportAwards(flags.dir ?? 'training/data/dumps', list(flags.only)?.map(Number));
  },
  /** Save every record from the live site: records-fetch [--out file] [--site url]; asks for the login (or ISLANDERS_AUTH=user:token). */
  async 'records-fetch'() {
    const auth = await askAuth();
    const out = flags.out ?? 'training/data/records.json';
    const records = await fetchRecords(flags.site ?? SITE, auth);
    writeFileSync(out, JSON.stringify(records));
    console.log(`${records.length} records saved to ${out}`);
  },
  replays() {
    for (const [i, record] of loadRecords(flags.file ?? '').entries()) {
      const when = new Date(record.endedAt).toISOString().slice(0, 16);
      try {
        const collect = eventCollector();
        const end = replayGame(record, collect.onStep);
        if (flags.dump)
          writeDump(flags.dump, i, { ...record, final: end, events: collect.events, turns: collect.turns });
        const ok = end.version === record.finalVersion;
        console.log(
          `${i} ${when} ${ok ? 'ok' : 'DIFFERS'}  ${record.steps.length} steps  ${end.players.length} players  turn ${end.turn}`,
        );
      } catch (error) {
        console.log(`${i} ${when} FAILS  ${(error as Error).message}`);
      }
    }
  },
  /**
   * The person's moves in saved games with the position before each, for records-disagree:
   * records-positions --file records.json --out positions.json [--only 0,4]. Run it on the engine
   * the games were played on (a git worktree at that commit, if the rules changed since).
   */
  'records-positions'() {
    const only = list(flags.only)?.map(Number);
    const positions = loadRecords(flags.file ?? 'training/data/records.json').flatMap((record, i) => {
      if (only && !only.includes(i)) return [];
      try {
        return recordPositions(record, i);
      } catch (error) {
        console.log(`game ${i}: ${(error as Error).message}`);
        return [];
      }
    });
    writeFileSync(flags.out ?? 'positions.json', JSON.stringify(positions));
    console.log(`${positions.length} positions saved`);
  },
  /**
   * Where the person in saved games played otherwise than the bot, and which move won more in
   * rollouts: records-disagree --positions a.json,b.json (from records-positions) [--bot shipped
   * --rollouts 32 --top 25 --out file.json].
   */
  async 'records-disagree'() {
    const seat = withKnobs(seatFor(flags.bot ?? 'shipped'));
    const positions = (list(flags.positions) ?? []).flatMap(
      file => JSON.parse(readFileSync(file, 'utf8')) as Position[],
    );
    const decisions = decisionsAt(positions, seat, Number(flags.rollouts ?? 32));
    console.log(`${decisions.length} of ${positions.length} moves where the bot would have played otherwise`);
    const results = (
      await runJobs<RecordDecision, DecisionResult | null>(decisions, done =>
        process.stderr.write(`  ${done}/${decisions.length}\r`),
      )
    ).filter(r => r !== null);
    if (flags.out) writeFileSync(flags.out, JSON.stringify(results, null, 1));
    reportRecordDecisions(results, Number(flags.top ?? 25));
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
      // --seat n: the hero's seat, as eval --rotate plays it.
      seat: flags.seat === undefined ? undefined : Number(flags.seat),
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
  /** Starting picks of one bot in every seat: placements --hero shipped --games 200 [--maps ...]. */
  placements() {
    reportPlacements(
      Number(flags.games ?? 100),
      Number(flags.seed ?? 1),
      withKnobs(seatFor(flags.hero ?? 'shipped')),
      filterFromFlags(),
    );
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
  /**
   * The headroom probe (PLAN step 1): one searching seat (rollouts of --base) against --base:
   * [--seeds 50 --players 4 --screen 8 --confirm 32 --margin 1.5 --seed 1000000]. Each seed is
   * played once per seat. Prints the search seat's wins against fair share, and the same games
   * with --base in that seat (exactly fair when --base is the field).
   */
  async search() {
    const base = seatFor(flags.base ?? 'shipped');
    const filter = filterFromFlags() ?? { players: [4] };
    const match = {
      games: Number(flags.seeds ?? 50),
      firstSeed: Number(flags.seed ?? 1_000_000),
      filter,
      rotate: true,
    };
    const search = {
      screen: Number(flags.screen ?? 8),
      confirm: Number(flags.confirm ?? 32),
      margin: Number(flags.margin ?? 1.5),
    };
    const started = Date.now();
    const jobs = matchJobs(base, [base], match).map(job => ({ ...job, search }));
    const results = await runJobs(jobs, done =>
      process.stderr.write(`  ${done}/${jobs.length} games, ${((Date.now() - started) / 60000).toFixed(1)} min\r`),
    );
    const plain = await runJobs(matchJobs(base, [base], match));
    report(`search (${JSON.stringify(search)}) vs ${flags.base ?? 'shipped'}`, summarize(results), true);
    report(`${flags.base ?? 'shipped'} in the same seats`, summarize(plain));
    const p = pairedDifference(results, plain);
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    console.log(`search − plain: ${pct(p.winDiff)} ±${pct(p.winErr)} (${p.seeds} seeds)`);
    const stats = results.map(r => r.search!);
    const decisions = stats.reduce((n, s) => n + s.decisions, 0);
    const overrides = stats.reduce((n, s) => n + s.overrides, 0);
    const gain = stats.reduce((n, s) => n + s.gain, 0);
    console.log(
      `${decisions} decisions searched, ${pct(overrides / decisions)} changed the bot's move, ` +
        `confirmed gain ${pct(gain / Math.max(1, overrides))} per change; ${((Date.now() - started) / 60000).toFixed(1)} min`,
    );
  },
  /**
   * The strategy probe (PLAN.md Phase 1): one seat choosing whole-game strategies by rollouts
   * against --base: [--seeds 50 --players 4 --rollouts 24 --every 3 --margin 1 --rounds 0 --scorer w1 --seed 7000000 --out file].
   * Prints its wins against the same games with --base in that seat, and what it chose when.
   */
  async 'strategy-probe'() {
    const base = seatFor(flags.base ?? 'shipped');
    const match = {
      games: Number(flags.seeds ?? 50),
      firstSeed: Number(flags.seed ?? 7_000_000),
      filter: filterFromFlags() ?? { players: [4] },
      rotate: true,
    };
    const strategy = {
      rollouts: Number(flags.rollouts ?? 24),
      every: Number(flags.every ?? 3),
      margin: Number(flags.margin ?? 1),
      // --rounds 6 --scorer w1: stop rollouts after 6 rounds and score them with w1's value network.
      rounds: Number(flags.rounds ?? 0),
      scorer: flags.scorer ? (loadCheckpoint(flags.scorer).valueNet ?? null) : null,
    };
    const started = Date.now();
    const minutes = () => ((Date.now() - started) / 60000).toFixed(1);
    const jobs = matchJobs(base, [base], match).map(job => ({ ...job, strategy }));
    const results = await runJobs(jobs, done =>
      process.stderr.write(`  ${done}/${jobs.length} games, ${minutes()} min\r`),
    );
    const plain = await runJobs(matchJobs(base, [base], match));
    report(`strategy seat (${JSON.stringify(strategy)}) vs ${flags.base ?? 'shipped'}`, summarize(results), true);
    report(`${flags.base ?? 'shipped'} in the same seats`, summarize(plain));
    const p = pairedDifference(results, plain);
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
    console.log(`strategy − plain: ${pct(p.winDiff)} ±${pct(p.winErr)} (${p.seeds} seeds); ${minutes()} min`);
    reportStrategyChoices(results);
    if (flags.out)
      writeFileSync(
        flags.out,
        JSON.stringify(
          results.map(r => ({
            seed: r.seed,
            scenario: r.scenario,
            players: r.players,
            winner: r.winner,
            heroSeats: r.heroSeats,
            choices: r.strategyChoices,
          })),
        ),
      );
  },
  /** How well the rival model predicts next settlements: race-check [--games 100 --seed 8000000 --players 4]. */
  'race-check'() {
    // --positions a.json,b.json (records-positions): a person's settlements in saved games instead.
    const positions = list(flags.positions)?.flatMap(f => JSON.parse(readFileSync(f, 'utf8')) as Position[]);
    const r = positions
      ? raceCheckPeople(positions)
      : raceCheck(Number(flags.games ?? 100), Number(flags.seed ?? 8_000_000), filterFromFlags());
    const pct = (x: number) => `${((x / Math.max(1, r.settlements)) * 100).toFixed(1)}%`;
    console.log(
      `${r.settlements} settlements: model top 1 ${pct(r.top1)}, top 3 ${pct(r.top3)}; nearest corner ${pct(r.nearest)}; no prediction ${pct(r.unpredicted)}`,
    );
  },
  /** Train the strategy selector from strategy-probe output: --from r1 --data a.json,b.json --name sel1 [--hidden 0 --epochs 200]. */
  'selector-fit'() {
    const hidden = Number(flags.hidden ?? 0);
    fitSelector({
      from: flags.from ?? 'shipped',
      name: flags.name ?? 'selector',
      data: list(flags.data) ?? [],
      hidden: hidden ? [hidden] : [],
      epochs: Number(flags.epochs ?? 200),
    });
  },
  /** The planner's goal values and pace in one position: goal-report --seed 5 --turn 20 --seat 0 [--players 4]. */
  'goal-report'() {
    goalReport(Number(flags.seed ?? 5), Number(flags.turn ?? 20), Number(flags.seat ?? 0), filterFromFlags());
  },
  /**
   * Choice points from r1 self-play for the scorer benchmark, saved as states:
   * bench-positions [--games 100 --seed 7100000 --players 3 --every 3 --per-game 4 --out training/data/bench-positions.json].
   */
  async 'bench-positions'() {
    const filter = filterFromFlags() ?? { players: [3] };
    const jobs: PositionsJob[] = Array.from({ length: Number(flags.games ?? 100) }, (_, i) => ({
      positionsOf: {
        seed: Number(flags.seed ?? 7_100_000) + i,
        filter,
        every: Number(flags.every ?? 3),
        perGame: Number(flags['per-game'] ?? 4),
      },
    }));
    const positions = (await runJobs<PositionsJob, BenchPosition[]>(jobs)).flat();
    const out = flags.out ?? 'training/data/bench-positions.json';
    writeFileSync(out, JSON.stringify(positions));
    console.log(`${positions.length} positions saved to ${out}`);
  },
  /**
   * The scorer benchmark (PLAN.md Phase 3): scorer-bench --positions file [--rollouts 48
   * --cutoffs 2,4,6,10 --scorers w1,w1td --out results.json]; --results file reprints a saved run.
   */
  async 'scorer-bench'() {
    const cutoffs = (list(flags.cutoffs) ?? ['2', '4', '6', '10']).map(Number);
    const scorers = list(flags.scorers) ?? ['w1'];
    let results: BenchResult[];
    if (flags.results) results = JSON.parse(readFileSync(flags.results, 'utf8'));
    else {
      const positions = JSON.parse(
        readFileSync(flags.positions ?? 'training/data/bench-positions.json', 'utf8'),
      ) as BenchPosition[];
      const rollouts = Number(flags.rollouts ?? 48);
      const started = Date.now();
      results = await runJobs<BenchJob, BenchResult>(
        positions.map(position => ({ bench: { position, rollouts, cutoffs, scorers } })),
        done =>
          process.stderr.write(
            `  ${done}/${positions.length} positions, ${((Date.now() - started) / 60000).toFixed(1)} min\r`,
          ),
      );
      if (flags.out) writeFileSync(flags.out, JSON.stringify(results));
      const cpu = results.reduce((n, r) => n + r.ms, 0) / results.length / 1000;
      console.log(`${((Date.now() - started) / 60000).toFixed(1)} min, ${cpu.toFixed(1)} CPU-s per position`);
    }
    reportBench(results, cutoffs, scorers);
  },
  /**
   * What the saved benchmark and probes say without new games (ANALYSIS.md): bench-analysis
   * [--results training/data/bench-1.json --full strategy-probe-3.json --stopped strategy-probe-4.json].
   */
  'bench-analysis'() {
    const data = (name: string) => `training/data/${name}`;
    analyzeBench(
      JSON.parse(readFileSync(flags.results ?? data('bench-1.json'), 'utf8')) as BenchResult[],
      flags.full ?? data('strategy-probe-3.json'),
      flags.stopped ?? data('strategy-probe-4.json'),
    );
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
