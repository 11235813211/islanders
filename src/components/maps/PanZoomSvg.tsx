import { Maximize, Minus, Plus } from 'lucide-react';
import { type ReactNode, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import type { Frame } from '../../art';
import { type Camera, cameraGesture, cameraViewBox, initialCamera, type Point } from '../../lib/boardCamera';

const center = (points: Point[]) => ({
  x: points.reduce((n, p) => n + p.x, 0) / points.length,
  y: points.reduce((n, p) => n + p.y, 0) / points.length,
});
const spread = (points: Point[]) =>
  points.length < 2 ? 1 : Math.max(1, Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y));

/**
 * An SVG you can pan (drag), zoom (wheel, pinch, buttons), and reset, for looking closely at a
 * map. Not for the game board, which has its own faster viewport (BoardViewport).
 */
export default function PanZoomSvg({
  frame,
  label,
  defs,
  children,
}: {
  frame: Frame;
  label: string;
  defs?: ReactNode;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>(initialCamera);
  const pointers = useRef(new Map<number, Point>());
  const base = useRef({ camera, points: [] as Point[] });
  const latest = useRef(camera);
  latest.current = camera;
  const rebase = () => {
    base.current = { camera: latest.current, points: [...pointers.current.values()] };
  };
  useEffect(() => {
    const element = root.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = { x: event.clientX, y: event.clientY };
      setCamera(c =>
        cameraGesture(c, point, point, Math.exp(-event.deltaY * 0.002), element.getBoundingClientRect(), frame, 6),
      );
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [frame]);
  const down = (event: ReactPointerEvent) => {
    if ((event.target as Element).closest('button')) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    rebase();
  };
  const move = (event: ReactPointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    const { camera: start, points: from } = base.current;
    setCamera(
      cameraGesture(
        start,
        center(from),
        center(points),
        spread(points) / spread(from),
        root.current!.getBoundingClientRect(),
        frame,
        6,
      ),
    );
  };
  const up = (event: ReactPointerEvent) => {
    pointers.current.delete(event.pointerId);
    rebase();
  };
  const zoom = (factor: number) => {
    const rect = root.current!.getBoundingClientRect();
    const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    setCamera(c => cameraGesture(c, point, point, factor, rect, frame, 6));
  };
  return (
    <div
      ref={root}
      className="pan-zoom"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <svg viewBox={cameraViewBox(camera, frame)} role="img" aria-label={label}>
        {defs && <defs>{defs}</defs>}
        {children}
      </svg>
      <div className="zoom-controls" aria-label="Map navigation">
        <button type="button" aria-label="Zoom in" onClick={() => zoom(1.3)}>
          <Plus size={18} />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoom(0.77)}>
          <Minus size={18} />
        </button>
        <button type="button" aria-label="Reset map view" onClick={() => setCamera(initialCamera)}>
          <Maximize size={17} />
        </button>
      </div>
    </div>
  );
}
