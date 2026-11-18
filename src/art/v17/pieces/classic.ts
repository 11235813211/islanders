// The classic settlement and city: plain gabled buildings in the seat color.
import { arch, type Decal, gabledHouse, type House, rect, type Solid } from '../solids';

export const onFront = (house: House, points: [number, number][]) => points.map(([x, y]) => house.onFront(x, y));
export const onRight = (house: House, points: [number, number][]) => points.map(([z, y]) => house.onRight(z, y));
export const dark = (points: Decal['points']): Decal => ({ points, fill: 'line' });

/** A window on the right wall, `size` square, its lower front corner at (z, y). */
export const sideWindow = (house: House, z: number, y: number, size = 2.4) =>
  dark(onRight(house, rect(z, y, z + size, y + size)));

/**
 * The classic pieces in 3D: a gabled house, and for a city one joined building, a tall hall with
 * a lower wing. Both halves share the same depth, so walls and roofs run front to back together,
 * and neither roof overhangs the joint. No chimneys.
 */
export function classicPiece(city: boolean): Solid[] {
  if (city) {
    const depth = 11;
    const hall = gabledHouse({
      x: -5,
      z: 0,
      width: 9,
      depth,
      wall: 12,
      rise: 6,
      overhang: 1,
      overhangRight: 0,
      fascia: 1.3,
    });
    const wing = gabledHouse({
      x: 4.5,
      z: 0,
      width: 10,
      depth,
      wall: 7.5,
      rise: 4.2,
      overhang: 1,
      overhangLeft: 0,
      fascia: 1.3,
    });
    const h = hall.spec.x;
    const round = Array.from({ length: 12 }, (_, i): [number, number] => {
      const a = (i / 12) * Math.PI * 2;
      return [h + 1.2 * Math.cos(a), hall.spec.wall + 2.3 + 1.2 * Math.sin(a)];
    });
    hall.front.decals.push(
      dark(onFront(hall, round)),
      dark(onFront(hall, arch(h - 1.9, h + 1.9, 0, 6.6))),
      dark(onFront(hall, arch(h - 1, h + 1, 8, 10.6))),
    );
    const w = wing.spec.x;
    wing.front.decals.push(
      dark(onFront(wing, rect(w - 3.4, 2.8, w - 1.2, 5))),
      dark(onFront(wing, rect(w + 1.2, 2.8, w + 3.4, 5))),
    );
    wing.right.decals.push(sideWindow(wing, -1.2, 2.8));
    return [...hall.solids, ...wing.solids];
  }
  const house = gabledHouse({ x: 0, z: 0, width: 12, depth: 11, wall: 8.5, rise: 6.5, overhang: 1.2, fascia: 1.4 });
  house.front.decals.push(dark(onFront(house, arch(-2, 2, 0, 6.2))));
  house.right.decals.push(sideWindow(house, -1.6, 3));
  return house.solids;
}
