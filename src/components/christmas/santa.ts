import { santaNetworks } from '../../../shared/engine';
import type { GameAction, GameView } from '../../../shared/types';
import type { SpotPicking } from '../knights/KnightPieces';

/** The North Pole's number came up on your roll: other players' networks to send Santa to. */
export function santaSpots(view: GameView, send: (action: GameAction) => void): SpotPicking | null {
  if (view.phase !== 'santa' || view.activePlayerId !== view.selfId) return null;
  const owner = (vertexId: string) => view.players.find(p => p.id === view.buildings[vertexId]?.playerId)?.name;
  return {
    vertices: [],
    edges: [],
    groups: santaNetworks(view, view.selfId).map(n => ({ id: n.vertexId, vertices: n.vertices, edges: n.edges })),
    hint: 'Tap another player’s roads and buildings: Santa brings them a resource',
    label: v => `Send Santa to ${owner(v)} at ${v}`,
    confirmText: v => `Santa to ${owner(v)}`,
    onPick: v => send({ type: 'send-santa', vertexId: v }),
  };
}
