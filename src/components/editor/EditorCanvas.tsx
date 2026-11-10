import { Maximize, Minus, Plus } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { HEX_RADIUS, hexCenter } from '../../../shared/board';
import { type BoardDesign, type DesignKind, tileKey } from '../../../shared/maps';
import { cellAt, paint, sideAt, stepNumber, toggleHarbor, toggleNoStart, updateTile } from '../../../shared/maps/edit';
import { ArtDefs, SEA } from '../../art';
import { hexPoints } from '../../lib/geometry';
import EditorLayer from './EditorLayer';
import { applyLink, linkChoice } from './LinkPicker';

/** Toolbar tools, plus the painting tools held keys switch to (sea, land, brush, erase). */
export type Tool = 'select' | 'link' | 'nostart' | 'sea' | 'land' | 'brush' | 'erase' | 'harbor' | 'robber' | 'pirate';
export type EditorSelection =
  | { kind: 'tile'; q: number; r: number }
  | { kind: 'harbor'; q: number; r: number; side: number }
  | null;
type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;

/**
 * The tool a press uses: held keys override the toolbar (Space paints sea, Alt erases, Shift paints
 * land, Ctrl/⌘ paints the brush).
 */
function pressTool(
  event: { altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  tool: Tool,
  space: boolean,
): Tool {
  if (space) return 'sea';
  if (event.altKey) return 'erase';
  if (event.shiftKey) return 'land';
  if (event.ctrlKey || event.metaKey) return 'brush';
  return tool;
}

interface View {
  cx: number;
  cy: number;
  /** Screen pixels per board unit. */
  scale: number;
}

/** A view that fits every tile, with a ring of space around it to draw into. */
function fitView(design: BoardDesign, width: number, height: number): View {
  const points = design.tiles.map(t => hexCenter(t.q, t.r));
  const pad = HEX_RADIUS * 4;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
  const scale = Math.min(width / (x1 - x0), height / (y1 - y0), 1.1);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale };
}

/** Pixels a press may wander before it counts as a drag rather than a click. */
const CLICK_SLOP = 5;
const PAINTING: Tool[] = ['sea', 'land', 'brush', 'erase', 'link'];

/**
 * The editing surface, with the game board's controls: scroll or pinch zooms, dragging moves the
 * view, and a click selects a tile. Space-drag paints sea (over anything), Shift-drag land,
 * Ctrl/⌘-drag the brush terrain, Alt-drag deletes. Numbers: click to raise, Shift-click or
 * right-click to lower.
 */
export default function EditorCanvas({
  design,
  selection,
  select,
  tool,
  brush,
  linkLetter,
  edit,
  fitKey,
}: {
  design: BoardDesign;
  selection: EditorSelection;
  select: (selection: EditorSelection) => void;
  tool: Tool;
  brush: DesignKind;
  /** What the Link tool gives tiles and harbors (null unlinks). */
  linkLetter: string | null;
  edit: Edit;
  /** Refit the view when this changes (a different board was opened). */
  fitKey: string;
}) {
  const uid = useId().replace(/:/g, '');
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [view, setView] = useState<View>({ cx: 0, cy: 0, scale: 1 });
  const [hover, setHover] = useState<{ q: number; r: number; tool: Tool } | null>(null);
  const space = useRef(false);
  const press = useRef<{
    tool: Tool;
    group: string;
    start: { x: number; y: number };
    last: { x: number; y: number };
    moved: boolean;
    pan: boolean;
    screen: { x: number; y: number };
  } | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const designRef = useRef(design);
  designRef.current = design;

  useLayoutEffect(() => {
    const element = root.current!;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refit only when another board opens or the canvas first gets its size.
  useEffect(() => {
    setView(fitView(designRef.current, root.current!.clientWidth, root.current!.clientHeight));
  }, [fitKey]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (event.code !== 'Space' || typing) return;
      // Space is a paint key here, so it must not scroll the page or press a focused button.
      event.preventDefault();
      space.current = event.type === 'keydown';
    };
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', key);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', key);
    };
  }, []);

  const toBoard = (clientX: number, clientY: number) => {
    const rect = root.current!.getBoundingClientRect();
    return {
      x: view.cx + (clientX - rect.left - rect.width / 2) / view.scale,
      y: view.cy + (clientY - rect.top - rect.height / 2) / view.scale,
    };
  };
  const zoomAt = (clientX: number, clientY: number, factor: number) =>
    setView(v => {
      const rect = root.current!.getBoundingClientRect();
      const scale = Math.min(6, Math.max(0.15, v.scale * factor));
      const px = clientX - rect.left - rect.width / 2;
      const py = clientY - rect.top - rect.height / 2;
      const bx = v.cx + px / v.scale;
      const by = v.cy + py / v.scale;
      return { scale, cx: bx - px / scale, cy: by - py / scale };
    });

  /** Zoom around the middle of the canvas (the zoom buttons). */
  const zoomCenter = (factor: number) => {
    const rect = root.current!.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: zoomAt reads the latest view through setView.
  useEffect(() => {
    const element = root.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      // As on the game board: scrolling zooms. Trackpad pinches arrive as small Ctrl-scrolls.
      zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002)));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  /** Apply a brush stroke from the last point to `to`, sampling so fast drags leave no gaps. */
  function strokeTo(to: { x: number; y: number }) {
    const current = press.current!;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - current.last.x, to.y - current.last.y) / 18));
    const cells = Array.from({ length: steps + 1 }, (_, i) =>
      cellAt(
        current.last.x + ((to.x - current.last.x) * i) / steps,
        current.last.y + ((to.y - current.last.y) * i) / steps,
      ),
    );
    current.last = to;
    if (current.tool === 'link') return edit(d => applyLink(d, cells, [], linkLetter), current.group);
    const mode =
      current.tool === 'sea' ? 'sea' : current.tool === 'land' ? 'land' : current.tool === 'brush' ? brush : 'erase';
    edit(d => paint(d, cells, mode), current.group);
  }

  function click(point: { x: number; y: number }, active: Tool) {
    const { q, r } = cellAt(point.x, point.y);
    const tile = design.tiles.find(t => t.q === q && t.r === r);
    if (active === 'select') select(tile ? { kind: 'tile', q, r } : null);
    // Clicking a tile that already has this link takes it off again.
    if (active === 'link' && tile)
      edit(d => applyLink(d, [{ q, r }], [], linkChoice(tile) === linkLetter ? null : linkLetter));
    if (active === 'nostart') edit(d => toggleNoStart(d, point.x, point.y));
    if (active === 'harbor') {
      edit(d => toggleHarbor(d, q, r, sideAt(q, r, point.x, point.y)));
      select(null);
    }
    if (active === 'robber' && tile && tile.kind !== 'sea' && tile.kind !== 'iceberg')
      edit(d => ({ ...d, robber: d.robber?.q === q && d.robber.r === r ? null : { q, r } }));
    if (active === 'pirate' && tile?.kind === 'sea')
      edit(d => ({ ...d, pirate: d.pirate?.q === q && d.pirate.r === r ? null : { q, r } }));
  }

  function down(event: ReactPointerEvent) {
    if ((event.target as Element).closest('button, .editor-token, .editor-harbor')) return;
    if (event.pointerType === 'touch') {
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.current.size > 1) {
        press.current = null;
        return;
      }
    }
    root.current!.setPointerCapture?.(event.pointerId);
    const point = toBoard(event.clientX, event.clientY);
    const active = pressTool(event, tool, space.current);
    const pan = event.button === 1 || event.button === 2 || active === 'select';
    press.current = {
      tool: active,
      group: `stroke-${Date.now()}-${Math.random()}`,
      start: point,
      last: point,
      moved: false,
      pan,
      screen: { x: event.clientX, y: event.clientY },
    };
    // A link click toggles (see click), so only drags paint links.
    if (!pan && PAINTING.includes(active) && active !== 'link') strokeTo(point);
  }

  function move(event: ReactPointerEvent) {
    const point = toBoard(event.clientX, event.clientY);
    const cell = cellAt(point.x, point.y);
    const active = pressTool(event, tool, space.current);
    if (hover?.q !== cell.q || hover?.r !== cell.r || hover?.tool !== active) setHover({ ...cell, tool: active });
    if (event.pointerType === 'touch' && touches.current.has(event.pointerId)) {
      const previous = touches.current.get(event.pointerId)!;
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.current.size > 1) {
        const [a, b] = [...touches.current.values()];
        const others = [...touches.current.entries()].find(([id]) => id !== event.pointerId)![1];
        const before = Math.hypot(previous.x - others.x, previous.y - others.y);
        const after = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        setView(v => ({
          ...v,
          cx: v.cx - (event.clientX - previous.x) / 2 / v.scale,
          cy: v.cy - (event.clientY - previous.y) / 2 / v.scale,
        }));
        if (before > 0) zoomAt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, after / before);
        return;
      }
    }
    const current = press.current;
    if (!current) return;
    if (current.pan) {
      const dx = event.clientX - current.screen.x;
      const dy = event.clientY - current.screen.y;
      if (!current.moved && Math.hypot(dx, dy) <= CLICK_SLOP) return;
      current.moved = true;
      current.screen = { x: event.clientX, y: event.clientY };
      setView(v => ({ ...v, cx: v.cx - dx / v.scale, cy: v.cy - dy / v.scale }));
      return;
    }
    const start = cellAt(current.start.x, current.start.y);
    if (!current.moved && cell.q === start.q && cell.r === start.r) return;
    current.moved = true;
    if (PAINTING.includes(current.tool)) strokeTo(point);
  }

  function up(event: ReactPointerEvent) {
    touches.current.delete(event.pointerId);
    const current = press.current;
    press.current = null;
    if (!current || current.moved || event.button === 1 || event.button === 2) return;
    click(current.start, current.tool);
  }

  const w = size.width / view.scale;
  const h = size.height / view.scale;
  const occupied = new Set(design.tiles.map(t => tileKey(t.q, t.r)));
  const hoverOpen = hover && !occupied.has(tileKey(hover.q, hover.r));
  return (
    <div
      ref={root}
      className={`editor-canvas tool-${tool}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={() => setHover(null)}
      onContextMenu={event => event.preventDefault()}
    >
      <svg viewBox={`${view.cx - w / 2} ${view.cy - h / 2} ${w} ${h}`} role="img" aria-label="Board being edited">
        <defs>
          <ArtDefs uid={uid} />
          <SEA.Defs uid={uid} />
        </defs>
        <EditorLayer
          uid={uid}
          design={design}
          selection={selection}
          select={select}
          pickHarbor={
            tool === 'link'
              ? harbor => edit(d => applyLink(d, [], [harbor], linkChoice(harbor) === linkLetter ? null : linkLetter))
              : undefined
          }
          stepNumber={(q, r, delta) =>
            edit(d =>
              updateTile(d, q, r, { number: stepNumber(d.tiles.find(t => t.q === q && t.r === r)?.number, delta) }),
            )
          }
        />
        {hover && (
          <polygon
            className={`editor-hover hover-${hover.tool}${hoverOpen ? ' open' : ''}`}
            points={hexPoints(57)}
            transform={`translate(${hexCenter(hover.q, hover.r).x} ${hexCenter(hover.q, hover.r).y})`}
          />
        )}
      </svg>
      <div className="zoom-controls" aria-label="Editor view">
        <button type="button" aria-label="Zoom in" onClick={() => zoomCenter(1.25)}>
          <Plus size={18} />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomCenter(0.8)}>
          <Minus size={18} />
        </button>
        <button type="button" aria-label="Fit board" onClick={() => setView(fitView(design, size.width, size.height))}>
          <Maximize size={17} />
        </button>
      </div>
    </div>
  );
}
