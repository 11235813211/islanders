export interface Camera {
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
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function cameraGesture(camera: Camera, from: Point, to: Point, factor: number, rect: Viewport): Camera {
  const zoom = clamp(camera.zoom * factor, 0.8, 4);
  const units = Math.max(670 / rect.width, 600 / rect.height);
  const cx = rect.left + rect.width / 2,
    cy = rect.top + rect.height / 2;
  return {
    zoom,
    x: clamp(camera.x + units * ((from.x - cx) / camera.zoom - (to.x - cx) / zoom), -360, 360),
    y: clamp(camera.y + units * ((from.y - cy) / camera.zoom - (to.y - cy) / zoom), -320, 320),
  };
}
