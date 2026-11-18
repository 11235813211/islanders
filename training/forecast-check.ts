import { Economy } from '../shared/bots/advanced/economy';
import { forecast } from '../shared/bots/advanced/forecast';
import { type Net, predict, seatChances } from '../shared/bots/advanced/net';
import { makeParams } from '../shared/bots/advanced/params';
import { forecastStart } from '../shared/bots/advanced/plan-forecast';
import { finalSetupFeatures } from '../shared/bots/advanced/setup';
import { seatFeatures, seatPositions } from '../shared/bots/advanced/value';
import { getActivePlayerId, getView } from '../shared/engine';
import { victoryPoints } from '../shared/rules';
import type { GameState } from '../shared/types';
import { loadCheckpoint, paramsOf } from './checkpoints';
import { brainFor } from './jobs';
import { drawScenario, type ScenarioFilter } from './scenarios';
import { playGame } from './sim';

/**
 * Does the forecast (shared/bots/advanced/forecast.ts) predict games? Before it steers any move,
 * it should know who wins about as well as the value network, and how fast seats really score.
 * Plays shipped-bot games and scores predictions made at the end of setup and every few turns.
 */

interface Row {
  stage: string;
  players: number;
  won: number;
  forecast: number;
  other: number;
}

interface Pace {
  atFive: [number | null, number | null];
  atSeven: [number | null, number | null];
  finish: [number, number | null];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const brier = (p: number, y: number) => (p - y) ** 2;

const stageOf = (leader: number) => (leader < 5 ? 'early' : leader < 8 ? 'mid' : 'late');

function correlation(pairs: [number, number][]): number {
  const [mx, my] = [mean(pairs.map(p => p[0])), mean(pairs.map(p => p[1]))];
  let [xy, xx, yy] = [0, 0, 0];
  for (const [x, y] of pairs) {
    xy += (x - mx) * (y - my);
    xx += (x - mx) ** 2;
    yy += (y - my) ** 2;
  }
  return xx && yy ? xy / Math.sqrt(xx * yy) : 0;
}

/** Plays the games and prints how well the forecast did against the networks. */
export function forecastCheck(
  games: number,
  firstSeed: number,
  filter?: ScenarioFilter,
  knobs: Record<string, number> = {},
): void {
  const shipped = paramsOf(loadCheckpoint('shipped'));
  const params = makeParams({ ...shipped, knobs: { ...shipped.knobs, ...knobs } });
  const brain = brainFor({ advanced: shipped });
  const valueNet = loadCheckpoint('w1').valueNet as Net;
  const rows: Row[] = [];
  const paces: Pace[] = [];
  for (let i = 0; i < games; i++) {
    const seed = firstSeed + i;
    const scenario = drawScenario(seed, filter);
    const n = scenario.players;
    const pending: Omit<Row, 'won'>[][] = Array.from({ length: n }, () => []);
    const opening: { atFive: number | null; atSeven: number | null; finish: number }[] = [];
    const reached: { five: number | null; seven: number | null }[] = Array.from({ length: n }, () => ({
      five: null,
      seven: null,
    }));
    let firstTurn = -1;
    let lastTurn = -1;
    const econFor = (g: GameState, seat: number) => new Economy(getView(g, `p${seat}`), params.knobs);
    playGame(
      scenario,
      Array.from({ length: n }, () => brain),
      seed,
      {
        beforeMove(g) {
          if (g.phase !== 'roll') return;
          if (firstTurn < 0) {
            firstTurn = g.turn;
            for (let s = 0; s < n; s++) {
              const start = forecastStart(econFor(g, s));
              const f = forecast(start);
              opening.push(f.seats[s]!);
              const features = finalSetupFeatures(getView(g, `p${s}`), params);
              pending[s]!.push({
                stage: 'after setup',
                players: n,
                forecast: f.chances[s]!,
                other: params.setupNet ? predict(params.setupNet, features) : 1 / n,
              });
            }
          }
          const rounds = (g.turn - firstTurn) / n;
          g.players.forEach((p, s) => {
            const points = victoryPoints(g, p.id);
            const r = reached[s]!;
            if (r.five === null && points >= 5) r.five = rounds;
            if (r.seven === null && points >= 7) r.seven = rounds;
          });
          if (g.turn === lastTurn || (g.turn - firstTurn) % (3 * n) !== 0) return;
          lastTurn = g.turn;
          const seat = Number(getActivePlayerId(g)!.slice(1));
          const econ = econFor(g, seat);
          const chance = seatChances(valueNet, seatFeatures(econ, seatPositions(econ)))[0]!;
          pending[seat]!.push({
            stage: stageOf(Math.max(...econ.view.players.map(p => p.points))),
            players: n,
            forecast: forecast(forecastStart(econ)).chances[seat]!,
            other: chance,
          });
        },
        end(g) {
          const winner = g.players.findIndex(p => p.id === g.winnerId);
          const total = (g.turn - firstTurn) / n;
          pending.forEach((list, s) => {
            for (const row of list) rows.push({ ...row, won: s === winner ? 1 : 0 });
            const o = opening[s];
            if (!o) return;
            paces.push({
              atFive: [o.atFive, reached[s]!.five],
              atSeven: [o.atSeven, reached[s]!.seven],
              finish: [o.finish, s === winner ? total : null],
            });
          });
        },
      },
    );
  }
  console.log(`${games} games, ${rows.length} predictions`);
  console.log('stage          count   Brier: even   forecast   network   (setup network after setup, w1 later)');
  for (const stage of ['after setup', 'early', 'mid', 'late']) {
    const some = rows.filter(r => r.stage === stage);
    if (!some.length) continue;
    const score = (p: (r: Row) => number) =>
      mean(some.map(r => brier(p(r), r.won)))
        .toFixed(4)
        .padStart(10);
    console.log(
      `${stage.padEnd(13)}${String(some.length).padStart(7)}   ${score(r => 1 / r.players)}${score(r => r.forecast)}${score(r => r.other)}`,
    );
  }
  const report = (name: string, pick: (p: Pace) => [number | null, number | null]) => {
    const pairs = paces.map(pick).filter((x): x is [number, number] => x[0] !== null && x[1] !== null);
    const miss = mean(pairs.map(([a, b]) => a - b));
    const abs = mean(pairs.map(([a, b]) => Math.abs(a - b)));
    console.log(
      `${name.padEnd(22)}${String(pairs.length).padStart(6)} seats; forecast − actual ${miss.toFixed(1)} rounds, typical miss ${abs.toFixed(1)}, correlation ${correlation(pairs).toFixed(2)}`,
    );
  };
  console.log('\nforecast at the end of setup against what happened');
  report('rounds to 5 points', p => p.atFive);
  report('rounds to 7 points', p => p.atSeven);
  report('rounds to win (winner)', p => p.finish);
}
