// Santa's visit, seen by everyone: the sleigh flies from the North Pole to the chosen building,
// then a card with the resource pops up there with the owner's name, and the sleigh leaves.
import { type CSSProperties, useEffect, useRef } from 'react';
import type { GameEvent, GameLog, GameView, Vertex } from '../../../shared/types';
import { CHRISTMAS, ResourceIcon } from '../../art';
import { RESOURCE_LABELS } from '../ResourceHand';
import './santa-flight.css';

type Santa = Extract<GameEvent, { kind: 'santa' }>;

/** Santa's visits among the latest roll's log entries. */
export function santaVisits(rolled: GameLog[]): { entry: GameLog; event: Santa }[] {
  return rolled.flatMap(entry => (entry.event?.kind === 'santa' ? [{ entry, event: entry.event }] : []));
}

/** One visit: the flight along an arc, the gift card at the building, and the sleigh flying off. */
export function SantaFlight({
  event,
  view,
  vertices,
  color,
}: {
  event: Santa;
  view: GameView;
  vertices: Map<string, Vertex>;
  color: (playerId: string) => string;
}) {
  const motion = useRef<SVGAnimateMotionElement>(null);
  // SMIL starts on the page's clock, so a visit added later starts itself.
  useEffect(() => {
    motion.current?.beginElement?.();
  }, []);
  const target = vertices.get(event.vertexId);
  if (!target) return null;
  const pole = view.board.hexes.find(h => h.id === view.northPole?.hexId) ?? { x: target.x - 260, y: target.y - 220 };
  const { flight, hold, scale } = CHRISTMAS.sleigh;
  const from = { x: pole.x, y: pole.y - 24 };
  const to = { x: target.x, y: target.y - 34 };
  const peak = Math.min(from.y, to.y) - 120;
  const path = `M${from.x} ${from.y}Q${(from.x + to.x) / 2} ${peak} ${to.x} ${to.y}`;
  const leftward = to.x < from.x;
  const full = view.players.find(p => p.id === event.targetId)?.name ?? '';
  // SVG text can't ellipsize, so long names are cut here to fit the card.
  const name = full.length > 14 ? `${full.slice(0, 13)}…` : full;
  const timing = { '--flight': `${flight}s`, '--hold': `${hold}s` } as CSSProperties;
  return (
    <g className="santa-visit" style={timing} aria-hidden="true">
      <g className="santa-sleigh">
        <animateMotion ref={motion} dur={`${flight}s`} begin="indefinite" fill="freeze" path={path} />
        <g transform={`scale(${leftward ? -scale : scale} ${scale})`}>
          <g className="santa-sparkles">
            {[0, 1, 2, 3].map(i => (
              <circle key={i} cx={-44 - i * 9} cy={-6 + (i % 2) * 6} r={2.4 - i * 0.4} />
            ))}
          </g>
          <CHRISTMAS.Sleigh />
        </g>
      </g>
      <g className="santa-gift" transform={`translate(${target.x} ${target.y - 44})`}>
        <rect
          x="-46"
          y="-21"
          width="92"
          height="42"
          rx="10"
          className="santa-gift-card"
          style={{ stroke: color(event.targetId) }}
        />
        <g transform="translate(-40 -17)">
          <ResourceIcon resource={event.resource} size={22} />
        </g>
        <text x="-14" y="-1" className="santa-gift-amount">
          +1 {RESOURCE_LABELS[event.resource]}
        </text>
        <text x="0" y="15" textAnchor="middle" className="santa-gift-name">
          {name}
        </text>
      </g>
    </g>
  );
}
