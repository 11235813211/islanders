// Shared pieces for cards flying across the table: where players and the bank are on screen,
// and the flying card itself (see ResourceFlights for payouts and CardFlights for spending and trades).
import type { CSSProperties, ReactNode } from 'react';
import type { GameView, Resource, Tradable } from '../../../shared/types';
import { ResourceArt, ResourceIcon, SEA } from '../../art';
import { cardStyle, RESOURCE_LABELS } from '../ResourceHand';
import { tradableStyle } from './tradables';

export interface Point {
  x: number;
  y: number;
}

const center = (rect: DOMRect): Point => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
/** The first element on screen for a selector (hidden copies have no size). */
const shown = (selector: string) =>
  [...document.querySelectorAll(selector)].map(e => e.getBoundingClientRect()).find(r => r.width);

/** Where a player's cards come from or go: your hand, or their row in the scoreboard (or its folded chip). */
export function playerSpot(view: GameView, playerId: string): Point {
  const rect = shown(playerId === view.selfId ? '.table-hand' : `[data-player-id="${playerId}"]`);
  return rect ? center(rect) : { x: window.innerWidth - 40, y: 40 };
}

/** Screen point of a board point, through the board's current pan and zoom. */
export function onScreen(x: number, y: number): { x: number; y: number } | null {
  const svg = document.querySelector<SVGSVGElement>('.board-svg');
  const matrix = svg?.getScreenCTM();
  if (!svg || !matrix) return null;
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;
  const p = point.matrixTransform(matrix);
  return { x: p.x, y: p.y };
}

/** Where a built piece stands on screen (a corner, or an edge's middle), or null when it isn't on the board. */
export function pieceSpot(view: GameView, at: string): Point | null {
  const vertex = view.board.vertices.find(v => v.id === at);
  if (vertex) return onScreen(vertex.x, vertex.y);
  const edge = view.board.edges.find(e => e.id === at);
  const a = edge && view.board.vertices.find(v => v.id === edge.a);
  const b = edge && view.board.vertices.find(v => v.id === edge.b);
  return a && b ? onScreen((a.x + b.x) / 2, (a.y + b.y) / 2) : null;
}

/** The bank: its counts under the scoreboard when the room shows them, else the top of the board. */
export function bankSpot(): Point {
  const counts = shown('.bank-counts');
  if (counts) return center(counts);
  const board = shown('.board-viewport');
  return board ? { x: board.left + board.width / 2, y: board.top + 40 } : { x: window.innerWidth / 2, y: 40 };
}

/** One card flying from `from` to `to`, starting after `delay` seconds (resource-flight animation). */
export function FlyingCard({
  from,
  to,
  delay,
  children,
}: {
  from: Point;
  to: Point;
  delay: number;
  children: ReactNode;
}) {
  return (
    <span
      className="resource-flight"
      style={
        {
          left: from.x,
          top: from.y,
          '--fx': `${to.x - from.x}px`,
          '--fy': `${to.y - from.y}px`,
          animationDelay: `${delay}s`,
        } as CSSProperties
      }
    >
      {children}
    </span>
  );
}

/** A resource card's face, as in the hand. */
export function ResourceFace({ resource }: { resource: Resource }) {
  return (
    <span className="flight-card" style={cardStyle(resource)}>
      <span className="cards-face">
        <span className="cards-corner">
          <ResourceIcon resource={resource} size={12} />
        </span>
        <ResourceArt resource={resource} />
        <span className="cards-card-label">{RESOURCE_LABELS[resource]}</span>
      </span>
    </span>
  );
}

/** What a traded card looks like in flight: a resource's face, or a jungle discovery. */
export function TradableFace({ item }: { item: Tradable }) {
  if (item !== 'discovery') return <ResourceFace resource={item} />;
  return (
    <span className="flight-card flight-discovery" style={tradableStyle(item)}>
      <SEA.DiscoveryIcon size={30} />
    </span>
  );
}

/** A development card's back (what everyone sees of a card being bought). */
export function DevelopmentBack() {
  return <span className="flight-card flight-development" />;
}
