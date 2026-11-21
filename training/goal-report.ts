import { BOTS } from '../shared/bots';
import { Economy } from '../shared/bots/advanced/economy';
import { basePace, incomeValue } from '../shared/bots/advanced/goals';
import { TRAINED } from '../shared/bots/advanced/params';
import { horizon, planScore } from '../shared/bots/advanced/plans';
import { cornerYield } from '../shared/bots/advanced/value';
import { getView } from '../shared/engine';
import { TILE_RESOURCES } from '../shared/types';
import { drawScenario, type ScenarioFilter } from './scenarios';
import { playGame } from './sim';

/** A corner's pips by resource initial (w b s h o, g for gold), for reading the report. */
function yieldOf(econ: Economy, vertexId: string | undefined): string {
  if (!vertexId) return '';
  const y = cornerYield(econ, vertexId);
  const letters = { wood: 'w', brick: 'b', sheep: 's', wheat: 'h', ore: 'o', lodestone: 'l' } as const;
  const parts = TILE_RESOURCES.filter(r => y.production[r]).map(r => `${letters[r]}${y.production[r]}`);
  if (y.choice) parts.push(`g${y.choice}`);
  return parts.join(' ');
}

/**
 * How the shipped planner values its goals in one position, with the seat's pace (goals.ts) and
 * each settlement goal's income valued by pace, to read the numbers by eye: a shipped-bot game is
 * stopped at the start of `seat`'s turn on or after `turn`, and the seat's best goals are listed.
 */
export function goalReport(seed: number, turn: number, seat: number, filter?: ScenarioFilter): void {
  const scenario = drawScenario(seed, filter);
  const brains = Array.from({ length: scenario.players }, () => BOTS.advanced.brain);
  let done = false;
  playGame(scenario, brains, seed, {
    beforeMove(state) {
      if (done || state.phase !== 'roll' || state.turn < turn || state.players[state.turnIndex]!.id !== `p${seat}`)
        return;
      done = true;
      const view = getView(state, `p${seat}`);
      const econ = new Economy(view, TRAINED.knobs);
      const { pace, rate } = basePace(econ);
      console.log(
        `${scenario.name}, turn ${state.turn}, p${seat}: ${econ.self.points} points, hand ${JSON.stringify(view.hand)}`,
      );
      console.log(`pips ${TILE_RESOURCES.map(r => `${r} ${econ.production[r]}`).join(', ')}, gold ${econ.choicePips}`);
      console.log(
        `pace ${rate.toFixed(3)} points/round, rates ${JSON.stringify(pace.rates)}, rounds left ${horizon(econ).rounds.toFixed(1)}`,
      );
      const ranked = [...econ.plans].sort((a, b) => planScore(econ, b) - planScore(econ, a)).slice(0, 12);
      for (const p of ranked) {
        const byPace =
          p.vertexId && p.kind !== 'city'
            ? ` (by pace ${incomeValue(econ, cornerYield(econ, p.vertexId), econ.geo.harbor[econ.geo.indexOf.get(p.vertexId)!], 0).toFixed(2)})`
            : '';
        console.log(
          `  ${p.kind.padEnd(11)} ${(p.vertexId ?? '').padEnd(8)} ${yieldOf(econ, p.vertexId).padEnd(14)} payoff ${p.payoff.toFixed(2)} score ${planScore(econ, p).toFixed(3)}${byPace}`,
        );
      }
    },
  });
}
