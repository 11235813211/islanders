import type { RailPoint } from '../../../../shared/maps/candy-train';

/** Rail centerline clearance from road edges; rounded bends also clear settlement corners. */
export const RAIL_OFFSET = 15;
export interface RailSample extends RailPoint {
  distance: number;
}
const mix = (a: RailPoint, b: RailPoint, t: number): RailPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Offset a connected edge path and round the bends so cars turn gradually. */
export function railPath(corners: RailPoint[], side: 1 | -1): RailSample[] {
  if (corners.length < 2) return [];
  const normals = corners.slice(1).map((b, i) => {
    const a = corners[i]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: (-(b.y - a.y) / d) * side, y: ((b.x - a.x) / d) * side };
  });
  const offset = corners.map((p, i) => {
    const a = normals[Math.max(0, i - 1)]!,
      b = normals[Math.min(i, normals.length - 1)]!;
    const factor = RAIL_OFFSET / (1 + a.x * b.x + a.y * b.y);
    return { x: p.x + (a.x + b.x) * factor, y: p.y + (a.y + b.y) * factor };
  });
  const points: RailPoint[] = [offset[0]!];
  for (let i = 1; i < offset.length - 1; i++) {
    const p = offset[i]!,
      before = offset[i - 1]!,
      after = offset[i + 1]!;
    const a = mix(p, before, 0.24),
      b = mix(p, after, 0.24);
    points.push(a);
    for (let j = 1; j <= 10; j++) {
      const t = j / 10;
      points.push(mix(mix(a, p, t), mix(p, b, t), t));
    }
  }
  points.push(offset.at(-1)!);
  let distance = 0;
  return points.map((p, i) => {
    if (i) distance += Math.hypot(p.x - points[i - 1]!.x, p.y - points[i - 1]!.y);
    return { ...p, distance };
  });
}

/** Position and heading a fixed distance along the same line the rails use. */
export function onRail(path: RailSample[], distance: number) {
  const d = Math.max(0, Math.min(path.at(-1)!.distance, distance));
  const i = Math.max(
    1,
    path.findIndex(p => p.distance >= d),
  );
  const a = path[i - 1]!,
    b = path[i]!;
  const p = mix(a, b, (d - a.distance) / Math.max(0.001, b.distance - a.distance));
  return { ...p, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

/**
 * How far along a railPath its `corner`-th corner lies (of `corners`): the middle of that bend's
 * rounding, as railPath adds 11 points for each inner corner.
 */
export function cornerDistance(path: RailSample[], corner: number, corners: number): number {
  if (corner <= 0) return 0;
  if (corner >= corners - 1) return path.at(-1)!.distance;
  return path[1 + (corner - 1) * 11 + 5]!.distance;
}
