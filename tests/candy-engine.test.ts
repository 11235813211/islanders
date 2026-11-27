import { describe, expect, it } from 'vitest';
import { candyChoice } from '../shared/bots/candy';
import { advanceTime, applyAction, getView } from '../shared/engine';
import { CANDY_SPARE, candyPicks } from '../shared/engine/candy';
import { buildBoard } from '../shared/maps';
import { pips } from '../shared/maps/balance';
import { candyGraph, parseCandyRoutes } from '../shared/maps/candy-train';
import { baseGameDesign } from '../shared/maps/edit';
import type { BoardDesign } from '../shared/maps/types';
import { CLASSIC_RESOURCES, type GameState } from '../shared/types';
import { candyGame, sequence, TEST_NOW } from './fixtures';

/** p0 rolls `a` + `b` (random dice read floor(v * 6) + 1), then the train loads from later draws. */
const roll = (g: GameState, a: number, b: number) =>
  applyAction(
    g,
    'p0',
    { type: 'roll' },
    sequence((a - 1) / 6 + 0.01, (b - 1) / 6 + 0.01, 0.1, 0.3, 0.5, 0.7, 0.9),
    TEST_NOW,
  );
const total = (g: GameState) =>
  CLASSIC_RESOURCES.map(
    r =>
      g.bank[r] +
      g.players.reduce((n, p) => n + p.resources[r], 0) +
      (g.candyLoad?.cards ?? []).filter(c => c === r).length,
  );
const take = (g: GameState, id: string, resource = g.candyLoad!.cards[0]!) =>
  applyAction(g, id, { type: 'take-candy', resource }, sequence(0.5), TEST_NOW);

describe('the candy train', () => {
  it('loads one card per pick plus spares, and the track picks in order: settlements once, cities twice', () => {
    const g = candyGame();
    const before = total(g);
    const rolled = roll(g, 1, 3);
    expect(rolled.phase).toBe('candy');
    const load = rolled.candyLoad!;
    expect(load.picks.map(p => p.playerId)).toEqual(['p1', 'p0', 'p0']);
    expect(load.cards).toHaveLength(3 + CANDY_SPARE);
    expect(total(rolled)).toEqual(before);
    // Everyone sees what is on the train.
    expect(getView(rolled, 'p2').candyLoad).toEqual(load);
    expect(() => take(rolled, 'p0')).toThrow(/Wait for your pick/);
    const missing = CLASSIC_RESOURCES.find(r => !load.cards.includes(r));
    if (missing) expect(() => take(rolled, 'p1', missing)).toThrow(/on the train/);
    let next = take(rolled, 'p1');
    expect(next.players[1]!.resources[load.cards[0]!]).toBe(rolled.players[1]!.resources[load.cards[0]!] + 1);
    expect(next.log.at(-1)!.event).toMatchObject({ kind: 'candy', playerId: 'p1' });
    next = take(take(next, 'p0'), 'p0');
    // The spare cards go back to the bank and the turn goes on.
    expect(next.phase).toBe('build');
    expect(next.candyLoad).toBeNull();
    expect(total(next)).toEqual(before);
    expect(next.stats.p0!.cardsIn.candy).toBe(2);
  });

  it('then Santa comes, when the North Pole has the same number', () => {
    let g = roll(candyGame(true), 1, 3);
    expect(g.phase).toBe('candy');
    for (const id of ['p1', 'p0', 'p0']) g = take(g, id);
    expect(g.phase).toBe('santa');
  });

  it('picks for a person who runs out of time, and bots pick a card that is on the train', () => {
    const g = roll(candyGame(), 1, 3);
    expect(g.candyDeadline).not.toBeNull();
    const view = getView(g, 'p1');
    const choice = candyChoice(view);
    expect(choice.type === 'take-candy' && g.candyLoad!.cards.includes(choice.resource)).toBe(true);
    const later = advanceTime(g, g.candyDeadline! + 1, sequence(0.5));
    expect(later.candyLoad!.picks.map(p => p.playerId)).toEqual(['p0', 'p0']);
    expect(later.log.some(e => e.text.includes('took from the candy train for'))).toBe(true);
  });

  it('only runs in Christmas Candy rooms, and not when nobody is on the track', () => {
    const plain = candyGame();
    plain.settings.christmasCandy = false;
    expect(roll(plain, 1, 3).phase).toBe('build');
    const empty = candyGame();
    empty.buildings = {};
    expect(candyPicks(empty, 0)).toEqual([]);
    expect(roll(empty, 1, 3).phase).toBe('build');
  });
});

/** The base game with a train along the top of its middle tile, unset number. */
function trainDesign(dots?: number): BoardDesign {
  const base = baseGameDesign('test');
  const graph = candyGraph(base.tiles);
  const start = [...graph.values()].find(c => c.neighbors.size === 3)!;
  const corners = [start.key];
  while (corners.length < 6) {
    const last = graph.get(corners.at(-1)!)!;
    const step = [...last.neighbors].find(k => !corners.includes(k) && graph.get(k)!.neighbors.size === 3);
    if (!step) break;
    corners.push(step);
  }
  return { ...base, candyRoutes: [{ corners, side: 1, ...(dots ? { dots } : {}) }] };
}

describe('numbers beside a candy train', () => {
  it('are poorer: about two dots fewer near the start, one fewer near the end; the rest of the board is the same', () => {
    const design = trainDesign();
    let cut = 0;
    let touched = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      const start = seed;
      const plain = buildBoard(design, random).board;
      seed = start;
      const candy = buildBoard(design, random, { trains: true }).board;
      expect(plain.trains).toBeUndefined();
      const train = candy.trains![0]!;
      expect([4, 10]).toContain(train.number);
      const near = new Set(train.vertexIds.flatMap(id => candy.vertices.find(v => v.id === id)!.hexIds));
      candy.hexes.forEach((hex, i) => {
        const was = plain.hexes[i]!;
        expect(hex.terrain).toBe(was.terrain);
        if (!near.has(hex.id) || was.number === null) {
          expect(hex.number).toBe(was.number);
          return;
        }
        // The number stays on the same side of 7 and never goes below one dot.
        expect(Math.sign(hex.number! - 7)).toBe(Math.sign(was.number - 7));
        const lost = pips(was.number) - pips(hex.number!);
        expect(lost).toBeGreaterThanOrEqual(Math.min(1, pips(was.number) - 1));
        expect(lost).toBeLessThanOrEqual(2);
        cut += lost;
        touched++;
      });
    }
    expect(cut / touched).toBeGreaterThan(1.1);
    expect(cut / touched).toBeLessThan(1.9);
  });

  it('draws the train’s number from the dots the editor set', () => {
    const drawn = new Set(
      Array.from(
        { length: 30 },
        () => buildBoard(trainDesign(5), Math.random, { trains: true }).board.trains![0]!.number,
      ),
    );
    expect([...drawn].sort()).toEqual([6, 8]);
  });

  it('reads a number saved before dots as its dots', () => {
    const { corners } = trainDesign().candyRoutes![0]!;
    const tiles = trainDesign().tiles;
    expect(parseCandyRoutes([{ corners, side: 1, number: 9 }], tiles)[0]!.dots).toBe(4);
  });
});
