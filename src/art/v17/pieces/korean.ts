// The Korean piece style: a small tiled house, and a palace hall on stone terraces for the city.
import type { Camera } from '../projection';
import { box, type Palette, paintFaces, type Solid, tone } from '../solids';
import type { PieceDesign } from './design';
import { curvedRoof, type RoofSpec } from './roofs';
import { hall, platform } from './timber';

/** Seat-colored tile over natural plaster, timber, and stone. */
const palette = (seat: string): Palette => ({
  seat,
  roof: seat,
  eave: tone(seat, -0.42),
  ridge: '#f1eadb',
  gable: '#6a4935',
  wall: '#eee4cf',
  timber: '#5d3f2e',
  beam: '#5d3f2e',
  paper: '#fbf5e6',
  stone: '#aaa597',
});

/** A little lower and more head-on than other pieces, so the doors show under the eaves. */
const CAMERA: Camera = { yaw: (19 * Math.PI) / 180, pitch: (14 * Math.PI) / 180, distance: 130 };

/** The look shared by tiled roofs: concave slopes, raised corners, eaves bowed inward. */
const TILE: Partial<RoofSpec> = { sag: 0.12, lift: 1.25, inset: 0.75, ridgeCurve: 0.35, gable: 0.42, fascia: 0.75 };

type RoofSize = Pick<RoofSpec, 'halfWidth' | 'halfDepth' | 'eave' | 'ridge' | 'ridgeHalf'>;
const tiled = (spec: RoofSize & Partial<RoofSpec>) =>
  curvedRoof({ ...TILE, courses: Math.round(spec.halfWidth * 1.1), ...spec });

/** Palace ridges are white lime plaster: a fine line along the top. */
const PLASTER_RIDGE: Partial<RoofSpec> = {
  ridgeMaterial: 'ridge',
  ridgeMortar: false,
  ridgeWidth: 0.62,
  ridgeOutline: 0.3,
};

/** The settlement: one hall on a low platform under a tiled hip-and-gable roof. */
function smallHouse(): Solid[] {
  return [
    { ...platform(11.2, 8.4, 0, 1.1), layer: 0 },
    { ...hall({ width: 9, depth: 6.2, y0: 1.1, y1: 6.1, bays: 3, doors: [1] }), layer: 1 },
    { ...tiled({ halfWidth: 7.4, halfDepth: 5.6, eave: 5.9, ridge: 10.2, ridgeHalf: 3.9 }), layer: 2 },
  ];
}

/** A flight of steps up the front of a terrace, centered at depth `z`. */
function stairs(width: number, y0: number, y1: number, z: number): Solid {
  const made = box(-width / 2, width / 2, y0, y1, z - 1, z + 1);
  const y = (y0 + y1) / 2;
  made.front.decals.push({
    points: [
      [-width / 2, y, z - 1.02],
      [width / 2, y, z - 1.02],
    ],
    open: true,
    width: 0.3,
  });
  return { ...paintFaces(made.solid, 'stone'), edge: 0.6 };
}

/** The city: a throne hall with a double roof on two stone terraces with stairs. */
function palaceHall(): Solid[] {
  return [
    { ...platform(26, 16, 0, 1.6), layer: 0 },
    { ...stairs(4.4, 0, 1.6, -9), layer: 0.5 },
    { ...platform(21.5, 12, 1.6, 3.2), layer: 1 },
    { ...stairs(3.8, 1.6, 3.2, -7), layer: 1.5 },
    { ...hall({ width: 15.5, depth: 7, y0: 3.2, y1: 7.3, bays: 5, doors: [1, 2, 3] }), layer: 2 },
    {
      ...tiled({
        halfWidth: 11.4,
        halfDepth: 5.6,
        eave: 7.1,
        ridge: 9.8,
        ridgeHalf: 7,
        gable: 0,
        ...PLASTER_RIDGE,
      }),
      layer: 3,
    },
    { ...hall({ width: 11.5, depth: 4.8, y0: 9, y1: 11.5, bays: 3 }), layer: 4 },
    {
      ...tiled({
        halfWidth: 10.2,
        halfDepth: 5,
        eave: 11.3,
        ridge: 15.4,
        ridgeHalf: 5.6,
        ridgeEnds: true,
        ...PLASTER_RIDGE,
      }),
      layer: 5,
    },
  ];
}

/** The Korean style. Settlement and city share one camera, as every design's pieces do. */
export const KOREAN_DESIGN: PieceDesign = {
  build: city => (city ? palaceHall() : smallHouse()),
  settlementScale: 1.95,
  cityScale: 1.66,
  palette,
  camera: CAMERA,
};
