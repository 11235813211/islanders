// Christmas Candy trains on a built board. A train is like an extra tile its track runs past, and
// its start station is like a gold field (the first pick has the most choice), so the numbers
// around the track are drawn poorer: on average TUNING.candyStartCut dots fewer at the start and
// TUNING.candyEndCut at the end. They are drawn with the rest of the board's numbers
// (balancedNumbers), so they still avoid matching their neighbors.

import { TUNING } from '../default-settings';
import type { Board, CandyTrain } from '../types';
import { autoTrain } from './auto-train';
import { balancedNumbers } from './balance';
import { trainNumber } from './candy-train';
import type { BoardDesign } from './types';
import { tileKey } from './types';

/** Every corner of a train's track, through all its legs, in order. */
export function trainCorners(train: CandyTrain | undefined): string[] {
  if (!train) return [];
  return [...train.vertexIds, ...(train.legs ?? []).flatMap(leg => leg.vertexIds)];
}

/** The design's routes as trains on the built board (routes too short to drive are left out). */
function designTrains(design: Pick<BoardDesign, 'candyRoutes'>, board: Board, random: () => number): CandyTrain[] {
  const byKey = new Map(board.hexes.map(h => [tileKey(h.q, h.r), h]));
  return (design.candyRoutes ?? []).flatMap(route => {
    const vertexIds = route.corners.flatMap(corner => {
      const [q, r, c] = corner.split(',').map(Number) as [number, number, number];
      const id = byKey.get(tileKey(q, r))?.vertexIds[c];
      return id ? [id] : [];
    });
    if (vertexIds.length < 2) return [];
    return [{ vertexIds, number: trainNumber(random, route.dots), side: route.side }];
  });
}

/**
 * Put trains on the board (before its numbers are drawn): the design's routes, or with none, a
 * generated track (autoTrain) when `generate` is set. Changes `board` in place; call it while building.
 */
export function layTrains(
  design: Pick<BoardDesign, 'candyRoutes'>,
  board: Board,
  random: () => number,
  generate = true,
): void {
  let trains = designTrains(design, board, random);
  if (!trains.length && generate) trains = autoTrain(board, random);
  if (trains.length) board.trains = trains;
}

/**
 * Tile key → dots fewer its number should average: candyStartCut at a start station down to
 * candyEndCut at the end of the track, by the nearest corner of any train.
 */
export function trainCuts(board: Board): Map<string, number> {
  const vertices = new Map(board.vertices.map(v => [v.id, v]));
  const hexes = new Map(board.hexes.map(h => [h.id, h]));
  const { candyStartCut: start, candyEndCut: end } = TUNING;
  const cuts = new Map<string, number>();
  for (const train of board.trains ?? []) {
    const corners = trainCorners(train);
    corners.forEach((id, i) => {
      const cut = start + ((end - start) * i) / (corners.length - 1);
      for (const hexId of vertices.get(id)!.hexIds) {
        const hex = hexes.get(hexId)!;
        const k = tileKey(hex.q, hex.r);
        cuts.set(k, Math.max(cut, cuts.get(k) ?? 0));
      }
    });
  }
  return cuts;
}

/**
 * Lay a train on a standard island with random numbers, and draw all its numbers again with the
 * tiles beside the track poorer. Changes `board` in place.
 */
export function trainStandardBoard(board: Board, random: () => number): void {
  layTrains({}, board, random);
  const cuts = trainCuts(board);
  const producing = board.hexes
    .filter(h => h.number !== null)
    .map(h => ({ q: h.q, r: h.r, terrain: h.terrain, cut: cuts.get(tileKey(h.q, h.r)) }));
  const numbers = balancedNumbers(producing, new Map(), random);
  for (const hex of board.hexes) if (hex.number !== null) hex.number = numbers.get(tileKey(hex.q, hex.r)) ?? hex.number;
}
