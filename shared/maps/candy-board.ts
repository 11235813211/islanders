// Christmas Candy trains on a built board. A train is like an extra tile its track runs past, and
// its start station is like a gold field (the first pick has the most choice), so the numbers
// around the track are drawn poorer: rich numbers lose about two dots at the start and one at the
// end, poor ones less (a 2 or 12 nothing), and no corner of the track is left with a poor spot.

import type { Board, CandyTrain } from '../types';
import { autoTrain } from './auto-train';
import { pips } from './balance';
import { trainNumber } from './candy-train';
import type { BoardDesign } from './types';
import { tileKey } from './types';

/** Every corner of a train's track, through all its legs, in order. */
export function trainCorners(train: CandyTrain | undefined): string[] {
  if (!train) return [];
  return [...train.vertexIds, ...(train.legs ?? []).flatMap(leg => leg.vertexIds)];
}

/** Dots taken off a rich number beside the track: this at the start station, one less at the end. */
const START_CUT = 2;
const END_CUT = 1;
/** Dots per numbered tile a corner of the track keeps at least (unless it started with fewer). */
const SPOT_DOTS = 2;

/** Share of the cut a number with `dots` dots takes: 4 or more dots all of it, a 2 or 12 none. */
const cutShare = (dots: number) => Math.min(1, (dots - 1) / 3);

/** The number with `dots` dots on the same side of 7 as `n` (6 with three dots is 4; 8 is 10). */
function withDots(n: number, dots: number): number {
  const away = 6 - dots;
  return n < 7 ? 7 - away : 7 + away;
}

/**
 * Dots to take off a number with `dots` dots: START_CUT at `t` = 0 down to END_CUT at 1, times
 * its cutShare, rounded up or down at random.
 */
function cutAt(t: number, dots: number, random: () => number): number {
  const cut = (START_CUT + (END_CUT - START_CUT) * t) * cutShare(dots);
  const whole = Math.floor(cut);
  return whole + (random() < cut - whole ? 1 : 0);
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
 * Put trains on the board: the design's routes, or with none, a generated track (autoTrain) when
 * `generate` is set. Random numbers beside each track get poorer. Numbers in `fixed` (by tile key)
 * stay as they are; nothing drops below one dot (two with `noTwoTwelve`, unless it already had one).
 * Changes `board` in place; call it while building.
 */
export function placeTrains(
  design: Pick<BoardDesign, 'candyRoutes' | 'noTwoTwelve'>,
  board: Board,
  fixed: Set<string>,
  random: () => number,
  generate = true,
): void {
  let trains = designTrains(design, board, random);
  if (!trains.length && generate) trains = autoTrain(board, random);
  if (!trains.length) return;
  board.trains = trains;
  const vertices = new Map(board.vertices.map(v => [v.id, v]));
  /** Tile id → how close to a start station it is (0 at the start, 1 at the end), nearest train. */
  const nearest = new Map<string, number>();
  for (const train of trains) {
    const corners = trainCorners(train);
    corners.forEach((id, i) => {
      const t = i / (corners.length - 1);
      for (const hexId of vertices.get(id)!.hexIds) nearest.set(hexId, Math.min(t, nearest.get(hexId) ?? 1));
    });
  }
  const floor = design.noTwoTwelve ? 2 : 1;
  const before = new Map<string, number>();
  for (const hex of board.hexes) {
    const t = nearest.get(hex.id);
    if (t === undefined || hex.number === null || fixed.has(tileKey(hex.q, hex.r))) continue;
    const dots = pips(hex.number);
    before.set(hex.id, dots);
    hex.number = withDots(hex.number, Math.max(Math.min(dots, floor), dots - cutAt(t, dots, random)));
  }
  keepSpots(board, trains, before);
}

/**
 * Give dots back where a track corner's tiles were cut below SPOT_DOTS per numbered tile (or
 * below what they had, if less): one at a time, to the tile that lost the most. `before` holds
 * each cut tile's dots before cutting.
 */
function keepSpots(board: Board, trains: CandyTrain[], before: Map<string, number>): void {
  const hexes = new Map(board.hexes.map(h => [h.id, h]));
  const vertices = new Map(board.vertices.map(v => [v.id, v]));
  for (const id of trains.flatMap(trainCorners)) {
    const tiles = vertices.get(id)!.hexIds.flatMap(h => (hexes.get(h)?.number ? [hexes.get(h)!] : []));
    const dotsNow = () => tiles.reduce((sum, h) => sum + pips(h.number!), 0);
    const had = tiles.reduce((sum, h) => sum + (before.get(h.id) ?? pips(h.number!)), 0);
    const want = Math.min(had, SPOT_DOTS * tiles.length);
    while (dotsNow() < want) {
      const lost = (h: (typeof tiles)[number]) => (before.get(h.id) ?? 0) - pips(h.number!);
      const most = tiles.reduce((a, b) => (lost(b) > lost(a) ? b : a));
      if (lost(most) <= 0) break;
      most.number = withDots(most.number!, pips(most.number!) + 1);
    }
  }
}
