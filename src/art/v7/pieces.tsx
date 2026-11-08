// Board pieces for v6: flat roads, and settlements and cities modeled in 3D (solids.tsx) so they
// sit on the board in perspective. Two building styles share the same construction.
import type { PieceStyle } from '../../../shared/types';
import {
  arch,
  box,
  chimney,
  type Decal,
  gabledHouse,
  type House,
  outlineTone,
  rect,
  type Solid,
  Solids,
} from './solids';

/** Share of the edge left bare at each end of a road. */
export const ROAD_INSET = 0.1;

/** A road: a flat bar in the seat color with a dark edge. */
export function Road({
  from: a,
  to: b,
  color,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
}) {
  // Ends stop a little short of each corner, so settlements and cities sit over clear ground.
  const dx = (b.x - a.x) * ROAD_INSET;
  const dy = (b.y - a.y) * ROAD_INSET;
  const bar = (stroke: string, width: number) => (
    <line
      x1={a.x + dx}
      y1={a.y + dy}
      x2={b.x - dx}
      y2={b.y - dy}
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
    />
  );
  return (
    <>
      {bar(outlineTone(color), 8.4)}
      {bar(color, 5.8)}
    </>
  );
}

const onFront = (house: House, points: [number, number][]) => points.map(([x, y]) => house.onFront(x, y));
const onRight = (house: House, points: [number, number][]) => points.map(([z, y]) => house.onRight(z, y));
const dark = (points: Decal['points']): Decal => ({ points, fill: 'line' });

/** A window on the right wall, `size` square, its lower front corner at (z, y). */
const sideWindow = (house: House, z: number, y: number, size = 2.4) =>
  dark(onRight(house, rect(z, y, z + size, y + size)));

/** v4's pieces in 3D: a gabled house, and a tall hall beside a house for a city. */
function classic(city: boolean): Solid[] {
  if (city) {
    // Side by side with their fronts in line: a tall hall left, a longer, lower house right.
    const hall = gabledHouse({ x: -6.3, z: 0, width: 9, depth: 9, wall: 12, rise: 6, overhang: 1, fascia: 1.3 });
    const house = gabledHouse({
      x: 5.8,
      z: 1.5,
      width: 10.5,
      depth: 12,
      wall: 7.5,
      rise: 5,
      overhang: 1.1,
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
    house.front.decals.push(dark(onFront(house, arch(house.spec.x - 1.9, house.spec.x + 1.9, 0, 5.8))));
    house.right.decals.push(sideWindow(house, 0.3, 2.8));
    return [...hall.solids, ...house.solids, chimney(house, 7.6, -1.5, 2.4)];
  }
  const house = gabledHouse({ x: 0, z: 0, width: 12, depth: 11, wall: 8.5, rise: 6.5, overhang: 1.2, fascia: 1.4 });
  house.front.decals.push(dark(onFront(house, arch(-2, 2, 0, 6.2))));
  house.right.decals.push(sideWindow(house, -1.6, 3));
  return [...house.solids, chimney(house, 3, -1.5, 2.6)];
}

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
function chalet(house: House, floors = 1): Solid[] {
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
  const balcony = box(x0 - 0.9, x1 + 0.9, balconyBottom, balconyTop, z0 - 1.5, z0);
  const posts = Array.from({ length: Math.floor((spec.width + 1.8) / 2.2) - 1 }, (_, i) => x0 - 0.9 + 2.2 * (i + 1));
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

function chaletPiece(city: boolean): Solid[] {
  if (city) {
    const hall = gabledHouse({ x: -6.8, z: 0, width: 12, depth: 13, wall: 17.5, rise: 5, overhang: 2.3, fascia: 1.8 });
    const lodge = gabledHouse({
      x: 7.2,
      z: 0.5,
      width: 10.5,
      depth: 14,
      wall: 11.5,
      rise: 4.4,
      overhang: 2,
      fascia: 1.6,
    });
    return [...chalet(hall, 2), chimney(hall, -3.8, -3, 2.4), ...chalet(lodge)];
  }
  const house = gabledHouse({ x: 0, z: 0, width: 13, depth: 16, wall: 12.5, rise: 5.4, overhang: 2.5, fascia: 1.9 });
  return [...chalet(house), chimney(house, 3.2, -3, 2.4)];
}

/** A settlement or city in the room's piece style, standing on its corner of the board. */
export function BuildingPiece({
  color,
  city,
  style = 'classic',
}: {
  color: string;
  city: boolean;
  style?: PieceStyle;
}) {
  const solids = style === 'chalet' ? chaletPiece(city) : classic(city);
  // The model's ground center sits just below the corner, so the piece stands on it.
  return (
    <g className="board-piece" transform={`translate(0 7) scale(${city ? 1.2 : 1.15})`}>
      <Solids solids={solids} color={color} />
    </g>
  );
}
