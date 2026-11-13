import type { CSSProperties } from 'react';
import { DISCOVERY_RULES } from '../../../shared/settings';
import {
  CLASSIC_RESOURCES,
  type GameView,
  RESOURCES,
  type Resource,
  type Tradable,
  type TradeBag,
} from '../../../shared/types';
import { ResourceIcon, SEA } from '../../art';
import { cardStyle, RESOURCE_LABELS } from '../ResourceHand';

/**
 * Resources plus jungle discoveries, for the panels that pick cards (trade, discard, Year of
 * Plenty, Monopoly). Discoveries only appear where the room's discovery rule lets them move.
 */

export const tradableLabel = (item: Tradable) => (item === 'discovery' ? 'Discovery' : RESOURCE_LABELS[item]);

/** Card colors: the resource's, or a jungle green for discoveries. */
export const tradableStyle = (item: Tradable): CSSProperties =>
  item === 'discovery'
    ? ({ '--card': '#5f9a6a', '--card-light': '#d9ecd7', '--card-dark': '#245c33' } as CSSProperties)
    : cardStyle(item);

export function TradableIcon({ item, size }: { item: Tradable; size: number }) {
  return item === 'discovery' ? <SEA.DiscoveryIcon size={size} /> : <ResourceIcon resource={item} size={size} />;
}

export const bagHas = (bag: TradeBag, item: Tradable) => (item === 'discovery' ? (bag.discovery ?? 0) : bag[item]);
export const bagTotal = (bag: TradeBag) => RESOURCES.reduce((n, r) => n + bag[r], 0) + (bag.discovery ?? 0);
export const withItem = (bag: TradeBag, item: Tradable, change: number): TradeBag => ({
  ...bag,
  [item]: Math.max(0, bagHas(bag, item) + change),
});

/** What the room lets discoveries do here: trade with players, count toward discards, or be taken by cards. */
export type DiscoveryUse = 'trade' | 'discard' | 'take';

/** The resources in play: lodestone only on Cartographers maps. */
export const resourcesIn = (view: Pick<GameView, 'cartographers'>): Resource[] => [
  ...(view.cartographers ? RESOURCES : CLASSIC_RESOURCES),
];

/** The items a panel offers: the resources in play, plus discoveries when this map and room allow it. */
export function tradablesFor(view: GameView, use: DiscoveryUse): Tradable[] {
  const rule = DISCOVERY_RULES[view.settings.discoveries ?? 'kept'];
  const allowed = use === 'trade' ? rule.tradable : use === 'discard' ? rule.inHand : rule.stealable;
  return view.jungle && allowed ? [...resourcesIn(view), 'discovery'] : resourcesIn(view);
}

/** How many of `item` you hold. */
export function held(view: GameView, item: Tradable): number {
  return item === 'discovery' ? (view.players.find(p => p.id === view.selfId)?.discoveries ?? 0) : view.hand[item];
}
