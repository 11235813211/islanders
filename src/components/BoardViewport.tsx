import { Maximize, Minus, Plus } from 'lucide-react';
import { type ReactNode, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef } from 'react';
import {
  boardFrame,
  type Camera,
  cameraGesture,
  cameraViewBox,
  initialCamera,
  type Point,
  previewCamera,
} from '../lib/boardCamera';
import Board, { type BoardProps } from './Board';

const center = (points: Point[]) => ({
  x: points.reduce((n, p) => n + p.x, 0) / points.length,
  y: points.reduce((n, p) => n + p.y, 0) / points.length,
});
const distance = (points: Point[]) =>
  points.length < 2 ? 1 : Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
/** Pixels a single finger or mouse may wander before a press counts as a drag rather than a tap. */
const TAP_SLOP = 6;
/** How long after the last wheel tick the board is redrawn for the new camera. */
const WHEEL_SETTLE_MS = 150;

/**
 * Pan and zoom wrapper around the board. During a gesture the drawn board is only moved with a CSS
 * transform once per frame (redrawing the illustrated SVG per finger move is too slow on phones);
 * when the gesture ends the SVG's viewBox is set directly, without a React render. The board itself
 * only re-renders when what it shows changes, not on every tick of the table's clock, so the main
 * thread stays free for the fingers.
 */
export default function BoardViewport({
  children,
  corner,
  ...props
}: Omit<BoardProps, 'camera'> & { children?: ReactNode; corner?: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  /** The camera shown now (during a gesture, ahead of the drawn one). */
  const current = useRef(initialCamera);
  /** The camera the board SVG is drawn for; gestures show other cameras by moving that drawing. */
  const drawn = useRef(initialCamera);
  const animationFrame = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pointers = useRef(new Map<number, Point>());
  const baseline = useRef({ camera: initialCamera, points: [] as Point[] });
  const dragged = useRef(false);
  const suppressClick = useRef(false);
  const frame = useRef(boardFrame(props.view.board.hexes));
  frame.current = boardFrame(props.view.board.hexes);

  const svg = () => root.current?.querySelector<SVGSVGElement>('.board-svg') ?? null;

  /** Show a camera now without re-rendering the board: the drawing moves, and is redrawn on commit. */
  const preview = (next: Camera) => {
    current.current = next;
    // Only while moving is the board its own layer: kept as one, it paints in blurry tiles first.
    root.current?.classList.add('board-moving');
    if (animationFrame.current) return;
    animationFrame.current = requestAnimationFrame(() => {
      animationFrame.current = 0;
      previewCamera(svg(), drawn.current, current.current, frame.current);
      root.current?.setAttribute('data-zoom', current.current.zoom.toFixed(2));
    });
  };
  /** Draw the shown camera for real: a new viewBox, and the gesture's transform comes off. */
  const commit = () => {
    clearTimeout(settle.current);
    cancelAnimationFrame(animationFrame.current);
    animationFrame.current = 0;
    drawn.current = current.current;
    const element = svg();
    element?.setAttribute('viewBox', cameraViewBox(drawn.current, frame.current));
    previewCamera(element, drawn.current, drawn.current, frame.current);
    root.current?.setAttribute('data-zoom', drawn.current.zoom.toFixed(2));
    root.current?.classList.remove('board-moving');
  };
  const update = (next: Camera) => {
    current.current = next;
    commit();
  };
  const rebase = () => {
    baseline.current = { camera: current.current, points: [...pointers.current.values()] };
  };
  const ignored = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest('button, input, select, .board-notices, .board-corner, .map-confirm');

  // biome-ignore lint/correctness/useExhaustiveDependencies: handlers read refs, so they are bound once.
  useEffect(() => {
    const element = root.current!;
    const wheel = (event: WheelEvent) => {
      if (ignored(event.target)) return;
      event.preventDefault();
      const point = { x: event.clientX, y: event.clientY };
      preview(
        cameraGesture(
          current.current,
          point,
          point,
          Math.exp(-event.deltaY * 0.002),
          element.getBoundingClientRect(),
          frame.current,
        ),
      );
      rebase();
      clearTimeout(settle.current);
      settle.current = setTimeout(commit, WHEEL_SETTLE_MS);
    };
    const move = (event: PointerEvent) => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const points = [...pointers.current.values()];
      const base = baseline.current;
      const from = center(base.points);
      const to = center(points);
      if (!dragged.current && points.length === 1 && Math.hypot(to.x - from.x, to.y - from.y) <= TAP_SLOP) return;
      dragged.current = true;
      suppressClick.current = true;
      if (event.cancelable) event.preventDefault();
      preview(
        cameraGesture(
          base.camera,
          from,
          to,
          distance(points) / distance(base.points),
          element.getBoundingClientRect(),
          frame.current,
        ),
      );
    };
    // Listen on window rather than capturing pointers: touch input is already captured by the
    // element under the finger, and taking that capture away fires lostpointercapture mid-pinch.
    const up = (event: PointerEvent) => {
      if (!pointers.current.delete(event.pointerId)) return;
      rebase();
      if (pointers.current.size) return;
      dragged.current = false;
      commit();
    };
    const cancelAll = () => {
      pointers.current.clear();
      dragged.current = false;
      suppressClick.current = false;
      rebase();
      commit();
    };
    // iOS Safari zooms the whole page on its own gesture events unless they are cancelled.
    // During a game only the board zooms, wherever the pinch starts.
    const stopPageZoom = (event: Event) => event.preventDefault();
    element.addEventListener('wheel', wheel, { passive: false });
    document.addEventListener('gesturestart', stopPageZoom);
    document.addEventListener('gesturechange', stopPageZoom);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', cancelAll);
    return () => {
      cancelAnimationFrame(animationFrame.current);
      clearTimeout(settle.current);
      element.removeEventListener('wheel', wheel);
      document.removeEventListener('gesturestart', stopPageZoom);
      document.removeEventListener('gesturechange', stopPageZoom);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', cancelAll);
    };
  }, []);

  function down(event: ReactPointerEvent) {
    suppressClick.current = false;
    if (ignored(event.target) || (event.pointerType === 'mouse' && event.button !== 0) || pointers.current.size >= 2)
      return;
    if (!pointers.current.size) dragged.current = false;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // A second finger turns any press into a pinch, so the first finger's tap must not fire.
    if (pointers.current.size > 1) suppressClick.current = dragged.current = true;
    rebase();
  }
  // Callbacks are read through a ref so the table's new closures each render don't redraw the board.
  const latest = useRef(props);
  latest.current = props;
  const handlers = useMemo(
    () => ({
      onVertex: (id: string) => latest.current.onVertex(id),
      onEdge: (id: string) => latest.current.onEdge(id),
      onHex: (id: string) => latest.current.onHex(id),
      onConfirm: (kind: Parameters<NonNullable<BoardProps['onConfirm']>>[0]) => latest.current.onConfirm?.(kind),
      onHexConfirm: (confirm: boolean) => latest.current.onHexConfirm?.(confirm),
    }),
    [],
  );
  const { view, mode, disabled, selected, moveFrom, hexPick, tiles } = props;
  // biome-ignore lint/correctness/useExhaustiveDependencies: drawn is a ref read at render; commit() keeps the DOM in step.
  const board = useMemo(
    () => (
      <Board
        view={view}
        mode={mode}
        disabled={disabled}
        selected={selected}
        moveFrom={moveFrom}
        hexPick={hexPick}
        tiles={tiles}
        camera={drawn.current}
        {...handlers}
      />
    ),
    [view, mode, disabled, selected, moveFrom, hexPick, tiles, handlers],
  );
  const zoom = (factor: number) => {
    const rect = root.current!.getBoundingClientRect();
    const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    update(cameraGesture(current.current, point, point, factor, rect, frame.current));
    rebase();
  };
  return (
    <div
      ref={root}
      className="board-viewport"
      data-zoom={drawn.current.zoom.toFixed(2)}
      onPointerDown={down}
      onClickCapture={event => {
        if (suppressClick.current && !ignored(event.target)) {
          event.stopPropagation();
          event.preventDefault();
        }
        suppressClick.current = false;
      }}
    >
      {board}
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
