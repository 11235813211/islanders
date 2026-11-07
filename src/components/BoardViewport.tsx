import { Maximize, Minus, Plus } from 'lucide-react';
import { type ReactNode, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { type Camera, cameraGesture, initialCamera, type Point } from '../lib/boardCamera';
import Board, { type BoardProps } from './Board';

const center = (points: Point[]) => ({
  x: points.reduce((n, p) => n + p.x, 0) / points.length,
  y: points.reduce((n, p) => n + p.y, 0) / points.length,
});
const distance = (points: Point[]) =>
  points.length < 2 ? 1 : Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
export default function BoardViewport({
  children,
  corner,
  ...props
}: Omit<BoardProps, 'camera'> & { children?: ReactNode; corner?: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState(initialCamera),
    current = useRef(camera);
  const pointers = useRef(new Map<number, Point>());
  const baseline = useRef({ camera, points: [] as Point[] });
  const dragged = useRef(false),
    suppressClick = useRef(false);
  const update = (next: Camera) => {
    current.current = next;
    setCamera(next);
  };
  const rebase = () => {
    baseline.current = { camera: current.current, points: [...pointers.current.values()] };
  };
  const ignored = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest('button, input, select, .board-notices, .board-corner, .map-confirm');
  useEffect(() => {
    const element = root.current!;
    const wheel = (event: WheelEvent) => {
      if (ignored(event.target)) return;
      event.preventDefault();
      const point = { x: event.clientX, y: event.clientY };
      update(
        cameraGesture(current.current, point, point, Math.exp(-event.deltaY * 0.002), element.getBoundingClientRect()),
      );
      rebase();
    };
    const move = (event: PointerEvent) => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const points = [...pointers.current.values()],
        base = baseline.current;
      const from = center(base.points),
        to = center(points);
      if (!dragged.current && points.length === 1 && Math.hypot(to.x - from.x, to.y - from.y) <= 6) return;
      dragged.current = true;
      suppressClick.current = true;
      if (event.cancelable) event.preventDefault();
      for (const id of pointers.current.keys()) {
        try {
          element.setPointerCapture(id);
        } catch {
          /* Pointer already released. */
        }
      }
      update(
        cameraGesture(base.camera, from, to, distance(points) / distance(base.points), element.getBoundingClientRect()),
      );
    };
    const up = (event: PointerEvent) => {
      if (!pointers.current.delete(event.pointerId)) return;
      rebase();
      if (!pointers.current.size) dragged.current = false;
    };
    const cancelAll = () => {
      pointers.current.clear();
      dragged.current = false;
      suppressClick.current = false;
      rebase();
    };
    element.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    element.addEventListener('lostpointercapture', up);
    window.addEventListener('blur', cancelAll);
    return () => {
      element.removeEventListener('wheel', wheel);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      element.removeEventListener('lostpointercapture', up);
      window.removeEventListener('blur', cancelAll);
    };
  }, []);
  function down(event: ReactPointerEvent) {
    suppressClick.current = false;
    if (ignored(event.target) || (event.pointerType === 'mouse' && event.button !== 0) || pointers.current.size >= 2)
      return;
    if (!pointers.current.size) dragged.current = false;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    rebase();
  }
  const zoom = (factor: number) => {
    const rect = root.current!.getBoundingClientRect(),
      point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    update(cameraGesture(current.current, point, point, factor, rect));
    rebase();
  };
  return (
    <div
      ref={root}
      className="board-viewport"
      data-zoom={camera.zoom.toFixed(2)}
      onPointerDown={down}
      onClickCapture={event => {
        if (suppressClick.current && !ignored(event.target)) {
          event.stopPropagation();
          event.preventDefault();
        }
        suppressClick.current = false;
      }}
    >
      <Board {...props} camera={camera} />
      <div className="board-notices">{children}</div>
      {corner && <div className="board-corner">{corner}</div>}
      <div className="zoom-controls" aria-label="Board navigation">
        <button aria-label="Zoom in" onClick={() => zoom(1.25)}>
          <Plus size={18} />
        </button>
        <button aria-label="Zoom out" onClick={() => zoom(0.8)}>
          <Minus size={18} />
        </button>
        <button
          aria-label="Reset board view"
          onClick={() => {
            update(initialCamera);
            rebase();
          }}
        >
          <Maximize size={17} />
        </button>
      </div>
    </div>
  );
}
