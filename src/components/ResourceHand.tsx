import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { RESOURCES, type Resource, type ResourceBag } from '../../shared/types';
import { CARD_COLORS, ResourceArt, ResourceIcon } from '../art';
import './Cards.css';

export const RESOURCE_LABELS: Record<Resource, string> = {
  wood: 'Lumber',
  brick: 'Brick',
  sheep: 'Wool',
  wheat: 'Grain',
  ore: 'Ore',
};

/** CSS variables read by Cards.css; values come from the active art version. */
export function cardStyle(resource: Resource): CSSProperties {
  const { base, light, dark } = CARD_COLORS[resource];
  return { '--card': base, '--card-light': light, '--card-dark': dark } as CSSProperties;
}

interface VisualCard {
  id: string;
  resource: Resource;
  ordinal: number;
  leaving?: boolean;
}
const visibleCards = (hand: ResourceBag): VisualCard[] =>
  RESOURCES.flatMap(resource =>
    Array.from({ length: Math.min(hand[resource], 8) }, (_, ordinal) => ({
      id: `${resource}-${ordinal}`,
      resource,
      ordinal,
    })),
  );

export default function ResourceHand({
  hand,
  playerName,
  compact = false,
  onSelect,
  disabled = false,
}: {
  hand: ResourceBag;
  playerName?: string;
  compact?: boolean;
  onSelect?: (resource: Resource) => void;
  disabled?: boolean;
}) {
  const [cards, setCards] = useState(() => visibleCards(hand));
  const current = useRef(cards);
  const signature = RESOURCES.map(resource => hand[resource]).join(':');
  const total = RESOURCES.reduce((sum, resource) => sum + hand[resource], 0);

  useEffect(() => {
    const desired = visibleCards(hand);
    const ids = new Set(desired.map(card => card.id));
    const leaving = current.current.filter(card => !ids.has(card.id)).map(card => ({ ...card, leaving: true }));
    current.current = desired;
    setCards([...desired, ...leaving]);
    const timer = setTimeout(() => setCards(desired), 420);
    return () => clearTimeout(timer);
    // A resource-count signature avoids resetting animations for unrelated state updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return (
    <section
      className={`cards-hand${compact ? ' cards-hand-compact' : ''}`}
      aria-label={playerName ? `${playerName}'s resource cards` : 'Your resource cards'}
    >
      <span className="sr-only" aria-live="polite">
        {total} resource cards
      </span>
      <div className="cards-resource-groups">
        {RESOURCES.map((resource, groupIndex) => {
          const group = cards.filter(card => card.resource === resource);
          const size = Math.min(hand[resource], 8);
          return (
            <button
              type="button"
              className={`cards-resource-group cards-${resource}`}
              key={resource}
              aria-label={`Trade ${RESOURCE_LABELS[resource]} (${hand[resource]})`}
              title={`${RESOURCE_LABELS[resource]}: ${hand[resource]}. Click to trade.`}
              disabled={disabled || !onSelect}
              onClick={() => onSelect?.(resource)}
              style={{ ...cardStyle(resource), '--group-turn': `${(groupIndex - 2) * 2}deg` } as CSSProperties}
            >
              <div className="cards-stack" aria-hidden="true">
                {!group.length && (
                  <div className="cards-empty-slot">
                    <ResourceIcon resource={resource} size={25} />
                  </div>
                )}
                {group.map(card => (
                  <div
                    className={`cards-physical${card.leaving ? ' cards-spent' : ''}`}
                    key={card.id}
                    style={
                      {
                        '--card-turn': `${(card.ordinal - Math.max(0, size - 1) / 2) * 2.5}deg`,
                        '--card-shift': `${(card.ordinal - Math.max(0, size - 1) / 2) * 4}px`,
                        '--card-order': card.ordinal,
                      } as CSSProperties
                    }
                  >
                    <div className="cards-face">
                      <span className="cards-corner">
                        <ResourceIcon resource={resource} size={13} />
                      </span>
                      <ResourceArt resource={resource} />
                      <span className="cards-card-label">{RESOURCE_LABELS[resource]}</span>
                    </div>
                  </div>
                ))}
              </div>
              <strong className="cards-count">{hand[resource]}</strong>
              <span className="sr-only">{RESOURCE_LABELS[resource]}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
