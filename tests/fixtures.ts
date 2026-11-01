import { addPlayer, applyAction, createGame, getActivePlayerId, getView } from '../shared/engine';
import { RESOURCES, type GameState, type ResourceBag } from '../shared/types';
export const TEST_NOW = 1_800_000_000_000;
export function seeded(seed = 42) { return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }; }
export function makeLobby(count = 3) {
  let game = createGame('HARBOR42', seeded());
  for (let i = 0; i < count; i++) game = addPlayer(game, { id: `p${i}`, name: `Player ${i}` });
  return game;
}
export function settled(count = 3) {
  let game = applyAction(makeLobby(count), 'p0', { type: 'start' }, seeded(), TEST_NOW);
  while (game.phase.startsWith('setup')) {
    const id = getActivePlayerId(game)!, legal = getView(game, id).legal;
    game = applyAction(game, id, game.phase === 'setup-settlement' ? { type: 'place-settlement', vertexId: legal.settlements[0] } : { type: 'place-road', edgeId: legal.roads[0] }, seeded(), TEST_NOW);
  }
  return game;
}
export function grant(game: GameState, id: string, bag: Partial<ResourceBag>) {
  const p = game.players.find(p => p.id === id)!;
  for (const r of RESOURCES) { const amount = bag[r] ?? 0; p.resources[r] += amount; game.bank[r] -= amount; }
}
export function conserved(game: GameState) { return RESOURCES.every(r => game.bank[r] >= 0 && game.players.every(p => p.resources[r] >= 0) && game.bank[r] + game.players.reduce((n, p) => n + p.resources[r], 0) === 19); }
