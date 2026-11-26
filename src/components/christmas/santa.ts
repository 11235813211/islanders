import { santaTargets } from '../../../shared/engine';
import type { GameAction, GameView } from '../../../shared/types';
import type { SpotPicking } from '../knights/KnightPieces';

/** The North Pole's number came up on your roll: another player's buildings to send Santa to. */
export function santaSpots(view: GameView, send: (action: GameAction) => void): SpotPicking | null {
  if (view.phase !== 'santa' || view.activePlayerId !== view.selfId) return null;
  const owner = (vertexId: string) => view.players.find(p => p.id === view.buildings[vertexId]?.playerId)?.name;
  return {
    vertices: santaTargets(view, view.selfId),
    edges: [],
    hint: 'Pick another player’s building: Santa brings them a resource',
    label: v => `Send Santa to ${owner(v)} at ${v}`,
    onPick: v => send({ type: 'send-santa', vertexId: v }),
  };
}
