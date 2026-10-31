import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BrickWall, Leaf, Mountain, TreePine, Wheat } from 'lucide-react';
import { RESOURCES, type Resource, type ResourceBag } from '../../shared/types';
import './Cards.css';

export const RESOURCE_LABELS: Record<Resource, string> = {
  wood: 'Lumber', brick: 'Brick', sheep: 'Wool', wheat: 'Grain', ore: 'Ore',
};

const ICONS = { wood: TreePine, brick: BrickWall, sheep: Leaf, wheat: Wheat, ore: Mountain };

export function ResourceIcon({ resource, size = 22 }: { resource: Resource; size?: number }) {
  const Icon = ICONS[resource];
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}

export function ResourceArt({ resource }: { resource: Resource }) {
  return <svg className="cards-art" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="49" r="36" fill="currentColor" opacity=".08" />
    {resource === 'wood' && <>
      <path d="M12 72Q40 55 88 72L85 88H15Z" fill="#aebf83" />
      <path d="M30 50v30M53 37v42M75 59v21" stroke="#7d5437" strokeWidth="5" />
      <path d="m30 13 16 29h-7l13 22H9l14-22h-7Z" fill="#315a3c" />
      <path d="m30 13v51H9l14-22h-7Z" fill="#537d48" />
      <path d="m53 5 17 31h-8l15 25H30l15-25h-8Z" fill="#254d3a" />
      <path d="m53 5v56H32l13-20h-8Z" fill="#446d45" />
      <path d="m75 29 14 26h-6l12 21H56l12-21h-6Z" fill="#426c42" />
      <path d="M19 83h11m36 3h15" stroke="#e7d9a7" strokeWidth="2" strokeLinecap="round" />
    </>}
    {resource === 'brick' && <>
      <path d="m8 63 22-13 25 14-23 15Z" fill="#dc9a68" />
      <path d="m8 63 24 16v15L8 78Z" fill="#ad5e40" />
      <path d="m32 79 23-15v15L32 94Z" fill="#864637" />
      <path d="m43 61 23-14 26 14-24 16Z" fill="#e3a274" />
      <path d="m43 61 25 16v15L43 77Z" fill="#b36645" />
      <path d="m68 77 24-16v16L68 92Z" fill="#874a37" />
      <path d="m25 32 26-15 27 15-26 17Z" fill="#e4a16c" />
      <path d="m25 32 27 17v19L25 51Z" fill="#bd6f48" />
      <path d="m52 49 26-17v18L52 68Z" fill="#904c37" />
      <path d="m29 32 23 14 21-13M12 63l20 12 17-10m0-4 19 12 18-11" fill="none" stroke="#ffd49a" strokeWidth="2" opacity=".8" />
    </>}
    {resource === 'sheep' && <>
      <path d="M9 76Q48 57 92 76L87 89H14Z" fill="#99ae61" />
      <path d="M29 60v21m15-20v21m22-21v20" stroke="#4e5142" strokeWidth="6" strokeLinecap="round" />
      <path d="M19 55C7 44 16 31 29 32c-2-15 18-22 28-11 11-8 29 1 26 15 18 5 17 25 2 30-5 17-25 16-31 7-15 10-34 2-35-18" fill="#fff5d5" stroke="#c3ad7e" strokeWidth="2" />
      <path d="M28 34q-4 13 7 15m16-24q-7 13 5 20M22 55q12-7 18 3m11-4q12-8 20 1" fill="none" stroke="#dfcea6" strokeWidth="2" />
      <path d="M72 42q-8-8-8 0m15 1q11-8 13 0" fill="none" stroke="#4b5146" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="77" cy="53" rx="10" ry="15" fill="#4b5146" />
      <circle cx="81" cy="49" r="1.5" fill="#fff9e8" />
    </>}
    {resource === 'wheat' && <>
      <path d="M36 88Q38 55 26 21M51 89V11M64 88q-1-37 15-64" fill="none" stroke="#8a6b2c" strokeWidth="3" />
      {[0, 1, 2].map(stalk => <g key={stalk} transform={stalk === 0 ? 'translate(28 29) rotate(-13)' : stalk === 1 ? 'translate(51 18)' : 'translate(76 31) rotate(15)'} fill="#e5b94f" stroke="#ab802b" strokeWidth="1.5">
        {[0, 1, 2].map(level => <g key={level} transform={`translate(0 ${level * 12})`}><ellipse cx="-5" cy="0" rx="4" ry="8" transform="rotate(-36 -5 0)" /><ellipse cx="5" cy="0" rx="4" ry="8" transform="rotate(36 5 0)" /></g>)}
        <ellipse cy="-12" rx="4" ry="9" />
      </g>)}
      <path d="m29 78 42 2-2 9-38-2Z" fill="#9b683b" /><path d="m33 81 33 2" stroke="#e4b36a" strokeWidth="2" />
    </>}
    {resource === 'ore' && <>
      <path d="m6 82 21-49 17 18 19-41 31 72Z" fill="#5d707a" />
      <path d="m27 33 4 49H6Zm36-23 4 72h27Z" fill="#83949a" />
      <path d="m50 38 13-28 17 30-12-5-5 7-6-9ZM18 54l9-21 12 20-8-4-4 7-5-7Z" fill="#e9e9d7" />
      <path d="m17 72 17-7 13 13-11 17-19-6Zm38 3 18-10 15 14-12 16-20-3Z" fill="#a5b4b6" stroke="#40535b" strokeWidth="2" />
      <path d="m17 72 18 9 12-3m-12 3 1 14m19-20 19 8 14-4m-14 4 2 12" fill="none" stroke="#dee2d7" strokeWidth="2" />
    </>}
  </svg>;
}

interface VisualCard { id: string; resource: Resource; ordinal: number; leaving?: boolean }
const visibleCards = (hand: ResourceBag): VisualCard[] => RESOURCES.flatMap(resource =>
  Array.from({ length: Math.min(hand[resource], 5) }, (_, ordinal) => ({ id: `${resource}-${ordinal}`, resource, ordinal })),
);

export default function ResourceHand({ hand, playerName, compact = false }: { hand: ResourceBag; playerName?: string; compact?: boolean }) {
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

  return <section className={`cards-hand${compact ? ' cards-hand-compact' : ''}`} aria-label={playerName ? `${playerName}'s resource cards` : 'Your resource cards'}>
    <div className="cards-hand-heading"><h2>{playerName ? `${playerName}’s hand` : 'Your hand'}</h2><span aria-live="polite">{total} {total === 1 ? 'card' : 'cards'}</span></div>
    <div className="cards-resource-groups">
      {RESOURCES.map(resource => {
        const group = cards.filter(card => card.resource === resource);
        const size = Math.min(hand[resource], 5);
        return <div className={`cards-resource-group cards-${resource}`} key={resource} aria-label={`${LABELS(resource)}: ${hand[resource]}`}>
          <div className="cards-stack" aria-hidden="true">
            {!group.length && <div className="cards-empty-slot"><ResourceIcon resource={resource} size={28} /><span>0</span></div>}
            {group.map(card => <div className={`cards-physical${card.leaving ? ' cards-spent' : ''}`} key={card.id} style={{ '--card-turn': `${(card.ordinal - Math.max(0, size - 1) / 2) * 4}deg`, '--card-shift': `${(card.ordinal - Math.max(0, size - 1) / 2) * 5}px`, '--card-order': card.ordinal } as CSSProperties}>
              <div className="cards-face"><span className="cards-corner"><ResourceIcon resource={resource} size={15} /></span><ResourceArt resource={resource} /><span className="cards-card-label">{RESOURCE_LABELS[resource]}</span><span className="cards-corner cards-corner-bottom"><ResourceIcon resource={resource} size={15} /></span></div>
            </div>)}
            {hand[resource] > 5 && <span className="cards-overflow">+{hand[resource] - 5}</span>}
          </div>
          <div className="cards-stack-caption"><span>{RESOURCE_LABELS[resource]}</span><strong>{hand[resource]}</strong></div>
        </div>;
      })}
    </div>
  </section>;
}

function LABELS(resource: Resource) { return RESOURCE_LABELS[resource]; }
