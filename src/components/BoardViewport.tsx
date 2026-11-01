import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import Board, { type BoardProps } from './Board';
type Camera = { x: number; y: number; zoom: number };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export default function BoardViewport({ children, ...props }: Omit<BoardProps, 'camera'> & { children?: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef({ x: 0, y: 0 });
  const dragged = useRef(false);
  const bound = (c: Camera): Camera => ({ zoom: clamp(c.zoom, .8, 4), x: clamp(c.x, -290, 290), y: clamp(c.y, -260, 260) });
  const zoom = (factor: number) => setCamera(c => bound({ ...c, zoom: c.zoom * factor }));
  useEffect(() => {
    const element = root.current!;
    const wheel = (event: WheelEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('button, input, .board-notices')) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      setCamera(c => {
        const nextZoom = clamp(c.zoom * Math.exp(-event.deltaY * .002), .8, 4);
        const units = Math.max(670 / rect.width, 600 / rect.height);
        const x = event.clientX - rect.left - rect.width / 2, y = event.clientY - rect.top - rect.height / 2;
        return bound({ zoom: nextZoom, x: c.x + x * units * (1/c.zoom - 1/nextZoom), y: c.y + y * units * (1/c.zoom - 1/nextZoom) });
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  function down(e: PointerEvent) {
    if ((e.target as Element).closest('button, input, select, .board-notices') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (!pointers.current.size) { dragged.current = false; start.current = { x: e.clientX, y: e.clientY }; }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  function move(e: PointerEvent) {
    const previous = pointers.current.get(e.pointerId); if (!previous) return;
    const dx = e.clientX - previous.x, dy = e.clientY - previous.y;
    const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)?.[1];
    if (other || Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 6) {
      dragged.current = true; e.currentTarget.setPointerCapture(e.pointerId);
      const rect = root.current!.getBoundingClientRect();
      setCamera(c => {
        const factor = other ? Math.hypot(e.clientX - other.x, e.clientY - other.y) / Math.max(1, Math.hypot(previous.x - other.x, previous.y - other.y)) : 1;
        const units = Math.max(670 / rect.width, 600 / rect.height) / c.zoom;
        return bound({ zoom: c.zoom * factor, x: c.x - dx * units / (other ? 2 : 1), y: c.y - dy * units / (other ? 2 : 1) });
      });
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  return <div ref={root} className="board-viewport" data-zoom={camera.zoom.toFixed(2)} onPointerDown={down} onPointerMove={move} onPointerUp={e => pointers.current.delete(e.pointerId)} onPointerCancel={e => pointers.current.delete(e.pointerId)} onClickCapture={e => { if (dragged.current) { e.stopPropagation(); dragged.current = false; } }}>
    <Board {...props} camera={camera} />
    <div className="board-notices">{children}</div>
    <div className="zoom-controls" aria-label="Board navigation"><button aria-label="Zoom in" onClick={() => zoom(1.25)}><Plus size={18} /></button><button aria-label="Zoom out" onClick={() => zoom(.8)}><Minus size={18} /></button><button aria-label="Reset board view" onClick={() => setCamera({ x: 0, y: 0, zoom: 1 })}><Maximize size={17} /></button></div>
  </div>;
}
