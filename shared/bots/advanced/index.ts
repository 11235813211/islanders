import { BUILD_COSTS } from '../../engine/core';
import type { GameAction, GameView, TradeOffer } from '../../types';
import { linkAction } from '../analysis';
import { surveyMove } from '../cartographers';
import type { TileTuning } from '../charting';
import type { Brain, TurnOptions } from '../types';
import { valueBuild } from './choose';
import { discard, Economy, goldChoice } from './economy';
import { winningMove } from './endgame';
import { type AdvancedParams, TRAINED } from './params';
import { robberHex, stealTarget } from './robber';
import { selectStrategy } from './selector';
import { setupRoad, setupSettlement, thinkPlacement } from './setup';
import { type Strategy, withStrategy } from './strategy';
import { respond, review } from './trade';
import { bestCity, bestSettlement, buildStep, knightNow, towardTarget } from './turn';

/** What a bot may build in another player's special build phase (no trades or cards). */
const SPECIAL_BUILDS = new Set<GameAction['type']>([
  'build-city',
  'build-settlement',
  'build-road',
  'build-ship',
  'build-survey',
  'buy-development',
]);

/**
 * The Advanced bot. With a strategy selector (selector.ts), each decision is played by the brain
 * of the strategy the selector picks for that view; otherwise by the brain below.
 */
export function makeAdvanced(params: AdvancedParams): Brain {
  const selector = params.selector;
  const base = makeBrain(params);
  if (!selector) return base;
  const leaned = new Map<Strategy, Brain>();
  const pick = (view: GameView): Brain => {
    const s = selectStrategy(view, params.knobs, selector);
    if (!s) return base;
    let brain = leaned.get(s);
    if (!brain) {
      brain = makeBrain({ ...params, knobs: withStrategy(params.knobs, s), selector: null });
      leaned.set(s, brain);
    }
    return brain;
  };
  return {
    turn: (view, options) => pick(view).turn(view, options),
    think: (view, done) => pick(view).think!(view, done),
    discard: view => pick(view).discard(view),
    respond: (view, offer) => pick(view).respond(view, offer),
    review: (view, offer) => pick(view).review(view, offer),
    gold: view => pick(view).gold!(view),
    specialBuild: view => pick(view).specialBuild!(view),
    lodestoneReserve: view => pick(view).lodestoneReserve!(view),
    tiles: base.tiles,
  };
}

/**
 * One Advanced brain for fixed parameters. Setup uses a draft lookahead scored by a network trained on self-play
 * (setup.ts); the rest is a planner whose numbers (params.ts KNOBS) are tuned by self-play
 * against the Intermediate bot and earlier Advanced versions. Training lives in training/.
 */
function makeBrain(params: AdvancedParams): Brain {
  const { knobs } = params;
  const tiles: TileTuning = {
    rivalShare: knobs.chartRivalShare,
    futureRivals: knobs.chartFutureRivals,
    lodestoneTile: knobs.chartLodestoneTile,
    splitTrade: knobs.splitTrade >= 0.5,
  };
  return {
    turn(view: GameView, options: TurnOptions): GameAction {
      if (view.phase === 'setup-settlement') return setupSettlement(view, params, knobs.setupExplore, options.thought);
      if (view.phase === 'setup-road') return setupRoad(view, params);
      const econ = new Economy(view, knobs);
      switch (view.phase) {
        case 'roll':
          return knightNow(econ) ?? { type: 'roll' };
        case 'robber':
          return { type: 'move-robber', hexId: robberHex(econ) };
        case 'steal':
          return { type: 'steal', playerId: stealTarget(econ) };
        case 'free-roads':
          return (
            towardTarget(econ) ??
            linkAction(view, view.legal.roads[0] ?? view.legal.ships[0]) ?? { type: 'finish-free-roads' }
          );
        case 'build':
          return (
            winningMove(econ) ??
            (params.valueNet ? valueBuild(econ, params.valueNet, options) : buildStep(econ, options))
          );
        default:
          return { type: 'end-turn' };
      }
    },
    think: (view: GameView, done) => thinkPlacement(view, params, done),
    discard: (view: GameView) => discard(view, knobs),
    respond: (view: GameView, offer: TradeOffer) => respond(new Economy(view, knobs), offer),
    review: (view: GameView, offer: TradeOffer) => review(new Economy(view, knobs), offer),
    gold: (view: GameView) => goldChoice(view, knobs),
    // Saving for a survey ship it can reach: its lodestone stays off tiles and out of trades.
    lodestoneReserve: (view: GameView) =>
      knobs.surveyValue > 0 && new Economy(view, knobs).survey ? BUILD_COSTS.survey.lodestone : 0,
    tiles,
    specialBuild(view: GameView): GameAction {
      // Only building is allowed here: a city or settlement first, then what its turn would build.
      const econ = new Economy(view, knobs);
      if (view.legal.cities.length) return { type: 'build-city', vertexId: bestCity(econ) };
      if (view.legal.settlements.length) return { type: 'build-settlement', vertexId: bestSettlement(econ) };
      const survey = view.cartographers ? surveyMove(view, tiles) : null;
      if (survey) return survey;
      const step = buildStep(econ, { builds: 0, allowOffers: false });
      return SPECIAL_BUILDS.has(step.type) ? step : { type: 'end-turn' };
    },
  };
}

export const advanced: Brain = makeAdvanced(TRAINED);
