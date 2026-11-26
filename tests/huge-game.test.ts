import { describe, expect, it } from 'vitest';
import { generateBoard } from '../shared/board';
import { PLAYER_COLORS } from '../shared/colors';
import {
  addPlayer,
  applyAction,
  emptyBag,
  getActivePlayerId,
  getView,
  MAX_PLAYERS,
  normalizeGame,
} from '../shared/engine';
import type { GameAction, GameState } from '../shared/types';
import { playBotGame } from './bot-harness';
import { grant, makeLobby, seeded, settled, TEST_NOW } from './fixtures';

const act = (g: GameState, id: string, action: GameAction) => applyAction(g, id, action, seeded(), TEST_NOW);
const neighbours = (a: { q: number; r: number }, b: { q: number; r: number }) =>
  Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r)) === 1;

/** An eight-player game in p0's build phase, hands empty. */
function eightAtBuild(): GameState {
  const g = settled(8);
  g.phase = 'build';
  g.turnIndex = 0;
  g.rollDeadline = null;
  for (const p of g.players)
    for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) p.resources[r] = 0;
  g.bank = { wood: 30, brick: 30, sheep: 30, wheat: 30, ore: 30, lodestone: 0, paper: 0, cloth: 0, coin: 0 };
  return g;
}

/** p0 ends the turn with `builders` in line, each asking in order. */
function specialBuildAfter(g: GameState, builders: string[]): GameState {
  for (const id of builders) g = act(g, id, { type: 'request-special-build' });
  return act(g, getActivePlayerId(g)!, { type: 'end-turn' });
}

describe('the 7–8 player island', () => {
  it('has 37 tiles in rows of 4-5-6-7-6-5-4, two deserts, 35 numbers, and 13 harbors', () => {
    const board = generateBoard(seeded(), 'random', 'huge');
    expect(board.hexes).toHaveLength(37);
    const rows = [-3, -2, -1, 0, 1, 2, 3].map(r => board.hexes.filter(h => h.r === r).length);
    expect(rows).toEqual([4, 5, 6, 7, 6, 5, 4]);
    expect(board.hexes.filter(h => h.terrain === 'desert')).toHaveLength(2);
    const numbers = board.hexes.map(h => h.number).filter(n => n !== null);
    expect(numbers).toHaveLength(35);
    expect(numbers.filter(n => n === 6 || n === 8)).toHaveLength(8);
    expect(new Set(board.harbors.map(h => h.edgeId)).size).toBe(13);
  });

  it('never puts red numbers side by side, in either layout', () => {
    for (const layout of ['random', 'ordered'] as const)
      for (let seed = 1; seed < 30; seed++) {
        const red = generateBoard(seeded(seed), layout, 'huge').hexes.filter(h => h.number === 6 || h.number === 8);
        for (const a of red) for (const b of red) expect(neighbours(a, b)).toBe(false);
      }
  });

  it('seats eight in distinct colors, with the huge island, 30 of each card, and 43 development cards', () => {
    expect(MAX_PLAYERS).toBe(8);
    expect(() => addPlayer(makeLobby(8), { id: 'p8', name: 'Ninth' })).toThrow(/eight players/);
    const g = settled(7);
    expect(new Set(g.players.map(p => p.color)).size).toBe(7);
    expect(g.board.hexes).toHaveLength(37);
    expect(g.developmentDeck).toHaveLength(43);
    const total = (r: 'ore') => g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0);
    expect(total('ore')).toBe(30);
    expect(Object.keys(PLAYER_COLORS)).toHaveLength(10);
  });
});

describe('special build with seven or eight', () => {
  it('allows one bank trade between your turns, however many special builds', () => {
    let g = eightAtBuild();
    grant(g, 'p3', { wood: 8 });
    g = specialBuildAfter(g, ['p3']);
    expect(getActivePlayerId(g)).toBe('p3');
    expect(getView(g, 'p3').specialTraded).toEqual([]);
    expect(() =>
      act(g, 'p3', { type: 'offer-trade', give: { ...emptyBag(), wood: 1 }, want: { ...emptyBag(), ore: 1 } }),
    ).toThrow();
    g = act(g, 'p3', { type: 'trade', give: 'wood', receive: 'ore' });
    expect(g.players[3]!.resources.ore).toBe(1);
    expect(() => act(g, 'p3', { type: 'trade', give: 'wood', receive: 'brick' })).toThrow(/already traded/);
    g = act(g, 'p3', { type: 'end-turn' });
    // p1's turn: p3 special builds again but has no trade left.
    expect(getActivePlayerId(g)).toBe('p1');
    g.phase = 'build';
    g = specialBuildAfter(g, ['p3']);
    expect(getActivePlayerId(g)).toBe('p3');
    expect(() => act(g, 'p3', { type: 'trade', give: 'wood', receive: 'brick' })).toThrow(/already traded/);
    g = act(g, 'p3', { type: 'end-turn' });
    expect(getActivePlayerId(g)).toBe('p2');
    expect(g.specialTraded).toEqual(['p3']);
    // p3's own turn gives it back.
    g.phase = 'build';
    g = act(g, 'p2', { type: 'end-turn' });
    expect(getActivePlayerId(g)).toBe('p3');
    expect(g.specialTraded).toEqual([]);
  });

  it('six players still may not trade while special building', () => {
    const g = settled(6);
    g.phase = 'build';
    g.turnIndex = 0;
    grant(g, 'p2', { wood: 4 });
    const next = specialBuildAfter(g, ['p2']);
    expect(getActivePlayerId(next)).toBe('p2');
    expect(() => act(next, 'p2', { type: 'trade', give: 'wood', receive: 'ore' })).toThrow(/No trading/);
  });

  it('old rooms load with no special-build trades used', () => {
    const g = settled(3) as Partial<GameState>;
    delete g.specialTraded;
    g.schemaVersion = 33;
    expect(normalizeGame(g as GameState).specialTraded).toEqual([]);
  });

  it('eight bots finish a game on the huge island', () => {
    const game = playBotGame(
      ['advanced', 'intermediate', 'beginner', 'advanced', 'intermediate', 'beginner', 'advanced', 'intermediate'],
      5,
      12000,
    );
    expect(game.phase).toBe('finished');
  }, 30_000);
});
