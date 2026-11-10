import { Maximize, Minus, Plus } from 'lucide-react';
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { Frame } from '../../art';
import {
  type Camera,
  cameraGesture,
  cameraViewBox,
  initialCamera,
  type Point,
  previewCamera,
} from '../../lib/boardCamera';

const center = (points: Point[]) => ({
  x: points.reduce((n, p) => n + p.x, 0) / points.length,
  y: points.reduce((n, p) => n + p.y, 0) / points.length,
});
const spread = (points: Point[]) =>
  points.length < 2 ? 1 : Math.max(1, Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y));

/** How long after the last wheel tick the view is redrawn for the new camera. */
const WHEEL_SETTLE_MS = 150;

/**
 * An SVG you can pan (drag), zoom (wheel, pinch, buttons), and reset, for looking closely at a
 * map. Like the game board (BoardViewport), a gesture only moves the drawing with a CSS transform;
 * the SVG is redrawn for the new camera once, when the gesture ends.
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
  const svg = useRef<SVGSVGElement>(null);
  const [camera, setCamera] = useState<Camera>(initialCamera);
  const pointers = useRef(new Map<number, Point>());
  /** The camera being shown (ahead of `camera` during a gesture). */
  const shown = useRef(camera);
  const drawn = useRef(camera);
  const base = useRef({ camera, points: [] as Point[] });
  const frameId = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rebase = () => {
    base.current = { camera: shown.current, points: [...pointers.current.values()] };
  };
  // Drawn for real: the gesture's transform comes off.
  useLayoutEffect(() => {
    drawn.current = camera;
    shown.current = camera;
    previewCamera(svg.current, camera, camera, frame);
  }, [camera, frame]);
  const preview = (next: Camera) => {
    shown.current = next;
    if (frameId.current) return;
    frameId.current = requestAnimationFrame(() => {
      frameId.current = 0;
      previewCamera(svg.current, drawn.current, shown.current, frame);
    });
  };
  const commit = () => {
    clearTimeout(settle.current);
    setCamera(shown.current);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: handlers read refs; bound once per frame.
  useEffect(() => {
    const element = root.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = { x: event.clientX, y: event.clientY };
      preview(
        cameraGesture(
          shown.current,
          point,
          point,
          Math.exp(-event.deltaY * 0.002),
          element.getBoundingClientRect(),
          frame,
          6,
        ),
      );
      clearTimeout(settle.current);
      settle.current = setTimeout(commit, WHEEL_SETTLE_MS);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', wheel);
      cancelAnimationFrame(frameId.current);
      clearTimeout(settle.current);
    };
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
    preview(
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
    if (!pointers.current.delete(event.pointerId)) return;
    rebase();
    if (!pointers.current.size) commit();
  };
  const zoom = (factor: number) => {
    const rect = root.current!.getBoundingClientRect();
    const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    shown.current = cameraGesture(shown.current, point, point, factor, rect, frame, 6);
    commit();
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
      <svg ref={svg} viewBox={cameraViewBox(camera, frame)} role="img" aria-label={label}>
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
        <button
          type="button"
          aria-label="Reset map view"
          onClick={() => {
            shown.current = initialCamera;
            commit();
          }}
        >
          <Maximize size={17} />
        </button>
      </div>
    </div>
  );
}
