import { chartedNumbers, hexNumbers } from '../rules';
import { boardIndex, terrainResource } from '../seafaring';
import { addLog, BUILD_COSTS, type Handlers, needPhase, ownBoard, pay, requireRule, tally } from './core';
import { revealFog } from './fog';
import { chartHexes, legalMoves, peekHexes, splitCost, splitHexes } from './legal';

/** Relay stations, survey ships, peeks, charts, and splits. */
export const cartographersHandlers: Pick<
  Handlers,
  'build-relay' | 'build-survey' | 'peek-fog' | 'chart-hex' | 'split-hex'
> = {
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

  /** A ship out at sea becomes a survey ship and picks the tile it collects from for good. */
  'build-survey'({ next, player, playerId }, action) {
    needPhase(next, 'build', 'special-build');
    const legal = legalMoves(next, playerId);
    requireRule(
      legal.surveys.includes(action.edgeId),
      'Choose your ship out at sea, away from the pirate and from tiles another survey ship borders.',
    );
    requireRule(
      legal.surveyTargets.includes(action.hexId),
      'Choose a tile with a number, or a fog tile you peeked at that hides one.',
    );
    pay(next, player, BUILD_COSTS.survey);
    next.surveys.push(action.edgeId);
    next.surveyTargets[action.edgeId] = action.hexId;
    tally(next, playerId, 'built', 'survey');
    addLog(next, `${player.name} fitted out a survey ship.`, {
      kind: 'build',
      playerId,
      piece: 'survey',
      paid: BUILD_COSTS.survey,
    });
  },

  /** A lodestone to the bank to see what one fog tile hides. Everyone sees which tile; only you see what's there. */
  'peek-fog'({ next, player, playerId }, action) {
    needPhase(next, 'build');
    requireRule(peekHexes(next, player).includes(action.hexId), 'Choose a fog tile you haven’t peeked at.');
    pay(next, player, BUILD_COSTS.peek);
    next.fogPeeks[playerId] = [...(next.fogPeeks[playerId] ?? []), action.hexId];
    addLog(next, `${player.name} spent a lodestone to peek under the fog.`, {
      kind: 'peek',
      playerId,
      hexId: action.hexId,
    });
  },

  /** Lodestone to step one tile's number toward 7 (a 6 or 8 gains a 2 or 12 at random). */
  'chart-hex'({ next, player, playerId, random }, action) {
    needPhase(next, 'build');
    requireRule(chartHexes(next).includes(action.hexId), 'Choose a tile with a number that can still be charted.');
    pay(next, player, BUILD_COSTS.chart);
    ownBoard(next);
    const hex = boardIndex(next.board).hex.get(action.hexId)!;
    const [first, ...extra] = chartedNumbers(hexNumbers(hex), random() < 0.5)!;
    hex.number = first!;
    hex.extra = extra.length ? extra : undefined;
    addLog(next, `${player.name} charted a tile: it now pays on ${hexNumbers(hex).join(', ')}.`, {
      kind: 'chart',
      playerId,
      hexId: action.hexId,
      numbers: hexNumbers(hex),
    });
  },

  /** Lodestone and one card of a resource: the tile pays that resource too, at each owner's pick. */
  'split-hex'({ next, player, playerId }, action) {
    needPhase(next, 'build');
    requireRule(splitHexes(next).includes(action.hexId), 'Choose a resource tile with a number that isn’t split.');
    const own = terrainResource(boardIndex(next.board).hex.get(action.hexId)!.terrain);
    requireRule(action.resource !== own, 'Choose a different resource from the one the tile pays.');
    pay(next, player, splitCost(action.resource));
    ownBoard(next);
    boardIndex(next.board).hex.get(action.hexId)!.split = action.resource;
    addLog(next, `${player.name} split a tile: it pays ${own} or ${action.resource}.`, {
      kind: 'split',
      playerId,
      hexId: action.hexId,
      resource: action.resource,
    });
  },
};
