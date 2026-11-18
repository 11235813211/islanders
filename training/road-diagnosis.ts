import { Economy } from '../shared/bots/advanced/economy';
import { makeParams } from '../shared/bots/advanced/params';
import { planScore } from '../shared/bots/advanced/plans';
import { roadRace } from '../shared/bots/advanced/road-race';
import { getActivePlayerId, getView } from '../shared/engine';
import { longestRoad } from '../shared/rules';
import { loadCheckpoint, paramsOf } from './checkpoints';
import { brainFor } from './jobs';
import { drawScenario, type ScenarioFilter } from './scenarios';
import { playGame } from './sim';

/**
 * Does the Longest Road race (shared/bots/advanced/road-race.ts) believe true things? One seat
 * plays with `roadRace` at the given weight, the others as shipped. On each of its build turns we
 * record what the model promises, then compare with how the game went. Weight 0 plays the shipped
 * bot and still records the model's opinion, which shows what happens without trying.
 */

interface Row {
  players: number;
  stage: string;
  turn: number;
  left: number;
  actualLeft: number;
  base: number;
  chance: number;
  arrive: number;
  keep: number;
  pieces: number;
  length: number;
  /** The road plan outranks everything else this turn. */
  top: boolean;
  ratio: number;
  reached: boolean;
  roundsToLength: number | null;
  held: boolean;
  won: boolean;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(5);

function playArm(weight: number, games: number, firstSeed: number, filter?: ScenarioFilter): Row[] {
  const shipped = paramsOf(loadCheckpoint('shipped'));
  const base = brainFor({ advanced: shipped });
  const hero = brainFor({ advanced: { ...shipped, knobs: { ...shipped.knobs, roadRace: weight } } });
  const knobs = makeParams({ ...shipped, knobs: { ...shipped.knobs, roadRace: Math.max(weight, 1) } }).knobs;
  const rows: Row[] = [];
  for (let i = 0; i < games; i++) {
    const seed = firstSeed + i;
    const scenario = drawScenario(seed, filter);
    const n = scenario.players;
    const seat = seed % n;
    const id = `p${seat}`;
    const lengths: { turn: number; length: number }[] = [];
    const open: Omit<Row, 'actualLeft' | 'reached' | 'roundsToLength' | 'held' | 'won'>[] = [];
    let last = -1;
    playGame(
      scenario,
      Array.from({ length: n }, (_, s) => (s === seat ? hero : base)),
      seed,
      {
        beforeMove(g) {
          if (g.phase !== 'build' || getActivePlayerId(g) !== id || g.turn === last) return;
          last = g.turn;
          lengths.push({ turn: g.turn, length: longestRoad(g, id) });
          const econ = new Economy(getView(g, id), knobs);
          const { left, base: without, options } = roadRace(econ).summary();
          const best = options.reduce<(typeof options)[number] | null>(
            (b, o) => (!b || o.chance > b.chance ? o : b),
            null,
          );
          if (!best) return;
          const score = (kind: boolean) =>
            Math.max(0, ...econ.plans.filter(p => (p.kind === 'road') === kind).map(p => planScore(econ, p)));
          const [road, other] = [score(true), score(false)];
          const leader = Math.max(...econ.view.players.map(p => p.points));
          open.push({
            players: n,
            stage: leader < 5 ? 'early' : leader < 8 ? 'mid' : 'late',
            turn: g.turn,
            left,
            base: without,
            ...best,
            top: road > other,
            ratio: other ? road / other : 0,
          });
        },
        end(g) {
          const held = g.longestRoadId === id;
          const won = g.winnerId === id;
          lengths.push({ turn: g.turn, length: longestRoad(g, id) });
          for (const row of open) {
            const hit = lengths.find(l => l.turn >= row.turn && l.length >= row.length);
            rows.push({
              ...row,
              actualLeft: (g.turn - row.turn) / n,
              reached: !!hit,
              roundsToLength: hit ? (hit.turn - row.turn) / n : null,
              held,
              won,
            });
          }
        },
      },
    );
  }
  return rows;
}

function report(name: string, rows: Row[]): void {
  const top = rows.filter(r => r.top);
  console.log(
    `\n${name}: ${rows.length} turns with a road option; road ranked first on ${pct(top.length / rows.length)}`,
  );
  console.log(
    `  rounds left: model ${mean(rows.map(r => r.left)).toFixed(1)}, actual ${mean(rows.map(r => r.actualLeft)).toFixed(1)}`,
  );
  for (const stage of ['early', 'mid', 'late']) {
    const s = rows.filter(r => r.stage === stage);
    if (s.length)
      console.log(
        `    ${stage.padEnd(6)} ${String(s.length).padStart(5)} turns: model ${mean(s.map(r => r.left)).toFixed(1)}, actual ${mean(s.map(r => r.actualLeft)).toFixed(1)}, road first ${pct(s.filter(r => r.top).length / s.length)}`,
      );
  }
  console.log('  promised chance of ending with the award, against what happened');
  console.log('    chance   turns  mean promised  reached length  held at end  won');
  for (const [lo, hi] of [
    [0, 0.2],
    [0.2, 0.4],
    [0.4, 0.6],
    [0.6, 0.8],
    [0.8, 1.01],
  ] as const) {
    const s = rows.filter(r => r.chance >= lo && r.chance < hi);
    if (!s.length) continue;
    const rate = (f: (r: Row) => boolean) => pct(s.filter(f).length / s.length);
    console.log(
      `    ${pct(lo)}+ ${String(s.length).padStart(7)} ${pct(mean(s.map(r => r.chance))).padStart(14)} ${rate(r => r.reached).padStart(15)} ${rate(r => r.held).padStart(12)} ${rate(r => r.won).padStart(5)}`,
    );
  }
  const parts = (s: Row[], label: string) => {
    const timed = s.filter(r => r.roundsToLength !== null);
    const reachedHeld = s.filter(r => r.reached);
    console.log(
      `  ${label.padEnd(18)} promised arrive ${pct(mean(s.map(r => r.arrive)))} vs reached ${pct(s.filter(r => r.reached).length / Math.max(1, s.length))}; ` +
        `promised keep ${pct(mean(s.map(r => r.keep)))} vs held once reached ${pct(reachedHeld.filter(r => r.held).length / Math.max(1, reachedHeld.length))}; ` +
        `pieces ${mean(s.map(r => r.pieces)).toFixed(1)}; rounds to reach ${mean(timed.map(r => r.roundsToLength!)).toFixed(1)}; base ${pct(mean(s.map(r => r.base)))}`,
    );
  };
  parts(rows, 'every option');
  if (top.length) parts(top, 'road ranked first');
}

/** Prints the model's promises against the outcomes, with and without acting on them. */
export function roadDiagnosis(weight: number, games: number, firstSeed: number, filter?: ScenarioFilter): void {
  report('shipped play (model only watches)', playArm(0, games, firstSeed, filter));
  report(`roadRace ${weight}`, playArm(weight, games, firstSeed, filter));
}
