import { describe, expect, it } from 'vitest';
import { advanceTime, applyAction, getView, NORTH_POLE_NUMBERS, normalizeGame, santaNetworks } from '../shared/engine';
import { CLASSIC_RESOURCES, type GameState } from '../shared/types';
import { makeLobby, seeded, sequence, settled, TEST_NOW } from './fixtures';

/** A settled Christmas game with the North Pole, p0 about to roll. */
function christmas(count = 3): GameState {
  const lobby = makeLobby(count);
  lobby.settings.northPole = true;
  lobby.settings.diceMode = 'random';
  const g = settled(count, lobby);
  g.turnIndex = 0;
  g.phase = 'roll';
  return g;
}
/** p0 rolls `a` + `b` (random dice read floor(v * 6) + 1). */
const roll = (g: GameState, a: number, b: number) =>
  applyAction(g, 'p0', { type: 'roll' }, sequence((a - 1) / 6 + 0.01, (b - 1) / 6 + 0.01, 0.5), TEST_NOW);
const total = (g: GameState) => (r: (typeof CLASSIC_RESOURCES)[number]) =>
  g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0);

describe('the North Pole', () => {
  it('is an island of its own above the map, with a number never 6, 7, or 8, only when the room turns it on', () => {
    const g = christmas();
    const pole = g.northPole!;
    const hex = g.board.hexes.find(h => h.id === pole.hexId)!;
    expect(hex.r).toBe(Math.min(...g.board.hexes.map(h => h.r)));
    const others = g.board.hexes.filter(h => h !== hex);
    // Across water: no other tile beside it, and none of its corners shared.
    expect(
      others.some(
        h => Math.max(Math.abs(h.q - hex.q), Math.abs(h.r - hex.r), Math.abs(h.q + h.r - hex.q - hex.r)) <= 1,
      ),
    ).toBe(false);
    expect(g.board.vertices.filter(v => v.hexIds.includes(hex.id)).every(v => v.hexIds.length === 1)).toBe(true);
    // The desert stays a desert, and the robber never goes to the Pole.
    expect(others.filter(h => h.terrain === 'desert')).toHaveLength(1);
    expect(NORTH_POLE_NUMBERS).toContain(pole.number);
    expect(getView(g, 'p1').northPole).toEqual(pole);
    g.phase = 'robber';
    expect(getView(g, 'p0').legal.robberHexes).not.toContain(pole.hexId);
    expect(settled(3).northPole).toBeNull();
    const look = makeLobby(3);
    look.settings.christmas = true;
    expect(settled(3, look).northPole).toBeNull();
  });

  it('offers each rival network of buildings and roads as one pick, split where another building sits', () => {
    const g = christmas(3);
    const networks = santaNetworks(g, 'p0');
    // After setup, each rival has two settlements, each with its road.
    expect(networks.map(n => n.playerId).sort()).toEqual(['p1', 'p1', 'p2', 'p2']);
    for (const n of networks) {
      expect(n.vertices).toEqual([n.vertexId]);
      expect(n.edges).toHaveLength(1);
      expect(g.board.edges.find(e => e.id === n.edges[0])).toSatisfy(
        (e: { a: string; b: string }) => e.a === n.vertexId || e.b === n.vertexId,
      );
    }
    // A road on from p1's road's far end joins that network.
    const first = networks.find(n => n.playerId === 'p1')!;
    const road = g.board.edges.find(e => e.id === first.edges[0])!;
    const far = road.a === first.vertexId ? road.b : road.a;
    const next = g.board.edges.find(e => e.id !== road.id && (e.a === far || e.b === far) && !g.roads[e.id])!;
    g.roads[next.id] = 'p1';
    expect(
      santaNetworks(g, 'p0')
        .find(n => n.vertexId === first.vertexId)!
        .edges.sort(),
    ).toEqual([road.id, next.id].sort());
    // A p2 settlement on the far corner cuts p1's road off there.
    g.buildings[far] = { playerId: 'p2', kind: 'settlement' };
    expect(santaNetworks(g, 'p0').find(n => n.vertexId === first.vertexId)!.edges).toEqual([road.id]);
  });

  it('nobody settles on its corners, in setup or after', () => {
    const g = christmas(4);
    const corners = new Set(g.board.hexes.find(h => h.id === g.northPole!.hexId)!.vertexIds);
    expect(Object.keys(g.buildings).some(v => corners.has(v))).toBe(false);
    for (const p of g.players) expect(getView(g, p.id).legal.settlements.some(v => corners.has(v))).toBe(false);
  });

  it('on its number, the roller sends Santa to another player’s building, who gets one standard resource', () => {
    let g = christmas();
    g.northPole = { ...g.northPole!, number: 4 };
    g = roll(g, 1, 3);
    expect(g.phase).toBe('santa');
    const own = Object.keys(g.buildings).find(v => g.buildings[v]!.playerId === 'p0')!;
    expect(() => applyAction(g, 'p0', { type: 'send-santa', vertexId: own }, seeded(), TEST_NOW)).toThrow(/another/);
    expect(() => applyAction(g, 'p0', { type: 'end-turn' }, seeded(), TEST_NOW)).toThrow();
    const target = Object.keys(g.buildings).find(v => g.buildings[v]!.playerId === 'p2')!;
    const before = { ...g.players[2]!.resources };
    const wood = total(g)('wood');
    const next = applyAction(g, 'p0', { type: 'send-santa', vertexId: target }, seeded(), TEST_NOW);
    expect(next.phase).toBe('build');
    const event = next.log.at(-1)!.event;
    expect(event).toMatchObject({ kind: 'santa', playerId: 'p0', targetId: 'p2', vertexId: target });
    const resource = (event as { resource: (typeof CLASSIC_RESOURCES)[number] }).resource;
    expect(CLASSIC_RESOURCES).toContain(resource);
    expect(next.players[2]!.resources[resource]).toBe(before[resource] + 1);
    expect(total(next)('wood')).toBe(wood);
  });

  it('gives only a resource the bank still has, and nothing when the five are gone', () => {
    let g = christmas();
    g.northPole = { ...g.northPole!, number: 4 };
    g = roll(g, 2, 2);
    const target = Object.keys(g.buildings).find(v => g.buildings[v]!.playerId === 'p1')!;
    for (const r of CLASSIC_RESOURCES) g.bank[r] = r === 'ore' ? 1 : 0;
    const one = applyAction(g, 'p0', { type: 'send-santa', vertexId: target }, seeded(), TEST_NOW);
    expect(one.log.at(-1)!.event).toMatchObject({ resource: 'ore' });
    g.bank.ore = 0;
    const none = applyAction(g, 'p0', { type: 'send-santa', vertexId: target }, seeded(), TEST_NOW);
    expect(none.log.at(-1)!.text).toMatch(/nothing left/);
    expect(none.phase).toBe('build');
  });

  it('when time runs out, Santa goes to the rival with the fewest points', () => {
    let g = christmas();
    g.northPole = { ...g.northPole!, number: 4 };
    g.bonusPoints = { p1: 3 };
    g = roll(g, 1, 3);
    expect(g.robberDeadline).toBe(TEST_NOW + g.settings.decisionSeconds * 1000);
    const next = advanceTime(g, g.robberDeadline!, seeded());
    expect(next.phase).toBe('build');
    expect(next.log.at(-1)!.event).toMatchObject({ kind: 'santa', targetId: 'p2' });
  });

  it('other numbers leave Santa home', () => {
    let g = christmas();
    g.northPole = { ...g.northPole!, number: 4 };
    g = roll(g, 3, 3);
    expect(g.phase).not.toBe('santa');
  });

  it('old rooms load without a North Pole', () => {
    const g = settled(3) as Partial<GameState>;
    delete g.northPole;
    g.schemaVersion = 34;
    expect(normalizeGame(g as GameState).northPole).toBeNull();
  });
});

describe('Christmas settings go together by default', () => {
  const configure = (g: GameState, settings: Partial<GameState['settings']>) =>
    applyAction(g, 'p0', { type: 'configure', settings: { ...g.settings, ...settings } }, seeded(), TEST_NOW);

  it('the look brings Christmas pieces and the North Pole, and off takes them away', () => {
    const on = configure(makeLobby(3), { christmas: true });
    expect(on.settings).toMatchObject({ christmas: true, pieceStyle: 'gingerbread', northPole: true });
    const off = configure(on, { christmas: false });
    expect(off.settings).toMatchObject({ christmas: false, pieceStyle: 'classic', northPole: false });
  });

  it('Christmas pieces bring the look; then pieces and look change on their own', () => {
    const pieces = configure(makeLobby(3), { pieceStyle: 'gingerbread' });
    expect(pieces.settings).toMatchObject({ christmas: true, pieceStyle: 'gingerbread', northPole: true });
    const chalet = configure(pieces, { pieceStyle: 'chalet' });
    expect(chalet.settings).toMatchObject({ christmas: true, pieceStyle: 'chalet' });
    const noPole = configure(chalet, { northPole: false });
    expect(noPole.settings.northPole).toBe(false);
    // Set in the same change, a style is kept.
    const both = configure(makeLobby(3), { christmas: true, pieceStyle: 'korean' });
    expect(both.settings).toMatchObject({ christmas: true, pieceStyle: 'korean' });
  });
});
