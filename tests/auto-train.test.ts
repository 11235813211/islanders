import { describe, expect, it } from 'vitest';
import { generateBoard, islandSize, seededRandom } from '../shared/board';
import { candyPicks } from '../shared/engine/candy';
import { boardFor } from '../shared/engine/lobby';
import { BUILTIN_BOARDS } from '../shared/maps';
import { autoTrain } from '../shared/maps/auto-train';
import { trainCorners } from '../shared/maps/candy-board';
import { isLandTerrain } from '../shared/seafaring';
import type { Board, CandyTrain } from '../shared/types';

/** Checks every generated track must pass: rails over land on every edge, no corner twice or touching. */
function expectSound(board: Board, train: CandyTrain) {
  const vertices = new Map(board.vertices.map(v => [v.id, v]));
  const land = board.hexes.filter(h => isLandTerrain(h.terrain));
  const corners = trainCorners(train);
  expect(new Set(corners).size).toBe(corners.length);
  for (const leg of [train, ...(train.legs ?? [])])
    leg.vertexIds.slice(1).forEach((id, i) => {
      const a = vertices.get(leg.vertexIds[i]!)!;
      const b = vertices.get(id)!;
      expect(a.edgeIds.some(e => b.edgeIds.includes(e))).toBe(true);
      // The land tile on the rails' side: its center is across the edge, left of travel for side 1.
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const normal = { x: -(b.y - a.y) * leg.side, y: (b.x - a.x) * leg.side };
      const dry = land.some(
        h =>
          a.hexIds.includes(h.id) && b.hexIds.includes(h.id) && (h.x - mid.x) * normal.x + (h.y - mid.y) * normal.y > 0,
      );
      expect(dry).toBe(true);
    });
  // No corner of the track sits next to another, except its neighbors along the same leg.
  const along = new Set(
    [train, ...(train.legs ?? [])].flatMap(leg =>
      leg.vertexIds.slice(1).flatMap((id, i) => [`${leg.vertexIds[i]}|${id}`, `${id}|${leg.vertexIds[i]}`]),
    ),
  );
  for (const a of corners)
    for (const b of corners) {
      if (a === b || along.has(`${a}|${b}`)) continue;
      const va = vertices.get(a)!;
      expect(va.edgeIds.some(e => vertices.get(b)!.edgeIds.includes(e))).toBe(false);
    }
}

describe('generated candy trains', () => {
  it('lay one snaking track over about a seventh of the standard island’s corners', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const board = generateBoard(seededRandom(seed), 'random', islandSize(4), false);
      const [train, ...more] = autoTrain(board, seededRandom(seed * 7));
      expect(more).toEqual([]);
      expect(train!.legs).toBeUndefined();
      expect(train!.vertexIds.length).toBeGreaterThanOrEqual(Math.round(board.vertices.length / 7) - 1);
      expect([4, 10]).toContain(train!.number);
      expectSound(board, train!);
    }
  });

  it('split into legs on different islands on a sea map, and picks run through every leg', () => {
    const design = BUILTIN_BOARDS.find(b => b.id === 'jungle-coast')!;
    let split = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { board } = boardFor(design, 'random', seededRandom(seed), 4, true, undefined, true);
      const train = board.trains![0]!;
      expectSound(board, train);
      if (train.legs?.length) split++;
      const corners = trainCorners(train);
      const buildings = { [corners.at(-1)!]: { playerId: 'p1', kind: 'city' as const } };
      expect(candyPicks({ board, buildings }, 0)).toEqual([
        { playerId: 'p1', vertexId: corners.at(-1)! },
        { playerId: 'p1', vertexId: corners.at(-1)! },
      ]);
    }
    expect(split).toBeGreaterThan(5);
  });

  it('keep the standard spiral’s printed numbers, and stay off without the setting', () => {
    const plain = boardFor(null, 'ordered', seededRandom(3), 4, false);
    const trained = boardFor(null, 'ordered', seededRandom(3), 4, false, undefined, true);
    expect(plain.board.trains).toBeUndefined();
    expect(trained.board.trains).toHaveLength(1);
    expect(trained.board.hexes.map(h => h.number)).toEqual(plain.board.hexes.map(h => h.number));
  });
});
