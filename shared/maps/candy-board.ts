// Christmas Candy trains on a built board. A train is like an extra tile its track runs past, and
// its start station is like a gold field (the first pick has the most choice), so the numbers
// around the track are drawn poorer: about two dots fewer at the start, one fewer at the end.

import type { Board, CandyTrain } from '../types';
import { pips } from './balance';
import { CANDY_DEFAULT_NUMBERS } from './candy-train';
import type { BoardDesign } from './types';
import { tileKey } from './types';

/** Dots taken off a number beside the track: this at the start station, one less at the end. */
const START_CUT = 2;
const END_CUT = 1;

/** The number with `dots` dots on the same side of 7 as `n` (6 with three dots is 4; 8 is 10). */
function withDots(n: number, dots: number): number {
  const away = 6 - dots;
  return n < 7 ? 7 - away : 7 + away;
}

/** Dots to take off: START_CUT at `t` = 0 down to END_CUT at 1, rounded up or down at random. */
function cutAt(t: number, random: () => number): number {
  const cut = START_CUT + (END_CUT - START_CUT) * t;
  const whole = Math.floor(cut);
  return whole + (random() < cut - whole ? 1 : 0);
}

/**
 * Put the design's trains on the board and make the random numbers beside each track poorer.
 * Numbers the design set (`fixed`, by tile key) stay as they are; nothing drops below one dot (two
 * with `noTwoTwelve`, unless it already had one). Changes `board` in place; call it while building.
 */
export function placeTrains(
  design: Pick<BoardDesign, 'candyRoutes' | 'noTwoTwelve'>,
  board: Board,
  fixed: Set<string>,
  random: () => number,
): void {
  const byKey = new Map(board.hexes.map(h => [tileKey(h.q, h.r), h]));
  const vertices = new Map(board.vertices.map(v => [v.id, v]));
  const trains: CandyTrain[] = [];
  /** Tile id → how close to a start station it is (0 at the start, 1 at the end), nearest train. */
  const nearest = new Map<string, number>();
  for (const route of design.candyRoutes ?? []) {
    const vertexIds = route.corners.flatMap(corner => {
      const [q, r, c] = corner.split(',').map(Number) as [number, number, number];
      const id = byKey.get(tileKey(q, r))?.vertexIds[c];
      return id ? [id] : [];
    });
    if (vertexIds.length < 2) continue;
    const number = route.number ?? CANDY_DEFAULT_NUMBERS[Math.floor(random() * CANDY_DEFAULT_NUMBERS.length)]!;
    trains.push({ vertexIds, number, side: route.side });
    vertexIds.forEach((id, i) => {
      const t = i / (vertexIds.length - 1);
      for (const hexId of vertices.get(id)!.hexIds) nearest.set(hexId, Math.min(t, nearest.get(hexId) ?? 1));
    });
  }
  if (!trains.length) return;
  board.trains = trains;
  const floor = design.noTwoTwelve ? 2 : 1;
  for (const hex of board.hexes) {
    const t = nearest.get(hex.id);
    if (t === undefined || hex.number === null || fixed.has(tileKey(hex.q, hex.r))) continue;
    const dots = pips(hex.number);
    hex.number = withDots(hex.number, Math.max(Math.min(dots, floor), dots - cutAt(t, random)));
  }
}
