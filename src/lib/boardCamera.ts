import { HEX_RADIUS } from '../../shared/board';
import type { Hex } from '../../shared/types';
import type { Frame } from '../art/types';

export interface Camera {
  /** Offset of the view's center from the frame's center, in board units. */
  x: number;
  y: number;
  zoom: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Viewport {
  left: number;
  top: number;
  width: number;
  height: number;
}
export const initialCamera: Camera = { x: 0, y: 0, zoom: 1 };

/** The standard island is drawn in a 670×600 area centered at 0,0. */
export const BASE_FRAME: Frame = { x: -335, y: -300, width: 670, height: 600 };
/** Sea around a designed board's outermost tiles. */
const MARGIN = 26;

/** The area a board is drawn in: the standard frame, or the tiles' bounds plus a sea margin. */
export function boardFrame(hexes: Pick<Hex, 'x' | 'y' | 'terrain'>[]): Frame {
  const sea = hexes.some(h => h.terrain === 'sea');
  if (!hexes.length || (!sea && hexes.length <= 19)) return BASE_FRAME;
  // The 5–6 player island gets the same sea border as the standard frame.
  const [marginX, marginY] = sea ? [MARGIN, MARGIN] : [75, 60];
  const halfWidth = (Math.sqrt(3) / 2) * HEX_RADIUS;
  const xs = hexes.map(h => h.x);
  const ys = hexes.map(h => h.y);
  const x = Math.min(...xs) - halfWidth - marginX;
  const y = Math.min(...ys) - HEX_RADIUS - marginY;
  return {
    x,
    y,
    width: Math.max(...xs) + halfWidth + marginX - x,
    height: Math.max(...ys) + HEX_RADIUS + marginY - y,
  };
}

/** The board SVG's viewBox for a camera. */
export function cameraViewBox(camera: Camera, frame: Frame = BASE_FRAME): string {
  const w = frame.width / camera.zoom;
  const h = frame.height / camera.zoom;
  const cx = frame.x + frame.width / 2 + camera.x;
  const cy = frame.y + frame.height / 2 + camera.y;
  return `${cx - w / 2} ${cy - h / 2} ${w} ${h}`;
}
/**
 * A CSS transform that makes an SVG drawn for camera `drawn` show camera `shown` instead, without
 * redrawing it (the SVG's box is `box`; its viewBox keeps the frame's shape, so the fit scale is the
 * same for every camera). Gestures move the board this way, which phones do cheaply, and the SVG is
 * redrawn for the new camera once the gesture ends.
 */
export function cameraTransform(
  drawn: Camera,
  shown: Camera,
  frame: Frame,
  box: { width: number; height: number },
): string {
  const scale = Math.min(box.width / frame.width, box.height / frame.height) * shown.zoom;
  const x = scale * (drawn.x - shown.x);
  const y = scale * (drawn.y - shown.y);
  return `translate(${x}px, ${y}px) scale(${shown.zoom / drawn.zoom})`;
}

/** Show `shown` on an SVG drawn for `drawn` (see cameraTransform); nothing when they match. */
export function previewCamera(svg: SVGSVGElement | null, drawn: Camera, shown: Camera, frame: Frame): void {
  const box = svg?.parentElement;
  if (!svg || !box) return;
  const same = drawn.x === shown.x && drawn.y === shown.y && drawn.zoom === shown.zoom;
  svg.style.transform = same
    ? ''
    : cameraTransform(drawn, shown, frame, { width: box.clientWidth, height: box.clientHeight });
  svg.style.willChange = same ? '' : 'transform';
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

/** Pan and zoom so the board point under `from` ends up under `to`, scaled by `factor`. */
export function cameraGesture(
  camera: Camera,
  from: Point,
  to: Point,
  factor: number,
  rect: Viewport,
  frame: Frame = BASE_FRAME,
  maxZoom = 4,
): Camera {
  const zoom = clamp(camera.zoom * factor, 0.8, maxZoom);
  const units = Math.max(frame.width / rect.width, frame.height / rect.height);
  const cx = rect.left + rect.width / 2,
    cy = rect.top + rect.height / 2;
  const rangeX = frame.width * 0.54;
  const rangeY = frame.height * 0.54;
  return {
    zoom,
    x: clamp(camera.x + units * ((from.x - cx) / camera.zoom - (to.x - cx) / zoom), -rangeX, rangeX),
    y: clamp(camera.y + units * ((from.y - cy) / camera.zoom - (to.y - cy) / zoom), -rangeY, rangeY),
  };
}
