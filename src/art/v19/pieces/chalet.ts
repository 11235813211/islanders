// The mountain chalet settlement and city.
import { arch, box, chimney, type Decal, gabledHouse, type House, rect, type Solid } from '../solids';
import { dark, onFront, onRight, sideWindow } from './classic';

/** A shuttered square window on the front wall, centered at x with its bottom at y. */
function shuttered(house: House, x: number, y: number, size = 2.4): Decal[] {
  const half = size / 2;
  return [
    { points: onFront(house, rect(x - half - 1, y, x - half, y + size)), fill: 0.28 },
    { points: onFront(house, rect(x + half, y, x + half + 1, y + size)), fill: 0.28 },
    dark(onFront(house, rect(x - half, y, x + half, y + size))),
  ];
}

/**
 * A mountain chalet: stone ground floor with the door, timber floors with shuttered windows,
 * a balcony sheltered by the eaves, and a timber-framed gable.
 */
export function chalet(house: House, floors = 1, joined: { left?: boolean; right?: boolean } = {}): Solid[] {
  const { x0, x1, z0, z1, spec } = house;
  const stone = 4;
  const balconyTop = house.eave - 0.5;
  const balconyBottom = balconyTop - 2.4;
  const floorHeight = (balconyBottom - stone) / floors;
  const front = house.front.decals;
  front.push(
    { points: onFront(house, rect(x0, 0, x1, stone)), fill: -0.16 },
    {
      points: onFront(house, [
        [x0 + 1.4, 1.6],
        [x0 + 3, 1.6],
      ]),
      open: true,
    },
    {
      points: onFront(house, [
        [x1 - 3, 2.6],
        [x1 - 1.4, 2.6],
      ]),
      open: true,
    },
    dark(onFront(house, arch(spec.x - 1.5, spec.x + 1.5, 0, stone - 0.4))),
    // Timber framing in the gable: a beam, a king post, and two braces.
    {
      points: onFront(house, [
        [x0, spec.wall],
        [x1, spec.wall],
      ]),
      open: true,
      width: 0.7,
    },
    {
      points: onFront(house, [
        [spec.x, house.peak - 0.3],
        [spec.x, spec.wall],
      ]),
      open: true,
      width: 0.7,
    },
    {
      points: onFront(house, [
        [spec.x - spec.width / 4, spec.wall],
        [spec.x, house.peak - 1.6],
        [spec.x + spec.width / 4, spec.wall],
      ]),
      open: true,
      width: 0.7,
    },
  );
  for (let floor = 0; floor < floors; floor++) {
    const y = stone + floor * floorHeight + (floorHeight - 2.4) / 2;
    front.push(...shuttered(house, spec.x - spec.width * 0.24, y), ...shuttered(house, spec.x + spec.width * 0.24, y));
  }
  house.right.decals.push(
    { points: onRight(house, rect(z0, 0, z1, stone)), fill: -0.12 },
    sideWindow(house, spec.z - 1.2, stone + (floorHeight - 2.4) / 2),
  );
  // The balcony stops flush at a side joined to another building.
  const [bx0, bx1] = [x0 - (joined.left ? 0 : 0.9), x1 + (joined.right ? 0 : 0.9)];
  const balcony = box(bx0, bx1, balconyBottom, balconyTop, z0 - 1.5, z0);
  const posts = Array.from({ length: Math.floor((bx1 - bx0) / 2.2) - 1 }, (_, i) => bx0 + 2.2 * (i + 1));
  balcony.front.decals.push(
    ...posts.map(px => ({
      points: [
        [px, balconyBottom + 0.5, z0 - 1.52],
        [px, balconyTop - 0.5, z0 - 1.52],
      ] as Decal['points'],
      open: true,
    })),
  );
  return [...house.solids, balcony.solid];
}

/** A chalet settlement, or a city of two joined chalets. */
export function chaletPiece(city: boolean): Solid[] {
  if (city) {
    // One joined chalet: a tall two-storey hall and a lower lodge, the same depth front to back.
    const depth = 14;
    const hall = gabledHouse({
      x: -6.5,
      z: 0,
      width: 12,
      depth,
      wall: 17.5,
      rise: 5,
      overhang: 2.3,
      overhangRight: 0,
      fascia: 1.8,
    });
    const lodge = gabledHouse({
      x: 5.75,
      z: 0,
      width: 12.5,
      depth,
      wall: 11.5,
      rise: 4.4,
      overhang: 2.3,
      overhangLeft: 0,
      fascia: 1.8,
    });
    return [...chalet(hall, 2, { right: true }), chimney(hall, -3.4, -3, 2.4), ...chalet(lodge, 1, { left: true })];
  }
  const house = gabledHouse({ x: 0, z: 0, width: 13, depth: 16, wall: 12.5, rise: 5.4, overhang: 2.5, fascia: 1.9 });
  return [...chalet(house), chimney(house, 3.2, -3, 2.4)];
}
