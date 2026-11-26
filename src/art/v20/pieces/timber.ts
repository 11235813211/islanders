// Parts of a timber building, shared by the Korean designs: platforms, walled halls, open posts.
import type { Vec3 } from '../projection';
import { box, type Decal, type Material, paintFaces, rect, type Solid } from '../solids';

const FRONT_GAP = 0.02;

/** A straight line of a given material, for posts and beams drawn on walls. */
const bar = (points: Vec3[], stroke: Material, width: number): Decal => ({ points, open: true, stroke, width });

/** A box centered on x and z, from height `y0` to `y1`. */
export function block(width: number, depth: number, y0: number, y1: number, material: Material) {
  const made = box(-width / 2, width / 2, y0, y1, -depth / 2, depth / 2);
  paintFaces(made.solid, material);
  made.solid.edge = 0.6;
  return made;
}

/** A stone platform with a course line around it. */
export function platform(width: number, depth: number, y0: number, y1: number): Solid {
  const made = block(width, depth, y0, y1, 'stone');
  const mid = (y0 + y1) / 2;
  const [x, z] = [width / 2, depth / 2];
  made.front.decals.push({
    points: [
      [-x, mid, -z - FRONT_GAP],
      [x, mid, -z - FRONT_GAP],
    ],
    open: true,
    width: 0.3,
  });
  made.right.decals.push({
    points: [
      [x + FRONT_GAP, mid, -z],
      [x + FRONT_GAP, mid, z],
    ],
    open: true,
    width: 0.3,
  });
  return made.solid;
}

export interface HallSpec {
  width: number;
  depth: number;
  /** Heights of the floor and of the wall tops. */
  y0: number;
  y1: number;
  bays: number;
  /** Bays on the front filled with paper doors, counted from the left. */
  doors?: number[];
}

/** Plastered walls in a timber frame, with paper-screen doors in chosen bays. */
export function hall({ width, depth, y0, y1, bays, doors = [] }: HallSpec): Solid {
  const made = block(width, depth, y0, y1, 'wall');
  const [x, z] = [width / 2, depth / 2];
  const front = (px: number, py: number): Vec3 => [px, py, -z - FRONT_GAP];
  const right = (pz: number, py: number): Vec3 => [x + FRONT_GAP, py, pz];
  const bayWidth = width / bays;
  for (const bay of doors) {
    const left = -x + bay * bayWidth + 0.35;
    const [panelRight, top] = [left + bayWidth - 0.7, y1 - 0.9];
    const mid = (left + panelRight) / 2;
    made.front.decals.push(
      {
        points: rect(left, y0 + 0.3, panelRight, top).map(([a, b]) => front(a, b)),
        fill: 'paper',
        stroke: 'timber',
        width: 0.3,
      },
      bar([front(mid, y0 + 0.3), front(mid, top)], 'timber', 0.25),
      bar([front(left, (y0 + top) / 2), front(panelRight, (y0 + top) / 2)], 'timber', 0.25),
    );
  }
  for (let i = 0; i <= bays; i++) {
    const px = -x + i * bayWidth;
    made.front.decals.push(bar([front(px, y0), front(px, y1)], 'timber', 0.75));
  }
  made.front.decals.push(bar([front(-x, y1 - 0.35), front(x, y1 - 0.35)], 'beam', 0.8));
  const [back, left] = [made.solid.faces[3]!, made.solid.faces[4]!];
  const sideFrame = (at: (pz: number, py: number) => Vec3): Decal[] => [
    bar([at(0, y0), at(0, y1)], 'timber', 0.7),
    bar([at(-z, y0), at(-z, y1)], 'timber', 0.75),
    bar([at(z, y0), at(z, y1)], 'timber', 0.75),
    bar([at(-z, y1 - 0.35), at(z, y1 - 0.35)], 'beam', 0.8),
  ];
  made.right.decals.push(...sideFrame(right));
  left.decals.push(...sideFrame((pz, py) => [-x - FRONT_GAP, py, pz]));
  const rear = (px: number, py: number): Vec3 => [px, py, z + FRONT_GAP];
  for (let i = 0; i <= bays; i++) {
    const px = -x + i * bayWidth;
    back.decals.push(bar([rear(px, y0), rear(px, y1)], 'timber', 0.75));
  }
  back.decals.push(bar([rear(-x, y1 - 0.35), rear(x, y1 - 0.35)], 'beam', 0.8));
  return made.solid;
}
