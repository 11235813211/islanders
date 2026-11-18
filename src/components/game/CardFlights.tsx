import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { type GameLog, type GameView, RESOURCES, type Tradable, type TradeBag } from '../../../shared/types';
import { useFreshLog } from '../../hooks/useFreshLog';
import { bankSpot, DevelopmentBack, FlyingCard, type Point, playerSpot, TradableFace } from './flights';

interface Flight {
  id: string;
  from: Point;
  to: Point;
  delay: number;
  card: ReactNode;
}

/** Seconds after the first cards leave before cards come back the other way. */
const RETURN_DELAY = 0.45;
/** Seconds between cards leaving the same hand. */
const CARD_GAP = 0.1;
/** Long enough for the largest trade to land. */
const CLEAR_MS = 4000;

/** Every card in a bag, one entry each. */
function cardsOf(bag: TradeBag): Tradable[] {
  const resources = RESOURCES.flatMap(r => Array.from({ length: bag[r] }, () => r));
  return [...resources, ...Array.from({ length: bag.discovery ?? 0 }, (): Tradable => 'discovery')];
}

/** One flight per card in `bag`, from one place to another. */
function bagFlights(id: string, bag: TradeBag, from: Point, to: Point, start: number): Flight[] {
  return cardsOf(bag).map((item, i) => ({
    id: `${id}-${i}`,
    from,
    to,
    delay: start + i * CARD_GAP,
    card: <TradableFace item={item} />,
  }));
}

/** Both directions of an exchange: what `a` gives goes to `b`, then what `a` gets comes back. */
function exchange(id: string, a: Point, b: Point, give: TradeBag, get: TradeBag): Flight[] {
  return [...bagFlights(`${id}-give`, give, a, b, 0), ...bagFlights(`${id}-get`, get, b, a, RETURN_DELAY)];
}

/** Flights for one log entry: a build or purchase paying the bank, or a finished trade. */
function flightsFor(entry: GameLog, view: GameView): Flight[] {
  const event = entry.event;
  const id = String(entry.id);
  if (event?.kind === 'player-trade')
    return exchange(id, playerSpot(view, event.fromId), playerSpot(view, event.toId), event.give, event.get);
  if (event?.kind === 'bank-trade')
    return exchange(id, playerSpot(view, event.playerId), bankSpot(), event.give, event.get);
  if (event?.kind !== 'build' || !event.paid) return [];
  const player = playerSpot(view, event.playerId);
  const bank = bankSpot();
  const flights = bagFlights(`${id}-paid`, event.paid, player, bank, 0);
  if (event.piece === 'development')
    flights.push({
      id: `${id}-card`,
      from: bank,
      to: player,
      delay: flights.length * CARD_GAP + RETURN_DELAY,
      card: <DevelopmentBack />,
    });
  return flights;
}

/**
 * Cards moving between players and the bank, for everyone to see: payment for a build or
 * development card, a bought card coming back, and both sides of a trade once it goes through.
 */
export default function CardFlights({ view }: { view: GameView }) {
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
    timers.current.push(setTimeout(() => setFlights(current => current.filter(f => !ids.has(f.id))), CLEAR_MS));
  }, [latest]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  if (!flights.length) return null;
  return createPortal(
    <div className="resource-flights card-flights" aria-hidden="true">
      {flights.map(f => (
        <FlyingCard key={f.id} from={f.from} to={f.to} delay={f.delay}>
          {f.card}
        </FlyingCard>
      ))}
    </div>,
    document.body,
  );
}
