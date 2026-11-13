import { chartedNumbers, hexNumbers } from '../rules';
import { boardIndex } from '../seafaring';
import type { GameState } from '../types';
import {
  addLog,
  BUILD_COSTS,
  cartographersRules,
  type Handlers,
  needPhase,
  ownBoard,
  pay,
  requireRule,
  tally,
} from './core';
import { revealFog } from './fog';
import { chartHexes, legalMoves } from './legal';

/**
 * On a 7 in a Cartographers game, everyone with survey ships is owed one chart per ship. Counted
 * when the 7 is rolled (nothing can be built until charting is over), so the table sees it at once.
 */
export function owedCharts(state: GameState): Record<string, number> {
  if (!cartographersRules(state)) return {};
  const owed: Record<string, number> = {};
  for (const id of state.surveys) {
    const owner = state.ships[id];
    if (owner) owed[owner] = (owed[owner] ?? 0) + 1;
  }
  return owed;
}

/** The robber (or pirate) is done: chart if this 7 owes charts, otherwise back to what it interrupted. */
export function afterRobber(state: GameState): void {
  state.phase = Object.keys(state.pendingCharts).length ? 'charting' : (state.resumePhase ?? 'build');
  state.resumePhase = null;
}

/** Everyone has charted (or passed): the turn goes on. */
function finishCharting(state: GameState): void {
  state.pendingCharts = {};
  state.phase = 'build';
}

/** Relay stations, survey ships, and charting tiles' numbers. */
export const cartographersHandlers: Pick<Handlers, 'build-relay' | 'build-survey' | 'chart-hexes'> = {
  'build-relay'({ next, player, playerId }, action) {
    needPhase(next, 'build', 'special-build');
    requireRule(
      legalMoves(next, playerId).relays.includes(action.edgeId),
      'Choose an edge joined to your road, with nothing built at either end and no relay station beside it.',
    );
    pay(next, player, BUILD_COSTS.relay);
    next.roads[action.edgeId] = playerId;
    next.relays.push(action.edgeId);
    tally(next, playerId, 'built', 'relay');
    addLog(next, `${player.name} built a relay station.`, {
      kind: 'build',
      playerId,
      piece: 'relay',
      paid: BUILD_COSTS.relay,
    });
    revealFog(next, action.edgeId, playerId);
  },

  'build-survey'({ next, player, playerId }, action) {
    needPhase(next, 'build', 'special-build');
    requireRule(
      legalMoves(next, playerId).surveys.includes(action.edgeId),
      'Choose your ship out at sea, away from the pirate and from tiles another survey ship borders.',
    );
    pay(next, player, BUILD_COSTS.survey);
    next.surveys.push(action.edgeId);
    tally(next, playerId, 'built', 'survey');
    addLog(next, `${player.name} fitted out a survey ship.`, {
      kind: 'build',
      playerId,
      piece: 'survey',
      paid: BUILD_COSTS.survey,
    });
  },

  /** Off-turn: each player owed charts sends them all at once, in order; fewer (or none) passes the rest. */
  'chart-hexes'({ next, player, playerId, random }, action) {
    needPhase(next, 'charting');
    const owed = next.pendingCharts[playerId] ?? 0;
    requireRule(owed > 0, 'You have no charts to make.');
    requireRule(action.hexIds.length <= owed, `Choose up to ${owed} tile${owed === 1 ? '' : 's'}.`);
    if (action.hexIds.length) ownBoard(next);
    const index = boardIndex(next.board);
    for (const hexId of action.hexIds) {
      requireRule(chartHexes(next).includes(hexId), 'Choose a tile with a number that can still be charted.');
      const hex = index.hex.get(hexId)!;
      const [first, ...extra] = chartedNumbers(hexNumbers(hex), random() < 0.5)!;
      hex.number = first!;
      hex.extra = extra.length ? extra : undefined;
      addLog(next, `${player.name} charted a tile: it now pays on ${hexNumbers(hex).join(', ')}.`, {
        kind: 'chart',
        playerId,
        hexId,
        numbers: hexNumbers(hex),
      });
    }
    if (!action.hexIds.length) addLog(next, `${player.name} passed on charting.`);
    delete next.pendingCharts[playerId];
    if (!Object.keys(next.pendingCharts).length) finishCharting(next);
  },
};
