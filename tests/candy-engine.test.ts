import { describe, expect, it } from 'vitest';
import { candyChoice } from '../shared/bots/candy';
import { TUNING } from '../shared/default-settings';
import { advanceTime, applyAction, candyRun, emptyBag, getView, resourceCount } from '../shared/engine';
import { CANDY_SPARE, candyPicks } from '../shared/engine/candy';
import { boardFor } from '../shared/engine/lobby';
import { buildBoard } from '../shared/maps';
import { neighborKeys, pips } from '../shared/maps/balance';
import { trainCuts } from '../shared/maps/candy-board';
import { candyGraph, parseCandyRoutes } from '../shared/maps/candy-train';
import { baseGameDesign } from '../shared/maps/edit';
import { type BoardDesign, tileKey } from '../shared/maps/types';
import { isLandTerrain } from '../shared/seafaring';
import { type Board, CLASSIC_RESOURCES, type ClassicResource, type GameState } from '../shared/types';
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
/** A bag of one card (or none). */
const bag = (r?: ClassicResource) => {
  const out = emptyBag();
  if (r) out[r]++;
  return out;
};
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

  it('takes a run of picks in one go, but never across someone else’s pick', () => {
    const rolled = roll(candyGame(), 1, 3);
    const [first, second, third] = rolled.candyLoad!.cards as [ClassicResource, ClassicResource, ClassicResource];
    const pair = (g: GameState, id: string, a: ClassicResource, b: ClassicResource) =>
      applyAction(g, id, { type: 'take-candy', resource: a, more: bag(b) }, sequence(0.5), TEST_NOW);
    // p1 has one pick, then p0 two in a row (a city).
    expect(candyRun(rolled.candyLoad, 'p1')).toBe(1);
    expect(candyRun(rolled.candyLoad, 'p0')).toBe(0);
    expect(() => pair(rolled, 'p1', first, second)).toThrow(/one pick/);
    const p0Turn = take(rolled, 'p1', first);
    expect(candyRun(p0Turn.candyLoad, 'p0')).toBe(2);
    const done = pair(p0Turn, 'p0', second, third);
    expect(done.phase).toBe('build');
    expect(done.stats.p0!.cardsIn.candy).toBe(2);
    expect(done.log.filter(e => e.event?.kind === 'candy')).toHaveLength(3);
    // Asking for a card more often than the train has it fails.
    const scarce = CLASSIC_RESOURCES.find(r => p0Turn.candyLoad!.cards.filter(c => c === r).length === 1);
    if (scarce) expect(() => pair(p0Turn, 'p0', scarce, scarce)).toThrow(/on the train/);
    expect(() =>
      applyAction(
        p0Turn,
        'p0',
        { type: 'take-candy', resource: second, more: { ...bag(), paper: 1 } },
        sequence(0.5),
        TEST_NOW,
      ),
    ).toThrow(/standard cards/);
    // p0, p1, p0: p0's two picks are split by p1's, so p0 takes one now and one later.
    const split = structuredClone(rolled);
    const [a, b, c] = split.candyLoad!.picks;
    split.candyLoad!.picks = [c!, a!, b!];
    expect(split.candyLoad!.picks.map(p => p.playerId)).toEqual(['p0', 'p1', 'p0']);
    expect(candyRun(split.candyLoad, 'p0')).toBe(1);
    expect(() => pair(split, 'p0', first, second)).toThrow(/one pick/);
    // A bot (or the clock) takes its whole run at once.
    const choice = candyChoice(getView(p0Turn, 'p0'));
    expect(choice.type === 'take-candy' && resourceCount(choice.more ?? bag())).toBe(1);
    expect(advanceTime(p0Turn, p0Turn.candyDeadline! + 1, sequence(0.5)).phase).toBe('build');
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
  /** Dots beside the track (start half, end half), elsewhere, and equal neighbors touching the track, over many boards. */
  function trainStats(boards: () => Board) {
    const sums = { start: [0, 0], end: [0, 0], rest: [0, 0] };
    let repeats = 0;
    let count = 0;
    for (let i = 0; i < 200; i++) {
      const board = boards();
      const cuts = trainCuts(board);
      const mid = (TUNING.candyStartCut + TUNING.candyEndCut) / 2;
      const byKey = new Map(board.hexes.map(h => [tileKey(h.q, h.r), h]));
      for (const hex of board.hexes) {
        if (hex.number === null || !isLandTerrain(hex.terrain)) continue;
        const cut = cuts.get(tileKey(hex.q, hex.r));
        const sum = cut === undefined ? sums.rest : cut > mid ? sums.start : sums.end;
        sum[0]! += pips(hex.number);
        sum[1]!++;
        if (cut === undefined) continue;
        for (const k of neighborKeys(hex)) if (byKey.get(k)?.number === hex.number) repeats++;
      }
      count++;
    }
    const average = ([dots, tiles]: number[]) => dots! / tiles!;
    return {
      start: average(sums.start),
      end: average(sums.end),
      rest: average(sums.rest),
      repeats: repeats / count,
    };
  }

  it('are drawn poorer, about 1.25 dots near the start and 0.5 near the end, with the rest of the board', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const design = trainDesign();
    const designed = trainStats(() => buildBoard(design, random, { trains: true }).board);
    const standard = trainStats(() => boardFor(null, 'random', random, 4, false, undefined, true).board);
    for (const stats of [designed, standard]) {
      expect(stats.rest - stats.start).toBeGreaterThan(0.8);
      expect(stats.rest - stats.start).toBeLessThan(1.6);
      expect(stats.rest - stats.end).toBeGreaterThan(0.25);
      expect(stats.rest - stats.end).toBeLessThan(0.9);
      expect(stats.start).toBeLessThan(stats.end);
    }
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
