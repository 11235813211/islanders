import { type ReactNode, useLayoutEffect, useRef } from 'react';

/** How long the robber or pirate takes to fly to its new tile. */
const FLIGHT_MS = 800;

/**
 * A piece standing on a tile (the robber or the pirate). It drops in when it first appears; when
 * it moves, it lifts off, flies in an arc to the new tile, and lands, so everyone sees where it went.
 */
export default function FlyingPiece({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const flier = useRef<SVGGElement>(null);
  const last = useRef({ x, y });
  useLayoutEffect(() => {
    const from = last.current;
    last.current = { x, y };
    const element = flier.current;
    if (!element || (from.x === x && from.y === y) || !element.animate) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const dx = from.x - x;
    const dy = from.y - y;
    const lift = Math.min(110, 40 + Math.hypot(dx, dy) * 0.25);
    element.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(1)` },
        { transform: `translate(${dx}px, ${dy - 18}px) scale(1.15)`, offset: 0.12 },
        { transform: `translate(${dx / 2}px, ${dy / 2 - lift}px) scale(1.3)`, offset: 0.5 },
        { transform: 'translate(0px, -12px) scale(1.1)', offset: 0.88 },
        { transform: 'translate(0px, 0px) scale(1)' },
      ],
      { duration: FLIGHT_MS, easing: 'ease-in-out' },
    );
  }, [x, y]);
  return (
    <g transform={`translate(${x} ${y})`}>
      <g ref={flier} className="flying-piece">
        <g className="piece-drop">{children}</g>
      </g>
    </g>
  );
}
