import { describe, expect, it } from 'vitest';
import { cameraGesture, cameraTransform, cameraViewBox, initialCamera } from '../src/lib/boardCamera';

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

describe('moving the drawn board during a gesture', () => {
  /** Where a board point lands in an SVG box for a viewBox, as the browser lays it out ("meet"). */
  const onScreen = (viewBox: string, box: { width: number; height: number }, point: { x: number; y: number }) => {
    const [vx, vy, vw, vh] = viewBox.split(' ').map(Number) as [number, number, number, number];
    const scale = Math.min(box.width / vw, box.height / vh);
    return {
      x: (box.width - vw * scale) / 2 + (point.x - vx) * scale,
      y: (box.height - vh * scale) / 2 + (point.y - vy) * scale,
    };
  };
  /** The same point after the CSS transform (origin at the box's center). */
  const moved = (transform: string, box: { width: number; height: number }, p: { x: number; y: number }) => {
    const [, tx, ty, s] = transform.match(/translate\((.+)px, (.+)px\) scale\((.+)\)/)!.map(Number) as number[];
    return {
      x: box.width / 2 + tx! + s! * (p.x - box.width / 2),
      y: box.height / 2 + ty! + s! * (p.y - box.height / 2),
    };
  };

  it('shows exactly what redrawing for the new camera would, for any pan and zoom, in any box', () => {
    const frame = { x: -400, y: -300, width: 820, height: 610 };
    for (const box of [
      { width: 390, height: 520 },
      { width: 844, height: 300 },
    ])
      for (const [drawn, shown] of [
        [initialCamera, { x: 40, y: -25, zoom: 1.6 }],
        [
          { x: -60, y: 30, zoom: 2.5 },
          { x: 10, y: 80, zoom: 0.9 },
        ],
      ] as const)
        for (const point of [
          { x: 0, y: 0 },
          { x: 210, y: -140 },
          { x: -350, y: 260 },
        ]) {
          const expected = onScreen(cameraViewBox(shown, frame), box, point);
          const actual = moved(
            cameraTransform(drawn, shown, frame, box),
            box,
            onScreen(cameraViewBox(drawn, frame), box, point),
          );
          expect(actual.x).toBeCloseTo(expected.x, 6);
          expect(actual.y).toBeCloseTo(expected.y, 6);
        }
  });
});
