import type { GameAction, GameView, TradeOffer } from '../../types';
import { linkAction } from '../analysis';
import type { Brain, TurnOptions } from '../types';
import { valueBuild } from './choose';
import { discard, Economy, goldChoice } from './economy';
import { type AdvancedParams, TRAINED } from './params';
import { robberHex, stealTarget } from './robber';
import { setupRoad, setupSettlement } from './setup';
import { respond, review } from './trade';
import { bestCity, bestSettlement, buildStep, knightNow, towardTarget } from './turn';

/**
 * The Advanced bot. Setup uses a draft lookahead scored by a network trained on self-play
 * (setup.ts); the rest is a planner whose numbers (params.ts KNOBS) are tuned by self-play
 * against the Intermediate bot and earlier Advanced versions. Training lives in training/.
 */
export function makeAdvanced(params: AdvancedParams): Brain {
  const { knobs } = params;
  return {
    turn(view: GameView, options: TurnOptions): GameAction {
      if (view.phase === 'setup-settlement') return setupSettlement(view, params, knobs.setupExplore);
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
          return params.valueNet ? valueBuild(econ, params.valueNet, options) : buildStep(econ, options);
        default:
          return { type: 'end-turn' };
      }
    },
    discard: (view: GameView) => discard(view, knobs),
    respond: (view: GameView, offer: TradeOffer) => respond(new Economy(view, knobs), offer),
    review: (view: GameView, offer: TradeOffer) => review(new Economy(view, knobs), offer),
    gold: (view: GameView) => goldChoice(view, knobs),
    specialBuild(view: GameView): GameAction {
      // Only building is allowed here: a city, then a settlement.
      const econ = new Economy(view, knobs);
      if (view.legal.cities.length) return { type: 'build-city', vertexId: bestCity(econ) };
      if (view.legal.settlements.length) return { type: 'build-settlement', vertexId: bestSettlement(econ) };
      return { type: 'end-turn' };
    },
  };
}

export const advanced: Brain = makeAdvanced(TRAINED);
