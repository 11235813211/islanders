// 3D building blocks for pieces, and the renderer that draws them through the camera in
// projection.ts: faces turned away are skipped, the rest are painted back to front.
import {
  type Camera,
  centroid,
  cross,
  DEFAULT_CAMERA,
  depth,
  dot,
  facesCamera,
  frontLight,
  lighting,
  normalize,
  project,
  sub,
  type Vec3,
} from './projection';

/** Mix a #rrggbb color toward white (amount > 0) or black (amount < 0). */
export function tone(hex: string, amount: number): string {
  const target = amount > 0 ? 255 : 0;
  const mix = Math.abs(amount);
  const channels = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
  return `#${channels
    .map(c => Math.round(c + (target - c) * mix))
    .map(c => c.toString(16).padStart(2, '0'))
    .join('')}`;
}
/** Every edge on a piece is drawn in this dark tone of the seat color. */
export const outlineTone = (color: string) => tone(color, -0.62);

/** A named surface a design colors through its palette, e.g. `roof` or `timber`. */
export type Material = string;
/** Material colors for one piece. `seat` is always the player's color. */
export type Palette = Record<Material, string>;
/** A shade relative to the face beneath, the dark outline tone, or a palette material. */
export type Paint = number | 'line' | Material;

/** Something drawn flat on a face: a door, window, band of stone, or a line of trim. */
export interface Decal {
  points: Vec3[];
  /** Omit for a bare line. */
  fill?: Paint;
  /** Line color; the dark outline tone when omitted. */
  stroke?: Paint;
  width?: number;
  open?: boolean;
}
export interface Face {
  points: Vec3[];
  decals: Decal[];
  /** Palette material of the face; the seat color when omitted. */
  material?: Material;
  /** Outward direction, for curved faces whose first three points do not give it. */
  normal?: Vec3;
  /** Added to the solid's layer, to order parts of one solid. */
  layer?: number;
  /** Share of the light and shade to apply, so large roofs keep their color. Default 1. */
  lightShare?: number;
  /** Draws only its decals, and only while one of these faces is showing (roof ridges). */
  linesWith?: Face[];
}
export interface Solid {
  faces: Face[];
  /** Any point inside, used to tell which way each face points. */
  center: Vec3;
  /** Outline width; small parts like chimneys use a finer line. */
  edge?: number;
  /** Lower layers are drawn first; within a layer, farther faces are drawn first. */
  layer?: number;
}

export const face = (...points: Vec3[]): Face => ({ points, decals: [] });

/** Lighter than a front wall means lit (roofs), darker means shaded (side walls). Fronts keep the seat color. */
const shadeFor = (light: number, front: number) => Math.max(-0.34, Math.min(0.34, (light - front) * 0.7));

function outwardNormal(f: Face, center: Vec3): Vec3 {
  if (f.normal) return normalize(f.normal);
  const [a, b, c] = f.points as [Vec3, Vec3, Vec3];
  const n = normalize(cross(sub(b, a), sub(c, a)));
  return dot(n, sub(centroid(f.points), center)) < 0 ? [-n[0], -n[1], -n[2]] : n;
}

const pathOf = (points: readonly Vec3[], camera: Camera, open = false) =>
  `M${points
    .map(p =>
      project(p, camera)
        .map(n => n.toFixed(2))
        .join(' '),
    )
    .join('L')}${open ? '' : 'Z'}`;

/** The faces to draw, in painting order: by layer, then back to front. */
function visibleFaces(solids: Solid[], camera: Camera) {
  const all = solids.flatMap(solid =>
    solid.faces.map(f => ({
      f,
      edge: solid.edge ?? 1.1,
      layer: (solid.layer ?? 0) + (f.layer ?? 0),
      normal: f.linesWith ? ([0, 0, -1] as Vec3) : outwardNormal(f, solid.center),
    })),
  );
  const facing = new Set(
    all.filter(({ f, normal }) => !f.linesWith && facesCamera(normal, centroid(f.points), camera)).map(({ f }) => f),
  );
  return all
    .filter(({ f }) => (f.linesWith ? f.linesWith.some(other => facing.has(other)) : facing.has(f)))
    .sort((a, b) => a.layer - b.layer || depth(centroid(b.f.points), camera) - depth(centroid(a.f.points), camera));
}

/** Draws solids in one seat color, with lighting and outlines. `palette` colors any named materials. */
export function Solids({
  solids,
  color,
  palette,
  camera = DEFAULT_CAMERA,
}: {
  solids: Solid[];
  color: string;
  palette?: Palette;
  camera?: Camera;
}) {
  const front = frontLight(camera);
  const line = outlineTone(color);
  const stroke = { strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  const base = (material: Material | undefined) => palette?.[material ?? 'seat'] ?? color;
  const paint = (p: Paint | undefined, under: string, none: string) => {
    if (p === undefined) return none;
    if (p === 'line') return line;
    return typeof p === 'number' ? tone(under, p) : base(p);
  };
  return (
    <>
      {visibleFaces(solids, camera).map(({ f, edge, normal }, i) => {
        const fill = tone(base(f.material), shadeFor(lighting(normal, camera), front) * (f.lightShare ?? 1));
        return (
          <g key={i}>
            {!f.linesWith && (
              <path d={pathOf(f.points, camera)} fill={fill} strokeWidth={edge} stroke={line} {...stroke} />
            )}
            {f.decals.map((d, j) => (
              <path
                key={j}
                d={pathOf(d.points, camera, d.open)}
                fill={paint(d.fill, fill, 'none')}
                strokeWidth={d.width ?? 0.55}
                stroke={paint(d.stroke, fill, line)}
                {...stroke}
              />
            ))}
          </g>
        );
      })}
    </>
  );
}

/** Give every face of these solids a material. */
export function paintFaces(solid: Solid, material: Material): Solid {
  for (const f of solid.faces) f.material = material;
  return solid;
}

/** An axis-aligned box from (x0, y0, z0) to (x1, y1, z1). */
export function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  const front = face([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]);
  const right = face([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]);
  const top = face([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]);
  const solid: Solid = {
    faces: [
      front,
      right,
      top,
      face([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]),
      face([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]),
    ],
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  };
  return { solid, front, right, top };
}

export interface HouseSpec {
  /** Center of the footprint on the ground. */
  x: number;
  z: number;
  width: number;
  depth: number;
  wall: number;
  /** Height of the roof's peak above the walls. */
  rise: number;
  overhang: number;
  /** Overhang past the left or right wall when it differs, e.g. 0 where two buildings join. */
  overhangLeft?: number;
  overhangRight?: number;
  /** Thickness of the roof's edge. */
  fascia: number;
}

/**
 * A house with its gable facing the viewer: four walls and a roof whose edges overhang them.
 * Returns the faces that carry doors and windows, and helpers for placing things on them.
 */
export function gabledHouse(spec: HouseSpec) {
  const { x, z, width, wall, rise, overhang: o, fascia: t } = spec;
  const [x0, x1, z0, z1] = [x - width / 2, x + width / 2, z - spec.depth / 2, z + spec.depth / 2];
  const slope = rise / (width / 2);
  const peak = wall + rise;
  const [oLeft, oRight] = [spec.overhangLeft ?? o, spec.overhangRight ?? o];
  const [left, right, front, back] = [x0 - oLeft, x1 + oRight, z0 - o, z1 + o];
  const [eaveLeft, eaveRight] = [wall - oLeft * slope, wall - oRight * slope];
  const eave = wall - o * slope;
  const gableFront = face([x0, 0, z0], [x1, 0, z0], [x1, wall, z0], [x, peak, z0], [x0, wall, z0]);
  const rightWall = face([x1, 0, z0], [x1, 0, z1], [x1, wall, z1], [x1, wall, z0]);
  const walls: Solid = {
    faces: [
      gableFront,
      rightWall,
      face([x0, 0, z1], [x1, 0, z1], [x1, wall, z1], [x, peak, z1], [x0, wall, z1]),
      face([x0, 0, z0], [x0, 0, z1], [x0, wall, z1], [x0, wall, z0]),
    ],
    center: [x, wall / 2, z],
  };
  const [eL, eR] = [eaveLeft, eaveRight];
  const roofRight = face([x, peak + t, front], [x, peak + t, back], [right, eR + t, back], [right, eR + t, front]);
  const roof: Solid = {
    faces: [
      roofRight,
      face([x, peak + t, front], [x, peak + t, back], [left, eL + t, back], [left, eL + t, front]),
      face([x, peak + t, front], [right, eR + t, front], [right, eR, front], [x, peak, front]),
      face([x, peak + t, front], [left, eL + t, front], [left, eL, front], [x, peak, front]),
      face([right, eR + t, front], [right, eR + t, back], [right, eR, back], [right, eR, front]),
      face([left, eL + t, front], [left, eL + t, back], [left, eL, back], [left, eL, front]),
    ],
    center: [x, wall + rise / 2, z],
  };
  return {
    solids: [walls, roof],
    front: gableFront,
    right: rightWall,
    spec,
    x0,
    x1,
    z0,
    z1,
    peak,
    /** Height of the roof's outer edge underneath, at the tips: anything below it sits under the eaves. */
    eave,
    /** A point on the front wall (just in front of it). */
    onFront: (px: number, py: number): Vec3 => [px, py, z0 - 0.02],
    /** A point on the right wall (just outside it). */
    onRight: (pz: number, py: number): Vec3 => [x1 + 0.02, py, pz],
    /** Height of the roof's top surface above a point right of the ridge. */
    roofAt: (px: number) => peak + t - (px - x) * slope,
  };
}
export type House = ReturnType<typeof gabledHouse>;

/** Outline of an arched opening from `left` to `right`, standing on `bottom`, `top` high at its crown. */
export function arch(left: number, right: number, bottom: number, top: number): [number, number][] {
  const r = (right - left) / 2;
  const curve = Array.from({ length: 7 }, (_, i) => {
    const a = Math.PI - (i / 6) * Math.PI;
    return [left + r + r * Math.cos(a), top - r + r * Math.sin(a)] as [number, number];
  });
  return [[left, bottom], ...curve, [right, bottom]];
}

/** Corners of a rectangle, for decals. */
export const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/**
 * A chimney standing on the right roof slope at (x, z). Keep z in the front half of the roof so
 * the back-to-front drawing puts it over the roof, not under.
 */
export function chimney(house: House, x: number, z: number, height: number): Solid {
  const half = 0.7;
  const [x0, x1, z0, z1] = [x - half, x + half, z - half, z + half];
  const top = house.roofAt(x0) + height;
  // The base follows the roof: each bottom corner sits on the slope, so the front's lower edge slants with it.
  const [low, high] = [house.roofAt(x1), house.roofAt(x0)];
  return {
    faces: [
      face([x0, high, z0], [x1, low, z0], [x1, top, z0], [x0, top, z0]),
      face([x1, low, z0], [x1, low, z1], [x1, top, z1], [x1, top, z0]),
      face([x0, top, z0], [x1, top, z0], [x1, top, z1], [x0, top, z1]),
      face([x0, high, z1], [x1, low, z1], [x1, top, z1], [x0, top, z1]),
      face([x0, high, z0], [x0, high, z1], [x0, top, z1], [x0, top, z0]),
    ],
    center: [x, (low + top) / 2, z],
    edge: 0.55,
  };
}
