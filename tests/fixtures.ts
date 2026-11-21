import {
  addPlayer,
  applyAction,
  bankFor,
  cartographersRules,
  createGame,
  getActivePlayerId,
  getView,
  knightSites,
} from '../shared/engine';
import { BASE_POOL, type BoardDesign, type FogMix, setupSequence } from '../shared/maps';
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
  const rounds = game.setupOrder.length / ids.length;
  return { ...game, players, setupOrder: rounds ? setupSequence(ids, rounds) : [] };
}
export function makeLobby(count = 3) {
  let game = createGame('HARBOR42', seeded());
  game.settings.friendlyRobber = false; // Most rules tests expect the robber to hit anyone.
  for (let i = 0; i < count; i++) game = addPlayer(game, { id: `p${i}`, name: `Player ${i}` });
  return game;
}
export function settled(count = 3, lobby = makeLobby(count)) {
  let game = inSeatOrder(applyAction(lobby, 'p0', { type: 'start' }, seeded(), TEST_NOW));
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
/** A Cities & Knights game after setup (each player has a settlement and a city), p0 to roll. */
export function knightsGame(count = 3): GameState {
  const lobby = makeLobby(count);
  lobby.settings.citiesKnights = true;
  lobby.settings.victoryPoints = 13;
  return settled(count, lobby);
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
        bankFor(game.players.length, cartographersRules(game), !!game.ck)[r],
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
 * gold 8, ore 10, and a volcano 4. Open sea to the east for ships.
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

/** A four-seat Cities & Knights table in p0's build phase, with knights, a wall, cards, and commodities. */
export function knightsTable(): GameState {
  const g = knightsGame(4);
  g.testMode = true;
  g.phase = 'build';
  g.rollDeadline = null;
  g.turnDeadline = Date.now() + 120_000;
  grant(g, 'p0', { wood: 2, brick: 3, sheep: 3, wheat: 3, ore: 3, paper: 3, cloth: 2, coin: 4 });
  const ck = g.ck!;
  ck.barbarian = 4;
  ck.event = 'politics';
  ck.improvements.p0 = { trade: 1, politics: 2, science: 0 };
  ck.improvements.p1 = { trade: 0, politics: 0, science: 3 };
  // One more road for p0, so there is room for another knight.
  const index = boardIndex(g.board);
  const open = (end: string) =>
    index.vertex.get(end)!.edgeIds.find(e => {
      const edge = index.edge.get(e)!;
      return !g.roads[e] && !g.buildings[edge.a === end ? edge.b : edge.a];
    });
  const end = knightSites(g, 'p0').find(open)!;
  g.roads[open(end)!] = 'p0';
  const [a, b] = knightSites(g, 'p0');
  ck.knights[a!] = { playerId: 'p0', level: 1, active: false, activeTurn: -1, promotedTurn: -1 };
  ck.knights[b!] = { playerId: 'p0', level: 2, active: true, activeTurn: -1, promotedTurn: -1 };
  const p1Spot = knightSites(g, 'p1')[0]!;
  ck.knights[p1Spot] = { playerId: 'p1', level: 3, active: true, activeTurn: -1, promotedTurn: -1 };
  const city = Object.entries(g.buildings).find(([, x]) => x.playerId === 'p1' && x.kind === 'city')![0];
  ck.walls.push(city);
  ck.metropolis.science = city;
  ck.hands.p0 = [
    { id: 'c1', kind: 'merchant' },
    { id: 'c2', kind: 'resource-monopoly' },
    { id: 'c3', kind: 'warlord' },
    { id: 'c4', kind: 'master-merchant' },
  ];
  ck.hands.p1 = [{ id: 'c5', kind: 'spy' }];
  return g;
}
