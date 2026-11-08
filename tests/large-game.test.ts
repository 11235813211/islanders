import { describe, expect, it } from 'vitest';
import { generateBoard, spiralHexes } from '../shared/board';
import { applyAction, getActivePlayerId, getView, normalizeGame } from '../shared/engine';
import { BUILTIN_BOARDS } from '../shared/maps';
import type { GameAction, GameState } from '../shared/types';
import { playBotGame } from './bot-harness';
import { grant, seeded, settled, TEST_NOW } from './fixtures';

const act = (g: GameState, id: string, action: GameAction) => applyAction(g, id, action, seeded(), TEST_NOW);
const neighbours = (a: { q: number; r: number }, b: { q: number; r: number }) =>
  Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r)) === 1;

/** A six-player game in p0's build phase. */
function sixAtBuild(): GameState {
  const g = settled(6);
  g.phase = 'build';
  g.turnIndex = 0;
  g.rollDeadline = null;
  for (const p of g.players) p.resources = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  g.bank = { wood: 24, brick: 24, sheep: 24, wheat: 24, ore: 24 };
  return g;
}

describe('the 5–6 player island', () => {
  it('has 30 tiles in rows of 3-4-5-6-5-4-3, two deserts, 28 numbers, and 11 harbors', () => {
    const board = generateBoard(seeded(), 'random', true);
    expect(board.hexes).toHaveLength(30);
    const rows = [-3, -2, -1, 0, 1, 2, 3].map(r => board.hexes.filter(h => h.r === r).length);
    expect(rows).toEqual([3, 4, 5, 6, 5, 4, 3]);
    expect(board.hexes.filter(h => h.terrain === 'desert')).toHaveLength(2);
    const numbers = board.hexes.map(h => h.number).filter(n => n !== null);
    expect(numbers).toHaveLength(28);
    expect(numbers.filter(n => n === 6 || n === 8)).toHaveLength(6);
    expect(board.harbors).toHaveLength(11);
    expect(new Set(board.harbors.map(h => h.edgeId)).size).toBe(11);
  });

  it('never puts red numbers side by side, in either layout', () => {
    for (const layout of ['random', 'ordered'] as const)
      for (let seed = 1; seed < 30; seed++) {
        const red = generateBoard(seeded(seed), layout, true).hexes.filter(h => h.number === 6 || h.number === 8);
        for (const a of red) for (const b of red) expect(neighbours(a, b)).toBe(false);
      }
  });

  it('keeps the standard spiral: outer ring from the top-left counterclockwise, then inward', () => {
    const order = spiralHexes(generateBoard(seeded())).map(h => `${h.q},${h.r}`);
    expect(order.slice(0, 13)).toEqual([
      '0,-2',
      '-1,-1',
      '-2,0',
      '-2,1',
      '-2,2',
      '-1,2',
      '0,2',
      '1,1',
      '2,0',
      '2,-1',
      '2,-2',
      '1,-2',
      '0,-1',
    ]);
  });

  it('starts five or six players with the large island, 24 of each card, and 34 development cards', () => {
    const g = settled(5);
    expect(g.board.hexes).toHaveLength(30);
    expect(g.developmentDeck).toHaveLength(34);
    expect(g.developmentDeck.filter(c => c.kind === 'knight')).toHaveLength(20);
    const total = (r: 'wood') => g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0);
    expect(total('wood')).toBe(24);
    const four = settled(4);
    expect(four.board.hexes).toHaveLength(19);
    expect(four.developmentDeck).toHaveLength(25);
  });
});

describe('special build phase', () => {
  it('after a turn, each other player who can build gets a turn to build, then play moves on', () => {
    let g = sixAtBuild();
    grant(g, 'p2', { wood: 1, brick: 1 });
    grant(g, 'p4', { sheep: 1, wheat: 1, ore: 1 });
    g = act(g, 'p0', { type: 'end-turn' });
    // p1, p3, p5 have nothing to build and are skipped.
    expect(g.phase).toBe('special-build');
    expect(getActivePlayerId(g)).toBe('p2');
    expect(getView(g, 'p2').turnPlayerId).toBe('p0');
    const road = getView(g, 'p2').legal.roads[0]!;
    g = act(g, 'p2', { type: 'build-road', edgeId: road });
    expect(g.roads[road]).toBe('p2');
    g = act(g, 'p2', { type: 'end-turn' });
    expect(getActivePlayerId(g)).toBe('p4');
    expect(getView(g, 'p4').legal.development).toBe(true);
    g = act(g, 'p4', { type: 'buy-development' });
    expect(g.players[4]!.development).toHaveLength(1);
    g = act(g, 'p4', { type: 'end-turn' });
    expect(g.phase).toBe('roll');
    expect(getActivePlayerId(g)).toBe('p1');
  });

  it('allows no trading, card play, or ship moves', () => {
    let g = sixAtBuild();
    grant(g, 'p1', { wood: 4, brick: 1 });
    g.players[1]!.development = [{ id: 'k', kind: 'knight', boughtTurn: 0 }];
    g = act(g, 'p0', { type: 'end-turn' });
    expect(getActivePlayerId(g)).toBe('p1');
    expect(() => act(g, 'p1', { type: 'trade', give: 'wood', receive: 'ore' })).toThrow();
    expect(() => act(g, 'p1', { type: 'play-knight', cardId: 'k' })).toThrow();
    expect(getView(g, 'p1').playableDevelopment).toEqual([]);
    expect(getView(g, 'p1').legal.shipMoves).toEqual({});
  });

  it('a builder who runs out of time passes; the clock is short', () => {
    let g = sixAtBuild();
    grant(g, 'p3', { wood: 1, brick: 1 });
    g = act(g, 'p0', { type: 'end-turn' });
    expect(g.turnDeadline).toBe(TEST_NOW + 30_000);
    expect(getActivePlayerId(g)).toBe('p3');
  });

  it('four players never get one', () => {
    let g = settled(4);
    g.phase = 'build';
    grant(g, 'p1', { wood: 1, brick: 1 });
    g = act(g, 'p0', { type: 'end-turn' });
    expect(g.phase).toBe('roll');
  });

  it('old rooms load with no special builder', () => {
    const g = settled(3) as Partial<GameState>;
    delete g.specialBuilder;
    g.schemaVersion = 2;
    expect(normalizeGame(g as GameState).specialBuilder).toBeNull();
  });

  it('six bots finish a game on the large island and on a sea map', () => {
    const base = playBotGame(['advanced', 'intermediate', 'beginner', 'advanced', 'intermediate', 'beginner'], 3);
    expect(base.phase).toBe('finished');
    expect(base.log.some(e => e.text.includes('ended their turn'))).toBe(true);
    const sea = BUILTIN_BOARDS.find(b => b.players.max >= 6) ?? BUILTIN_BOARDS[0]!;
    expect(playBotGame(Array(6).fill('intermediate'), 4, 9000, sea).phase).toBe('finished');
  }, 30_000);
});
