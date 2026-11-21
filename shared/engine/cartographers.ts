import { chartedNumbers, chartScorer, fullyCharted, hexNumbers } from '../rules';
import { boardIndex, terrainResource } from '../seafaring';
import { type GameState, isTileResource, type Player } from '../types';
import { addLog, BUILD_COSTS, type Handlers, needPhase, ownBoard, pay, requireRule, tally } from './core';
import { revealFog } from './fog';
import { chartHexes, legalMoves, peekHexes, splitCost, splitHexes } from './legal';

/** Relay stations, peeks, charts, and splits. */
export const cartographersHandlers: Pick<Handlers, 'build-relay' | 'peek-fog' | 'chart-hex' | 'split-hex'> = {
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

  /** Lodestone to step one tile's number toward 7 (see chartedNumbers). */
  'chart-hex'({ next, player }, action) {
    needPhase(next, 'build');
    requireRule(chartHexes(next).includes(action.hexId), 'Choose a tile with a number that can still be charted.');
    pay(next, player, BUILD_COSTS.chart);
    chartHex(next, player, action.hexId);
  },

  /** A lodestone and one card of a resource: the tile pays that resource too, at each owner's pick. */
  'split-hex'({ next, player, playerId }, action) {
    needPhase(next, 'build');
    requireRule(splitHexes(next).includes(action.hexId), 'Choose a resource tile with a number that isn’t split.');
    const own = terrainResource(boardIndex(next.board).hex.get(action.hexId)!.terrain);
    requireRule(action.resource !== own, 'Choose a different resource from the one the tile pays.');
    const added = action.resource;
    requireRule(added !== 'lodestone', 'A split can’t add lodestone.');
    requireRule(isTileResource(added), 'A split adds a resource a tile can pay.');
    pay(next, player, splitCost(added));
    ownBoard(next);
    boardIndex(next.board).hex.get(action.hexId)!.split = added;
    addLog(next, `${player.name} split a tile: it pays ${own} or ${action.resource}.`, {
      kind: 'split',
      playerId,
      hexId: action.hexId,
      resource: action.resource,
    });
  },
};

/** One chart step on a tile, logged for everyone, saying who a full tile now scores for. */
function chartHex(next: GameState, player: Player, hexId: string): void {
  ownBoard(next);
  const hex = boardIndex(next.board).hex.get(hexId)!;
  const [first, ...extra] = chartedNumbers(hexNumbers(hex))!;
  hex.number = first!;
  hex.extra = extra.length ? extra : undefined;
  const numbers = hexNumbers(hex).join(', ');
  let text = `${player.name} charted a tile: it now pays on ${numbers}.`;
  if (fullyCharted(hex)) {
    const scorer = next.players.find(p => p.id === chartScorer(next, hex));
    const result = scorer ? `${scorer.name} scores 1 point.` : 'No one scores it yet.';
    text = `${player.name} finished charting a tile: it now pays on ${numbers}. ${result}`;
  }
  addLog(next, text, { kind: 'chart', playerId: player.id, hexId, numbers: hexNumbers(hex) });
}
