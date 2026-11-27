// A curved East Asian roof built from a few numbers. The ridge runs along x, centered on the
// origin. One shape covers hipped, hip-and-gable, gable, and pyramid roofs.
import type { Vec3 } from '../projection';
import { type Decal, type Face, face, type Material, type Solid } from '../solids';

export interface RoofSpec {
  /** Half the roof's size at the eaves, overhang included. */
  halfWidth: number;
  halfDepth: number;
  /** Height of the eaves at mid-span, and of the ridge. */
  eave: number;
  ridge: number;
  /** Half the ridge length. 0 makes a pyramid. */
  ridgeHalf: number;
  /** Share of the depth the end gable spans. 0 is a plain hip; about 0.4 is hip-and-gable. */
  gable?: number;
  /** How far slopes dip below straight. */
  sag?: number;
  /** How far the eave corners rise above mid-span. */
  lift?: number;
  /** How far the eaves bow inward at mid-span, seen from above. */
  inset?: number;
  /** Thickness of the eave edge. */
  fascia?: number;
  /** Tile columns running down each long slope. */
  courses?: number;
  /** Rise of the ridge toward its ends. */
  ridgeCurve?: number;
  ridgeWidth?: number;
  material?: Material;
  eaveMaterial?: Material;
  ridgeMaterial?: Material;
  /** Width of the dark edge around ridge lines. */
  ridgeOutline?: number;
  /** Thin light mortar line along the ridge tiles. */
  ridgeMortar?: boolean;
  /** Small raised ornaments at the ridge ends, as on palace halls. */
  ridgeEnds?: boolean;
}

const STEPS = 6;
/** Slopes face the sky; full lighting would wash out the seat color that identifies the piece. */
const SLOPE_LIGHT = 0.35;
/** Evenly spaced values from `from` to `to`, both included. */
const steps = (from: number, to: number, count = STEPS) =>
  Array.from({ length: count + 1 }, (_, i) => from + ((to - from) * i) / count);

/** Builds one roof as a single solid; `layer` orders it against the walls under it. */
export function curvedRoof(spec: RoofSpec): Solid {
  const { halfWidth: W, halfDepth: D, eave, ridge, ridgeHalf: G } = spec;
  const { gable = 0, sag = 0, lift = 0, inset = 0, fascia = 0.8, ridgeCurve = 0 } = spec;
  const hipTop = 1 - gable;
  const rise = ridge - eave;
  const height = (u: number, along: number, ridgeShare: number) =>
    eave +
    rise * (u - sag * Math.sin(Math.PI * u)) +
    lift * along ** 2.4 * (1 - u) ** 1.5 +
    ridgeCurve * ridgeShare ** 2 * u ** 3;
  const bow = (size: number, u: number, along: number) => 1 - (inset / size) * (1 - along ** 2) * (1 - u);

  /** A point on the front (sz -1) or back (sz 1) slope; u runs from eave 0 to ridge 1. */
  const onLong = (x: number, u: number, sz: number): Vec3 => {
    const along = Math.abs(x) / W;
    const z = sz * D * (1 - u) * bow(D, u, along);
    return [x, height(u, along, G ? Math.abs(x) / G : 0), z];
  };
  /** A point on the right (sx 1) or left (sx -1) slope; `z` stays fixed as u climbs. */
  const onEnd = (z: number, u: number, sx: number): Vec3 => {
    const along = Math.abs(z) / D;
    const reach = W - ((W - G) * u) / (hipTop || 1);
    return [sx * reach * bow(W, u, along), height(u, along, 1), z];
  };
  const hip = (sx: number, sz: number) =>
    steps(0, hipTop).map(u => onLong(sx * (W - ((W - G) * u) / (hipTop || 1)), u, sz));
  const rake = (sx: number, sz: number) => steps(hipTop, 1, 3).map(u => onLong(sx * G, u, sz));
  const longEave = (sz: number) => steps(-W, W, 12).map(x => onLong(x, 0, sz));
  const endEave = (sx: number) => steps(-D, D, 8).map(z => onEnd(z, 0, sx));
  const crest = steps(G, -G, 8).map(x => onLong(x, 1, -1));

  const slope = rise / D;
  const endSlope = (rise * hipTop) / Math.max(W - G, 0.01);
  const faces: Face[] = [];
  const add = (f: Face, normal: Vec3, layer: number, material?: Material) => {
    Object.assign(f, { normal, layer, material });
    faces.push(f);
    return f;
  };
  const roofMaterial = spec.material ?? 'roof';
  const eaveMaterial = spec.eaveMaterial ?? 'eave';
  const ribbon = (edge: Vec3[], normal: Vec3) =>
    add(face(...edge, ...[...edge].reverse().map(([x, y, z]): Vec3 => [x, y - fascia, z])), normal, 0, eaveMaterial);

  const slopeFace = (outline: Vec3[], normal: Vec3) => {
    const slopeSide = add(face(...outline), normal, 0.2, roofMaterial);
    slopeSide.lightShare = SLOPE_LIGHT;
    return slopeSide;
  };

  const long = [-1, 1].map(sz => {
    const eaveLine = longEave(sz);
    const rim = ribbon(eaveLine, [0, 0, sz]);
    const outline = [
      ...eaveLine,
      ...hip(1, sz).slice(1),
      ...rake(1, sz).slice(1),
      ...crest.slice(1),
      ...rake(-1, sz).reverse().slice(1),
      ...hip(-1, sz).reverse().slice(1, -1),
    ];
    return { sz, rim, patch: slopeFace(outline, [0, 1, sz * slope]) };
  });
  const ends = [-1, 1].map(sx => {
    const eaveLine = endEave(sx);
    const rim = ribbon(eaveLine, [sx, 0, 0]);
    const outline = [...eaveLine, ...hip(sx, 1).slice(1), ...hip(sx, -1).reverse().slice(0, -1)];
    const patch = slopeFace(outline, [sx * endSlope, 1, 0]);
    const gableFace =
      gable > 0 ? add(face(...rake(sx, -1), ...rake(sx, 1).reverse().slice(1)), [sx, 0, 0], 0.25, 'gable') : undefined;
    return { sx, rim, patch, gableFace };
  });

  addCourses(spec, long, ends, onLong, onEnd);
  faces.push(...ridgeLines(spec, long, ends, { hip, rake, crest }));
  return { faces, center: [0, (eave + ridge) / 2, 0], edge: 0.7 };
}

type LongSlope = { sz: number; patch: Face; rim: Face };
type EndSlope = { sx: number; patch: Face; rim: Face; gableFace?: Face };

/** Tile columns, drawn on the slopes, stopping where each slope ends. */
function addCourses(
  spec: RoofSpec,
  long: LongSlope[],
  ends: EndSlope[],
  onLong: (x: number, u: number, sz: number) => Vec3,
  onEnd: (z: number, u: number, sx: number) => Vec3,
) {
  const { courses = 0, halfWidth: W, halfDepth: D, ridgeHalf: G, gable = 0 } = spec;
  if (!courses) return;
  const hipTop = 1 - gable;
  const line = (points: Vec3[]): Decal => ({ points, open: true, stroke: -0.22, width: 0.3 });
  for (const { sz, patch } of long) {
    for (const x of steps(-W, W, courses + 1).slice(1, -1)) {
      const top = Math.abs(x) <= G ? 1 : (hipTop * (W - Math.abs(x))) / (W - G);
      patch.decals.push(line(steps(0, top, 3).map(u => onLong(x, u, sz))));
    }
  }
  const endCourses = Math.max(2, Math.round((courses * D) / W));
  for (const { sx, patch } of ends) {
    for (const z of steps(-D, D, endCourses + 1).slice(1, -1)) {
      const top = Math.min(hipTop, 1 - Math.abs(z) / D);
      patch.decals.push(line(steps(0, top, 3).map(u => onEnd(z, u, sx))));
    }
  }
}

/**
 * The ridge, hips, and gable edges. Each is its own line that shows only with a slope it borders,
 * so a roof can be turned to any angle.
 */
function ridgeLines(
  spec: RoofSpec,
  long: LongSlope[],
  ends: EndSlope[],
  lines: { hip: (sx: number, sz: number) => Vec3[]; rake: (sx: number, sz: number) => Vec3[]; crest: Vec3[] },
): Face[] {
  const { ridgeWidth = 1.1, ridgeMortar = true, ridgeEnds = false, ridgeOutline = 0.5 } = spec;
  const eaveMaterial = spec.eaveMaterial ?? 'eave';
  const ridgeMaterial = spec.ridgeMaterial ?? eaveMaterial;
  const tube = (points: Vec3[], width: number, stroke: Material): Decal[] => [
    { points, open: true, width: width + ridgeOutline },
    { points, open: true, width, stroke },
  ];
  const lineFace = (points: Vec3[], slopes: Face[], decals: Decal[]) => {
    const result = face(...points);
    Object.assign(result, { linesWith: slopes, layer: 0.4, decals });
    return result;
  };
  const edge = (points: Vec3[], slopes: Face[]) =>
    lineFace(points, slopes, tube(points, ridgeWidth * 0.5, eaveMaterial));

  const result: Face[] = [];
  for (const { sz, rim } of long) {
    for (const end of ends) {
      // A hip shows when a wall-side of the roof next to it faces the viewer; otherwise it is behind the roof.
      result.push(edge(lines.hip(end.sx, sz), [rim, end.rim]));
      // A gable edge belongs to its gable: on the far side it would cut across the near slope.
      if (end.gableFace) result.push(edge(lines.rake(end.sx, sz), [end.gableFace]));
    }
  }
  const crest = tube(lines.crest, ridgeWidth, ridgeMaterial);
  if (ridgeMortar) {
    const mortar = lines.crest.map(([x, y, z]): Vec3 => [x, y - ridgeWidth * 0.12, z]);
    crest.push({ points: mortar, open: true, width: 0.26, stroke: 'ridge' });
  }
  if (ridgeEnds) {
    for (const [x, y, z] of [lines.crest[0]!, lines.crest[lines.crest.length - 1]!]) {
      const end: Vec3[] = [
        [x, y, z],
        [x + Math.sign(x) * 0.2, y + 0.55, z],
      ];
      crest.push(...tube(end, 0.55, eaveMaterial));
    }
  }
  result.push(
    lineFace(
      lines.crest,
      long.map(s => s.patch),
      crest,
    ),
  );
  return result;
}
