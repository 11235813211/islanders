import { describe, expect, it } from 'vitest';
import { cameraGesture, initialCamera } from '../src/lib/boardCamera';

describe('board gesture geometry', () => {
  const rect = { left: 20, top: 80, width: 800, height: 400 },
    units = 1.5;
  const world = (camera: typeof initialCamera, point: { x: number; y: number }) => ({
    x: camera.x + ((point.x - 420) * units) / camera.zoom,
    y: camera.y + ((point.y - 280) * units) / camera.zoom,
  });
  it('anchors a wheel zoom to the world point under the pointer', () => {
    const point = { x: 510, y: 220 };
    const next = cameraGesture(initialCamera, point, point, 2, rect);
    expect(world(next, point)).toEqual(world(initialCamera, point));
  });
  it('anchors a pinch to its moving midpoint and remains reversible', () => {
    const from = { x: 480, y: 220 },
      to = { x: 500, y: 230 };
    const next = cameraGesture(initialCamera, from, to, 1.5, rect);
    expect(world(next, to)).toEqual(world(initialCamera, from));
    expect(cameraGesture(next, to, from, 1 / 1.5, rect)).toEqual(initialCamera);
  });
  it('pans in screen pixels at every zoom and clamps zoom before computing its anchor', () => {
    const camera = { x: 0, y: 0, zoom: 3.9 },
      point = { x: 470, y: 280 };
    const next = cameraGesture(camera, point, point, 10, rect);
    expect(next.zoom).toBe(4);
    expect(world(next, point).x).toBeCloseTo(world(camera, point).x);
    const pan = cameraGesture(camera, point, { x: 490, y: 280 }, 1, rect);
    expect(pan.x).toBeCloseTo((-20 * units) / 3.9);
  });
});
