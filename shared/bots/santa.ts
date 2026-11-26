import type { GameAction, GameView } from '../types';

/**
 * Where a bot sends Santa: to the rival with the fewest public points (the gift helps the leaders
 * least there), at their first building in board order.
 */
export function santaChoice(view: GameView): GameAction {
  const owned = Object.entries(view.buildings).filter(([, b]) => b.playerId !== view.selfId);
  const points = (id: string) => view.players.find(p => p.id === id)?.publicPoints ?? 0;
  const [vertexId] = owned.reduce((best, entry) =>
    points(entry[1].playerId) < points(best[1].playerId) ? entry : best,
  );
  return { type: 'send-santa', vertexId };
}
