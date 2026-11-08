import { Coins, Route, Sparkles, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { DEVELOPMENT_TYPES, type DevelopmentType, type GameView } from '../../../shared/types';
import { CardGroup, groupTurn, stackCards } from '../ResourceHand';
import { KnightIcon } from './icons';

/** Name and one-line effect of each development card. */
export const DEV_CARDS: Record<DevelopmentType, { name: string; effect: string; icon: (size: number) => ReactNode }> = {
  knight: {
    name: 'Knight',
    effect: 'Move the robber, then take one card from a player next to it.',
    icon: size => <KnightIcon size={size} />,
  },
  'road-building': {
    name: 'Road Building',
    effect: 'Build two roads for free (or ships, on sea maps).',
    icon: size => <Route size={size} />,
  },
  'year-of-plenty': {
    name: 'Year of Plenty',
    effect: 'Take any two resources from the bank.',
    icon: size => <Sparkles size={size} />,
  },
  monopoly: {
    name: 'Monopoly',
    effect: 'Name a resource. Every opponent gives you all of it.',
    icon: size => <Coins size={size} />,
  },
  'victory-point': {
    name: 'Victory Point',
    effect: 'Worth 1 point. Stays hidden until the game ends.',
    icon: size => <Trophy size={size} />,
  },
};

/** Card kinds you hold, in deck order. */
export const heldKinds = (view: GameView) =>
  DEVELOPMENT_TYPES.filter(kind => view.development.some(card => card.kind === kind));

/** True when at least one card of this kind can be played right now. */
export const canPlayKind = (view: GameView, kind: DevelopmentType) =>
  view.development.some(card => card.kind === kind && view.playableDevelopment.includes(card.id));

/** Why no card of this kind can be played now, or null when one can. */
export function blockedReason(view: GameView, kind: DevelopmentType): string | null {
  if (canPlayKind(view, kind)) return null;
  const cards = view.development.filter(card => card.kind === kind);
  if (view.pausedAt !== null) return 'The game is paused.';
  if (view.activePlayerId !== view.selfId || !['roll', 'build'].includes(view.phase))
    return 'You can play this on your turn.';
  if (cards.every(card => card.boughtTurn === view.turn)) return 'You bought this card this turn. Play it next turn.';
  return 'You already played a development card this turn.';
}

/** The card of this kind to play: a playable one if there is one. */
export const cardToPlay = (view: GameView, kind: DevelopmentType) =>
  (
    view.development.find(c => c.kind === kind && view.playableDevelopment.includes(c.id)) ??
    view.development.find(c => c.kind === kind)
  )?.id ?? '';

/** Development cards in the hand row, one stack per kind. Playable stacks glow; a tap opens that card. */
export default function DevelopmentHand({ view, open }: { view: GameView; open: (kind: DevelopmentType) => void }) {
  const kinds = heldKinds(view);
  return (
    <>
      {kinds.map((kind, index) => {
        const count = view.development.filter(card => card.kind === kind).length;
        const ready = canPlayKind(view, kind);
        const { name } = DEV_CARDS[kind];
        return (
          <CardGroup
            key={kind}
            className={`cards-dev${index === 0 ? ' cards-dev-first' : ''}${ready ? ' cards-dev-ready' : ''}`}
            style={groupTurn(index, kinds.length)}
            cards={stackCards(kind, count)}
            count={count}
            label={name}
            corner={DEV_CARDS[kind].icon(12)}
            art={<span className="cards-dev-art">{DEV_CARDS[kind].icon(30)}</span>}
            ariaLabel={`${name} (${count})${ready ? ', ready to play' : ''}`}
            title={`${name}: ${DEV_CARDS[kind].effect}`}
            disabled={false}
            onClick={() => open(kind)}
          />
        );
      })}
    </>
  );
}
