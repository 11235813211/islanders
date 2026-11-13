import {
  addPlayer,
  applyAction,
  bankFor,
  cartographersRules,
  createGame,
  getActivePlayerId,
  getView,
} from '../shared/engine';
import { BASE_POOL, type BoardDesign } from '../shared/maps';
import { parseGrid } from '../shared/maps/builtin';
import { type GameAction, type GameState, RESOURCES, type ResourceBag } from '../shared/types';
export const TEST_NOW = 1_800_000_000_000;
export function seeded(seed = 42) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}
/**
 * Start shuffles seats; most rules tests are written for p0, p1, … taking turns in that order.
 * Puts those seats back in number order (other seats after them) and redoes the setup snake.
 */
export function inSeatOrder(game: GameState): GameState {
  const rank = (id: string) => (/^p\d+$/.test(id) ? Number(id.slice(1)) : Number.MAX_SAFE_INTEGER);
  const players = [...game.players].sort((a, b) => rank(a.id) - rank(b.id));
  const ids = players.map(p => p.id);
  return { ...game, players, setupOrder: game.setupOrder.length ? [...ids, ...[...ids].reverse()] : [] };
}
export function makeLobby(count = 3) {
  let game = createGame('HARBOR42', seeded());
  game.settings.friendlyRobber = false; // Most rules tests expect the robber to hit anyone.
  for (let i = 0; i < count; i++) game = addPlayer(game, { id: `p${i}`, name: `Player ${i}` });
  return game;
}
export function settled(count = 3) {
  let game = inSeatOrder(applyAction(makeLobby(count), 'p0', { type: 'start' }, seeded(), TEST_NOW));
  while (game.phase.startsWith('setup')) {
    const id = getActivePlayerId(game)!,
      legal = getView(game, id).legal;
    game = applyAction(
      game,
      id,
      game.phase === 'setup-settlement'
        ? { type: 'place-settlement', vertexId: legal.settlements[0] }
        : { type: 'place-road', edgeId: legal.roads[0] },
      seeded(),
      TEST_NOW,
    );
  }
  return game;
}
export function grant(game: GameState, id: string, bag: Partial<ResourceBag>) {
  const p = game.players.find(p => p.id === id)!;
  for (const r of RESOURCES) {
    const amount = bag[r] ?? 0;
    p.resources[r] += amount;
    game.bank[r] -= amount;
  }
}
export function conserved(game: GameState) {
  return RESOURCES.every(
    r =>
      game.bank[r] >= 0 &&
      game.players.every(p => p.resources[r] >= 0) &&
      game.bank[r] + game.players.reduce((n, p) => n + p.resources[r], 0) ===
        bankFor(game.players.length, cartographersRules(game))[r],
  );
}

export function richGame() {
  const g = settled(4);
  g.testMode = true;
  g.phase = 'build';
  g.rollDeadline = null;
  g.turnDeadline = Date.now() + 120_000;
  grant(g, 'p0', { wood: 5, brick: 5, sheep: 5, wheat: 5, ore: 5 });
  g.players[0].development = [
    { id: 'knight-ui', kind: 'knight', boughtTurn: 0 },
    { id: 'monopoly-ui', kind: 'monopoly', boughtTurn: 0 },
  ];
  return g;
}

/** A lobby set to a designed map (the server normally looks the design up by id). */
export function seaLobby(design: BoardDesign, count = 3, seed = 42) {
  return applyAction(makeLobby(count), 'p0', { type: 'choose-map', mapId: design.id }, seeded(seed), TEST_NOW, {
    design,
  });
}

/** A small hand-drawn sea map for rules tests. `rows` use the token grid in shared/maps/builtin.ts. */
export function testDesign(rows: string[], extra: Partial<BoardDesign> = {}): BoardDesign {
  return {
    id: 'test-map',
    name: 'Test map',
    categoryId: 'seafaring',
    description: '',
    players: { min: 2, max: 4 },
    victoryPoints: 13,
    ...parseGrid(rows),
    harbors: [],
    pool: { ...BASE_POOL },
    harborExclude: [],
    updatedAt: 0,
    ...extra,
  };
}

/** Corner `corner` (0–5, see Hex.vertexIds) of the hex at (q, r). */
export function corner(game: GameState, q: number, r: number, index: number): string {
  return game.board.hexes.find(h => h.q === q && h.r === r)!.vertexIds[index]!;
}

/** The edge joining two corners. */
export function edgeBetween(game: GameState, a: string, b: string): string {
  return game.board.edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a))!.id;
}

/** A sea-map game past setup, every seat placing on the first legal spot (ships when no road fits). */
export function seaSettled(design: BoardDesign, count = 3) {
  let game = inSeatOrder(applyAction(seaLobby(design, count), 'p0', { type: 'start' }, seeded(), TEST_NOW));
  while (game.phase.startsWith('setup')) {
    const id = getActivePlayerId(game)!;
    const legal = getView(game, id).legal;
    const action: GameAction =
      game.phase === 'setup-settlement'
        ? { type: 'place-settlement', vertexId: legal.settlements[Math.floor(legal.settlements.length / 3)]! }
        : legal.ships.length
          ? { type: 'place-ship', edgeId: legal.ships[0]! }
          : { type: 'place-road', edgeId: legal.roads[0]! };
    game = applyAction(game, id, action, seeded(), TEST_NOW);
  }
  return game;
}
