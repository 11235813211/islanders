// Animations drawn on the board for each eruption: a die tumbling onto the volcano, the corner it
// names, and the building there sinking. The shaking volcano itself is drawn by BoardScene.
import type { CSSProperties } from 'react';
import { ERUPTION_CORNER } from '../../../shared/seafaring';
import type { GameEvent, GameLog, GameView, Vertex } from '../../../shared/types';
import { BuildingPiece, type Frame } from '../../art';
import type { Rumble } from '../BoardScene';

type Eruption = Extract<GameEvent, { kind: 'eruption' }>;
/** Seconds between one volcano's die and the next. */
const ERUPTION_STEP = 1.5;

/** Pip spots on a die face of side 1 (centered at 0). */
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-0.25, -0.25],
    [0.25, 0.25],
  ],
  3: [
    [-0.25, -0.25],
    [0, 0],
    [0.25, 0.25],
  ],
  4: [
    [-0.25, -0.25],
    [0.25, -0.25],
    [-0.25, 0.25],
    [0.25, 0.25],
  ],
  5: [
    [-0.25, -0.25],
    [0.25, -0.25],
    [0, 0],
    [-0.25, 0.25],
    [0.25, 0.25],
  ],
  6: [
    [-0.25, -0.27],
    [0.25, -0.27],
    [-0.25, 0],
    [0.25, 0],
    [-0.25, 0.27],
    [0.25, 0.27],
  ],
};

/** One die face, `size` across, centered at the origin. */
export function DieFace({ value, size, className }: { value: number; size: number; className: string }) {
  return (
    <g className={className}>
      <rect x={-size / 2} y={-size / 2} width={size} height={size} rx={size * 0.22} />
      {PIPS[value]?.map(([x, y], i) => (
        <circle key={i} cx={x * size} cy={y * size} r={size * 0.085} />
      ))}
    </g>
  );
}

/** A start point off the board, in a direction that varies by event. */
function offBoard(seed: number, frame: Frame): { x: number; y: number } {
  const angle = ((seed * 137.5) % 360) * (Math.PI / 180);
  const reach = Math.max(frame.width, frame.height) * 0.75;
  return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach };
}

/** One eruption, played `index` steps after the first: die, corner, warning, and the building sinking. */
function EruptionStep({
  entry,
  event,
  index,
  view,
  vertices,
  frame,
  uid,
  color,
}: {
  entry: GameLog;
  event: Eruption;
  index: number;
  view: GameView;
  vertices: Map<string, Vertex>;
  frame: Frame;
  uid: string;
  color: (playerId: string) => string;
}) {
  const hex = view.board.hexes.find(h => h.id === event.hexId);
  const corner = hex && vertices.get(hex.vertexIds[ERUPTION_CORNER[event.die - 1]!]!);
  if (!hex || !corner) return null;
  const from = offBoard(entry.id * 7 + index, frame);
  const delay = index * ERUPTION_STEP;
  const time = (offset: number) => ({ animationDelay: `${delay + offset}s` }) as CSSProperties;
  return (
    <g aria-hidden="true">
      <g transform={`translate(${hex.x} ${hex.y})`}>
        <g
          className="eruption-die"
          style={{ '--sx': `${from.x}px`, '--sy': `${from.y}px`, ...time(0) } as CSSProperties}
        >
          <DieFace value={event.die} size={34} className="eruption-die-face" />
        </g>
      </g>
      <circle className="eruption-corner" cx={corner.x} cy={corner.y} r="16" style={time(0.9)} />
      {event.piece && event.playerId && (
        <>
          <clipPath id={`${uid}-sink-${entry.id}`}>
            <rect x={corner.x - 40} y={corner.y - 80} width="80" height="86" />
          </clipPath>
          <g clipPath={`url(#${uid}-sink-${entry.id})`}>
            <g transform={`translate(${corner.x} ${corner.y - 3})`}>
              <g className="eruption-sink" style={time(1.5)}>
                <BuildingPiece
                  color={color(event.playerId)}
                  city={event.piece === 'city'}
                  style={view.settings.pieceStyle}
                />
              </g>
            </g>
          </g>
          <text className="eruption-alert" x={corner.x} y={corner.y - 34} textAnchor="middle" style={time(1.1)}>
            !
          </text>
        </>
      )}
    </g>
  );
}

/** Eruptions from the latest volcano roll, in order. */
export function eruptionsToShow(rolled: GameLog[]): { entry: GameLog; event: Eruption }[] {
  return rolled.flatMap(entry => (entry.event?.kind === 'eruption' ? [{ entry, event: entry.event }] : []));
}

/** When a city that an eruption reduced should rise again as a settlement (seconds), by corner. */
export function risingSettlements(rolled: GameLog[]): Map<string, number> {
  const rising = new Map<string, number>();
  eruptionsToShow(rolled).forEach(({ event }, index) => {
    if (event.damage === 'city') rising.set(event.vertexId, index * ERUPTION_STEP + 2.4);
  });
  return rising;
}

/**
 * Volcanoes to shake: every volcano waiting to erupt, and each one whose eruption just wrecked a
 * building (a short quake as its die lands).
 */
export function volcanoRumbles(view: GameView, rolled: GameLog[]): Rumble[] {
  const waiting = (view.eruption ?? []).map(hexId => ({ hexId }));
  const quakes = eruptionsToShow(rolled).flatMap(({ event }, index) =>
    event.damage === 'none' ? [] : [{ hexId: event.hexId, delay: index * ERUPTION_STEP + 0.9 }],
  );
  return [...waiting, ...quakes];
}

/** Everything animated on the board for moves made since this screen opened. */
export default function BoardEffects({
  view,
  rolled,
  vertices,
  frame,
  uid,
  playerColor,
}: {
  view: GameView;
  /** Log entries from the latest roll on. */
  rolled: GameLog[];
  vertices: Map<string, Vertex>;
  frame: Frame;
  uid: string;
  playerColor: (id: string) => string;
}) {
  const eruptions = eruptionsToShow(rolled);
  return (
    <g className="board-effects" pointerEvents="none">
      {eruptions.map(({ entry, event }, index) => (
        <EruptionStep
          key={entry.id}
          entry={entry}
          event={event}
          index={index}
          view={view}
          vertices={vertices}
          frame={frame}
          uid={uid}
          color={playerColor}
        />
      ))}
    </g>
  );
}
