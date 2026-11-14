import {
  addPlayer,
  applyAction,
  bankFor,
  cartographersRules,
  createGame,
  getActivePlayerId,
  getView,
} from '../shared/engine';
import { BASE_POOL, type BoardDesign, type FogMix } from '../shared/maps';
import { parseGrid } from '../shared/maps/builtin';
import { boardIndex } from '../shared/seafaring';
import { type GameAction, type GameState, type Hex, RESOURCES, type ResourceBag, type Terrain } from '../shared/types';
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

/** The design with every fog tile hiding this mix. */
export const withFogMix = <T extends { tiles: BoardDesign['tiles'] }>(design: T, mix: FogMix): T => ({
  ...design,
  tiles: design.tiles.map(t => (t.kind === 'fog' ? { ...t, fogMix: mix } : t)),
});

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

/**
 * Cartographers rules tests. Home island: wood 6 beside lodestone 5, then sheep 9 and wheat 8, then
 * gold 8, ore 10, and a volcano 4. Open sea to the east for ships and survey ships.
 */
export const CARTOGRAPHERS_DESIGN = testDesign([
  '~ ~ ~ ~ ~ ~ ~ ~',
  ' ~ w6 m5 ~ ~ ~ ~ ~',
  '~ s9 h8 ~ ~ ~ ~ ~',
  ' ~ g8 o10 v4 ~ ~ ~@ ~',
  '~ ~ ~ ~ ~ ~ ~ ~',
]);

/** Apply a move at TEST_NOW. */
export const act = (game: GameState, id: string, action: GameAction, random = seeded()) =>
  applyAction(game, id, action, random, TEST_NOW);

/** The first tile of this terrain. */
export const hexOf = (game: GameState, terrain: Terrain): Hex => game.board.hexes.find(h => h.terrain === terrain)!;

/** Random source returning these values in turn (random dice use floor(v * 6) + 1). */
export function sequence(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length]!;
}

/** A two-seat Cartographers game in the build phase with p0 to move. Tests place pieces directly. */
export function cartographersGame(): GameState {
  const game = inSeatOrder(applyAction(seaLobby(CARTOGRAPHERS_DESIGN, 2), 'p0', { type: 'start' }, seeded(), TEST_NOW));
  Object.assign(game, { phase: 'build', turn: 3, turnIndex: 0, setupIndex: 4, rollDeadline: null });
  game.settings.diceMode = 'random';
  return game;
}

/** Open sea edges (sea on both sides, away from the pirate). */
export function openSeaEdges(game: GameState): string[] {
  const index = boardIndex(game.board);
  return game.board.edges
    .filter(e => {
      const hexes = index.edgeHexes.get(e.id)!;
      return hexes.length === 2 && hexes.every(h => h.terrain === 'sea' && h.id !== game.pirate);
    })
    .map(e => e.id);
}

/**
 * A settlement for `playerId` on a free coast corner and the shortest line of its ships out to an
 * open sea edge (where a survey ship can go), at least `length` ships long. `town` is the
 * settlement, `edgeId` the last ship.
 */
export function shipsToOpenSea(game: GameState, playerId: string, length = 1) {
  const index = boardIndex(game.board);
  const open = new Set(openSeaEdges(game));
  const coast = game.board.vertices.filter(
    v =>
      !game.buildings[v.id] &&
      v.hexIds.some(id => index.hex.get(id)!.terrain !== 'sea') &&
      v.hexIds.some(id => index.hex.get(id)!.terrain === 'sea'),
  );
  let best: { town: string; path: string[] } | null = null;
  for (const start of coast) {
    const from = new Map<string, { vertex: string; edge: string }>();
    const queue = [start.id];
    const seen = new Set(queue);
    while (queue.length) {
      const vertex = queue.shift()!;
      for (const id of index.vertex.get(vertex)!.edgeIds) {
        const edge = index.edge.get(id)!;
        if (!index.edgeHexes.get(id)!.some(h => h.terrain === 'sea') || game.ships[id] || game.roads[id]) continue;
        const path = [id];
        for (let v = vertex; from.has(v); v = from.get(v)!.vertex) path.unshift(from.get(v)!.edge);
        if (open.has(id) && path.length >= length) {
          if (!best || path.length < best.path.length) best = { town: start.id, path };
          queue.length = 0;
          break;
        }
        const to = edge.a === vertex ? edge.b : edge.a;
        if (seen.has(to)) continue;
        seen.add(to);
        from.set(to, { vertex, edge: id });
        queue.push(to);
      }
    }
  }
  const { town, path } = best!;
  game.buildings[town] = { playerId, kind: 'settlement' };
  for (const id of path) game.ships[id] = playerId;
  return { town, edgeId: path.at(-1)!, path };
}
