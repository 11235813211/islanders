import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type GameLog, type GameView, RESOURCES } from '../../../shared/types';
import { useFreshLog } from '../../hooks/useFreshLog';
import { bankSpot, DevelopmentBack, FlyingCard, type Point, playerSpot, ResourceFace } from './flights';

interface Flight {
  id: string;
  from: Point;
  to: Point;
  delay: number;
  card: ReactNode;
}

/** Seconds after the spent cards leave before a bought development card flies back. */
const CARD_BACK_DELAY = 0.45;

/** Flights for one build or purchase: each paid card to the bank, and a bought card to its buyer. */
function flightsFor(entry: GameLog, view: GameView): Flight[] {
  const event = entry.event;
  if (event?.kind !== 'build' || !event.paid) return [];
  const player = playerSpot(view, event.playerId);
  const bank = bankSpot();
  const paid = RESOURCES.flatMap(r => Array.from({ length: event.paid![r] }, () => r));
  const flights: Flight[] = paid.map((resource, i) => ({
    id: `${entry.id}-paid-${i}`,
    from: player,
    to: bank,
    delay: i * 0.1,
    card: <ResourceFace resource={resource} />,
  }));
  if (event.piece === 'development')
    flights.push({
      id: `${entry.id}-card`,
      from: bank,
      to: player,
      delay: paid.length * 0.1 + CARD_BACK_DELAY,
      card: <DevelopmentBack />,
    });
  return flights;
}

/**
 * Cards spent on a build or a development card fly from the player (your hand, or their scoreboard
 * row) to the bank, and a bought development card flies from the bank to its buyer, for everyone.
 */
export default function BankFlights({ view }: { view: GameView }) {
  const fresh = useFreshLog(view.log);
  const [flights, setFlights] = useState<Flight[]>([]);
  const played = useRef(new Set<number>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const latest = view.log.at(-1)?.id ?? 0;
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
    timers.current.push(setTimeout(() => setFlights(current => current.filter(f => !ids.has(f.id))), 3000));
  }, [latest]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  if (!flights.length) return null;
  return createPortal(
    <div className="resource-flights bank-flights" aria-hidden="true">
      {flights.map(f => (
        <FlyingCard key={f.id} from={f.from} to={f.to} delay={f.delay}>
          {f.card}
        </FlyingCard>
      ))}
    </div>,
    document.body,
  );
}
