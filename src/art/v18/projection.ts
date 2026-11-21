// A tiny 3D camera for board pieces. Pieces are modeled in 3D and projected with real
// perspective, so parallel edges meet at vanishing points instead of staying parallel.
// World axes: x to the right, y up, z away from the viewer. The ground is y = 0.

export type Vec3 = readonly [number, number, number];

/** Where a piece is viewed from: angles in radians, and distance in model units (smaller means stronger perspective). */
export interface Camera {
  yaw: number;
  pitch: number;
  distance: number;
}
/** Mostly head-on with a little of the right side, from a little above: the roof and side show, gently. */
export const DEFAULT_CAMERA: Camera = { yaw: (26 * Math.PI) / 180, pitch: (22 * Math.PI) / 180, distance: 130 };
/** Light from the upper left, slightly in front, in camera space. */
const LIGHT: Vec3 = normalize([-0.45, 0.78, -0.45]);

export function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const centroid = (points: readonly Vec3[]): Vec3 =>
  points
    .reduce<Vec3>((sum, p) => [sum[0] + p[0], sum[1] + p[1], sum[2] + p[2]], [0, 0, 0])
    .map(n => n / points.length) as unknown as Vec3;

/** Rotate a world point or direction into camera space (no perspective). */
export function toCamera([x, y, z]: Vec3, { yaw, pitch }: Camera = DEFAULT_CAMERA): Vec3 {
  const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
  const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
  return [x1, y * Math.cos(pitch) + z1 * Math.sin(pitch), -y * Math.sin(pitch) + z1 * Math.cos(pitch)];
}

/** Screen position of a world point (SVG units, y down). */
export function project(point: Vec3, camera: Camera = DEFAULT_CAMERA): [number, number] {
  const [x, y, z] = toCamera(point, camera);
  const scale = camera.distance / (camera.distance + z);
  return [x * scale, -y * scale];
}

/** Camera depth of a world point: larger is farther away. */
export const depth = (point: Vec3, camera: Camera = DEFAULT_CAMERA) => toCamera(point, camera)[2];

/** Whether a face with this outward normal, at this point, turns toward the camera. */
export function facesCamera(normal: Vec3, at: Vec3, camera: Camera = DEFAULT_CAMERA): boolean {
  const n = toCamera(normal, camera);
  const [x, y, z] = toCamera(at, camera);
  return dot(n, [-x, -y, -camera.distance - z]) > 0;
}

/** How brightly a face is lit, about -1 (away from the light) to 1 (straight at it). */
export const lighting = (normal: Vec3, camera: Camera = DEFAULT_CAMERA) =>
  dot(normalize(toCamera(normal, camera)), LIGHT);
/** The light on a wall facing the viewer: such walls keep the plain seat color. */
export const frontLight = (camera: Camera = DEFAULT_CAMERA) => lighting([0, 0, -1], camera);
