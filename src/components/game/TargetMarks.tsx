import type { RailPoint } from '../../../shared/maps/candy-train';
import { ROAD_INSET } from '../../art';

/**
 * One rhythm for every target. SMIL animations run on the SVG's own clock, so a target added
 * later joins in step, and nothing ever pauses them (hover shows a separate still circle).
 */
export const PULSE = {
  dur: '2.2s',
  keyTimes: '0;0.5;1',
  calcMode: 'spline',
  keySplines: '0.42 0 0.58 1;0.42 0 0.58 1',
  repeatCount: 'indefinite',
} as const;
/** Whether the viewer asked for less motion: targets then hold still. */
export const stillMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** An open corner: a breathing circle, swapped for a still one on hover or once picked. */
export function CornerMark() {
  return (
    <>
      <circle className="board-target-mark board-pulse" r="10">
        {!stillMotion() && (
          <>
            <animate attributeName="r" values="6.2;10.8;6.2" {...PULSE} />
            <animate attributeName="opacity" values="0.75;1;0.75" {...PULSE} />
          </>
        )}
      </circle>
      <circle className="board-pulse-hover" r="10.8" />
    </>
  );
}

/** An open edge, drawn as the dashed road highlight, with a wide transparent line to tap. */
export function EdgeMark({
  a,
  b,
  dash = '2 5',
  still,
}: {
  a: RailPoint;
  b: RailPoint;
  dash?: string;
  still?: boolean;
}) {
  const dx = (b.x - a.x) * ROAD_INSET;
  const dy = (b.y - a.y) * ROAD_INSET;
  const ends = { x1: a.x + dx, y1: a.y + dy, x2: b.x - dx, y2: b.y - dy };
  return (
    <>
      <circle cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r="12" fill="transparent" className="board-hit-area" />
      <line className="board-hit-area" {...ends} stroke="transparent" strokeWidth="22" strokeLinecap="round" />
      <line
        className="board-target-mark"
        {...ends}
        stroke="#fff9df"
        strokeWidth="7"
        strokeDasharray={dash}
        strokeLinecap="round"
      >
        {!stillMotion() && !still && <animate attributeName="opacity" values="0.45;1;0.45" {...PULSE} />}
      </line>
    </>
  );
}
