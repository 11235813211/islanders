import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { paysChoice } from '../../../shared/seafaring';
import { type GameLog, type GameView, type Hex, RESOURCES, type Resource } from '../../../shared/types';
import { ResourceIcon } from '../../art';
import { useFreshLog } from '../../hooks/useFreshLog';

interface Flight {
  id: string;
  resource: Resource;
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
}

/** Seconds before cards leave a rolled tile, so the dice land first. */
const AFTER_DICE = 1.1;

/** Screen point of a board point, through the board's current pan and zoom. */
function onScreen(x: number, y: number): { x: number; y: number } | null {
  const svg = document.querySelector<SVGSVGElement>('.board-svg');
  const matrix = svg?.getScreenCTM();
  if (!svg || !matrix) return null;
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  const p = point.matrixTransform(matrix);
  return { x: p.x, y: p.y };
}

/** Where a player's cards go: your hand, or their row in the players panel (top right). */
function destination(view: GameView, playerId: string): { x: number; y: number } {
  const selector = playerId === view.selfId ? '.table-hand' : `[data-player-id="${playerId}"]`;
  const rect = document.querySelector(selector)?.getBoundingClientRect();
  if (rect?.width) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  return { x: window.innerWidth - 40, y: 40 };
}

/** Tiles that paid this player on a roll of `total` (resource tiles of `resource`, or gold and volcanoes). */
function sources(view: GameView, playerId: string, total: number | null, pays: (hex: Hex) => boolean): Hex[] {
  return view.board.hexes.filter(
    hex =>
      hex.number === total &&
      hex.id !== view.robber &&
      pays(hex) &&
      hex.vertexIds.some(v => view.buildings[v]?.playerId === playerId),
  );
}

/** One flight per card gained from a roll or a gold choice in this log entry. */
function flightsFor(entry: GameLog, view: GameView): Flight[] {
  const event = entry.event;
  const flights: Flight[] = [];
  const add = (playerId: string, resource: Resource, count: number, from: Hex[], delay: number) => {
    const to = destination(view, playerId);
    for (let i = 0; i < count; i++) {
      const hex = from[i % Math.max(1, from.length)];
      const start = hex ? onScreen(hex.x, hex.y) : null;
      if (!start) continue;
      flights.push({
        id: `${entry.id}-${playerId}-${resource}-${i}`,
        resource,
        from: start,
        to,
        delay: delay + i * 0.12,
      });
    }
  };
  if (event?.kind === 'roll') {
    const total = event.dice[0] + event.dice[1];
    let n = 0;
    for (const [playerId, bag] of Object.entries(event.gains))
      for (const r of RESOURCES)
        if (bag[r])
          add(
            playerId,
            r,
            bag[r],
            sources(view, playerId, total, h => h.terrain === r),
            AFTER_DICE + n++ * 0.1,
          );
  }
  if (event?.kind === 'gold') {
    const total = view.dice ? view.dice[0] + view.dice[1] : null;
    const from = sources(view, event.playerId, total, h => paysChoice(h.terrain));
    for (const r of RESOURCES) if (event.resources[r]) add(event.playerId, r, event.resources[r], from, 0);
  }
  return flights;
}

/** Cards flying from the tiles that paid them to whoever received them, so everyone sees who got what. */
export default function ResourceFlights({ view }: { view: GameView }) {
  const fresh = useFreshLog(view.log);
  const [flights, setFlights] = useState<Flight[]>([]);
  const played = useRef(new Set<number>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const latest = fresh.at(-1)?.id ?? 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: new log entries are what start flights.
  useLayoutEffect(() => {
    const next: Flight[] = [];
    for (const entry of fresh) {
      if (played.current.has(entry.id)) continue;
      played.current.add(entry.id);
      next.push(...flightsFor(entry, view));
    }
    if (!next.length) return;
    const ids = new Set(next.map(f => f.id));
    setFlights(current => [...current, ...next]);
    timers.current.push(setTimeout(() => setFlights(current => current.filter(f => !ids.has(f.id))), 4000));
  }, [latest]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  if (!flights.length) return null;
  return createPortal(
    <div className="resource-flights" aria-hidden="true">
      {flights.map(f => (
        <span
          key={f.id}
          className="resource-flight"
          style={
            {
              left: f.from.x,
              top: f.from.y,
              '--fx': `${f.to.x - f.from.x}px`,
              '--fy': `${f.to.y - f.from.y}px`,
              animationDelay: `${f.delay}s`,
            } as CSSProperties
          }
        >
          <ResourceIcon resource={f.resource} size={30} />
        </span>
      ))}
    </div>,
    document.body,
  );
}
