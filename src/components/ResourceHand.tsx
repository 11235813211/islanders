import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { RESOURCES, type Resource, type ResourceBag } from '../../shared/types';
import { CARD_COLORS, ResourceArt, ResourceIcon } from '../art';
import './Cards.css';

export const RESOURCE_LABELS: Record<Resource, string> = {
  wood: 'Lumber',
  brick: 'Brick',
  sheep: 'Wool',
  wheat: 'Grain',
  ore: 'Ore',
  lodestone: 'Lodestone',
};

/** Most cards drawn in one stack; the count badge carries the rest. */
const MAX_STACK = 8;

/** CSS variables read by Cards.css; values come from the active art version. */
export function cardStyle(resource: Resource): CSSProperties {
  const { base, light, dark } = CARD_COLORS[resource];
  return { '--card': base, '--card-light': light, '--card-dark': dark } as CSSProperties;
}

/** Fan angle for the group at `index` of `count`, so the hand reads as held cards. */
export function groupTurn(index: number, count: number): CSSProperties {
  return { '--group-turn': `${(index - (count - 1) / 2) * 2}deg` } as CSSProperties;
}

interface VisualCard {
  id: string;
  ordinal: number;
  leaving?: boolean;
}

/** One stack of identical cards with a count badge. Shared by resource and development cards. */
export function CardGroup({
  className,
  style,
  cards,
  count,
  label,
  corner,
  art,
  title,
  ariaLabel,
  disabled,
  onClick,
}: {
  className: string;
  style: CSSProperties;
  cards: VisualCard[];
  count: number;
  label: string;
  corner: ReactNode;
  art: ReactNode;
  title: string;
  ariaLabel: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const size = Math.min(count, MAX_STACK);
  const spread = (ordinal: number) => ordinal - Math.max(0, size - 1) / 2;
  return (
    <button
      type="button"
      className={`cards-resource-group ${className}`}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={style}
    >
      <div className="cards-stack" aria-hidden="true">
        {cards.map(card => (
          <div
            className={`cards-physical${card.leaving ? ' cards-spent' : ''}`}
            key={card.id}
            style={
              {
                '--card-turn': `${spread(card.ordinal) * 2.5}deg`,
                '--card-shift': `${spread(card.ordinal) * 4}px`,
                '--card-order': card.ordinal,
              } as CSSProperties
            }
          >
            <div className="cards-face">
              <span className="cards-corner">{corner}</span>
              {art}
              <span className="cards-card-label">{label}</span>
            </div>
          </div>
        ))}
      </div>
      <strong className="cards-count">{count}</strong>
      <span className="sr-only">{label}</span>
    </button>
  );
}

/** Cards to draw for a stack of `count`, with stable ids so React keeps their animations. */
export const stackCards = (key: string, count: number): VisualCard[] =>
  Array.from({ length: Math.min(count, MAX_STACK) }, (_, ordinal) => ({ id: `${key}-${ordinal}`, ordinal }));

const visibleCards = (hand: ResourceBag) =>
  RESOURCES.flatMap(resource => stackCards(resource, hand[resource]).map(card => ({ ...card, resource })));

/** Your resource cards, one stack per type you hold. Spent cards fly off before their stack disappears. */
export default function ResourceHand({
  hand,
  playerName,
  compact = false,
  onSelect,
  disabled = false,
  children,
}: {
  hand: ResourceBag;
  playerName?: string;
  compact?: boolean;
  onSelect?: (resource: Resource) => void;
  disabled?: boolean;
  /** More card groups (development cards) laid out in the same row. */
  children?: ReactNode;
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

  const shown = RESOURCES.filter(resource => cards.some(card => card.resource === resource));
  return (
    <section
      className={`cards-hand${compact ? ' cards-hand-compact' : ''}`}
      aria-label={playerName ? `${playerName}'s resource cards` : 'Your resource cards'}
    >
      <span className="sr-only" aria-live="polite">
        {total} resource cards
      </span>
      <div className="cards-resource-groups">
        {shown.map((resource, index) => (
          <CardGroup
            key={resource}
            className={`cards-${resource}`}
            style={{ ...cardStyle(resource), ...groupTurn(index, shown.length) }}
            cards={cards.filter(card => card.resource === resource)}
            count={hand[resource]}
            label={RESOURCE_LABELS[resource]}
            corner={<ResourceIcon resource={resource} size={13} />}
            art={<ResourceArt resource={resource} />}
            ariaLabel={`Trade ${RESOURCE_LABELS[resource]} (${hand[resource]})`}
            title={`${RESOURCE_LABELS[resource]}: ${hand[resource]}. Click to trade.`}
            disabled={disabled || !onSelect || !hand[resource]}
            onClick={() => onSelect?.(resource)}
          />
        ))}
        {children}
        {!shown.length && !children && <p className="cards-none">No cards</p>}
      </div>
    </section>
  );
}
