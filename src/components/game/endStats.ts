import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Ban,
  Building2,
  Coins,
  Compass,
  Crown,
  Dices,
  Flag,
  Flame,
  Gift,
  Hammer,
  Hand,
  House,
  Landmark,
  Layers,
  type LucideIcon,
  Move,
  RadioTower,
  Route,
  Sailboat,
  Star,
  Swords,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import { CLASSIC_RESOURCES, type GameView, type PublicPlayer, RESOURCES, type Resource } from '../../../shared/types';

/** One column of an end-of-game stats table: a number per player. */
export interface StatColumn {
  label: string;
  title: string;
  value: (player: PublicPlayer, view: GameView) => number;
  /** Hidden when every player has zero (sea-map and variant stats). */
  optional?: boolean;
  /** Shown bold, for totals. */
  total?: boolean;
  /** A resource's column: its icon heads it and its color tints it. */
  resource?: Resource;
  /** A small icon beside the label. */
  icon?: LucideIcon;
}

/** A tab of the end-of-game stats. */
export interface StatCategory {
  id: string;
  label: string;
  columns: StatColumn[];
}

const sum = (counts: Partial<Record<string | number, number>>): number =>
  Object.values(counts).reduce<number>((n, count) => n + (count ?? 0), 0);

const cardsIn = (p: PublicPlayer) => sum(p.stats.cardsIn);
const cardsOut = (p: PublicPlayer) => sum(p.stats.cardsOut);
const sevens = (p: PublicPlayer) => p.stats.rolls[7] ?? 0;

/** Settlements or cities standing on the board at the end. */
function standing(view: GameView, playerId: string, kind: 'settlement' | 'city'): number {
  return Object.values(view.buildings).filter(b => b.playerId === playerId && b.kind === kind).length;
}

/** Average of a player's own dice totals (0 when they never rolled). */
function averageRoll(p: PublicPlayer): number {
  const rolls = sum(p.stats.rolls);
  const total = Object.entries(p.stats.rolls).reduce((n, [face, count]) => n + Number(face) * (count ?? 0), 0);
  return rolls ? Math.round((total / rolls) * 10) / 10 : 0;
}

const capitalized = (word: string) => word[0]!.toUpperCase() + word.slice(1);

const DICE_COLUMNS: StatColumn[] = Array.from({ length: 11 }, (_, i) => i + 2).map(face => ({
  label: String(face),
  title: `Times this player rolled ${face}`,
  value: p => p.stats.rolls[face] ?? 0,
}));

export const STAT_CATEGORIES: StatCategory[] = [
  {
    id: 'summary',
    label: 'Summary',
    columns: [
      { icon: Trophy, label: 'VP', title: 'Victory points', value: p => p.points, total: true },
      { icon: ArrowDown, label: 'Gained', title: 'Cards gained in any way', value: cardsIn },
      { icon: ArrowUp, label: 'Lost', title: 'Cards spent or lost in any way', value: cardsOut },
      { icon: Dices, label: '7s', title: 'Sevens this player rolled', value: sevens },
      { icon: Hand, label: 'Stolen', title: 'Cards taken with the robber', value: p => p.stats.cardsIn.steal ?? 0 },
      { icon: ArrowLeftRight, label: 'Trades', title: 'Trades with other players', value: p => p.stats.trades },
    ],
  },
  {
    id: 'points',
    label: 'Points',
    columns: [
      {
        icon: House,
        label: 'Settlements',
        title: 'Settlements on the board (1 each)',
        value: (p, v) => standing(v, p.id, 'settlement'),
      },
      {
        icon: Building2,
        label: 'Cities',
        title: 'Points from cities (2 each)',
        value: (p, v) => 2 * standing(v, p.id, 'city'),
      },
      { icon: Route, label: 'Road', title: 'Longest road (2)', value: (p, v) => (v.longestRoadId === p.id ? 2 : 0) },
      { icon: Swords, label: 'Army', title: 'Largest army (2)', value: (p, v) => (v.largestArmyId === p.id ? 2 : 0) },
      { icon: Star, label: 'VP cards', title: 'Victory point cards', value: p => p.points - p.publicPoints },
      { icon: Sailboat, label: 'Islands', title: 'Island bonus points', value: p => p.bonusPoints, optional: true },
      {
        icon: Compass,
        label: 'Megacities',
        title: 'Extra point for each megacity (1 each, on top of its city)',
        value: p => p.megacities,
        optional: true,
      },
      { label: 'Total', title: 'Victory points', value: p => p.points, total: true },
    ],
  },
  {
    id: 'gained',
    label: 'Cards gained',
    columns: [
      { icon: Dices, label: 'Rolls', title: 'Cards from dice rolls', value: p => p.stats.cardsIn.roll ?? 0 },
      {
        icon: Coins,
        label: 'Gold',
        title: 'Cards chosen from gold fields and volcanoes',
        value: p => p.stats.cardsIn.gold ?? 0,
        optional: true,
      },
      {
        icon: Flag,
        label: 'Setup',
        title: 'Cards from the second setup settlement',
        value: p => p.stats.cardsIn.setup ?? 0,
      },
      {
        icon: Compass,
        label: 'Exploring',
        title: 'Cards for revealing fog',
        value: p => p.stats.cardsIn.explore ?? 0,
        optional: true,
      },
      { icon: Hand, label: 'Robber', title: 'Cards taken with the robber', value: p => p.stats.cardsIn.steal ?? 0 },
      { icon: Crown, label: 'Monopoly', title: 'Cards taken with Monopoly', value: p => p.stats.cardsIn.monopoly ?? 0 },
      { icon: Gift, label: 'Plenty', title: 'Cards from Year of Plenty', value: p => p.stats.cardsIn.plenty ?? 0 },
      {
        icon: Landmark,
        label: 'Bank',
        title: 'Cards received in bank and harbor trades',
        value: p => p.stats.cardsIn.bank ?? 0,
      },
      {
        icon: Users,
        label: 'Players',
        title: 'Cards received in trades with players',
        value: p => p.stats.cardsIn.trade ?? 0,
      },
      { label: 'Total', title: 'All cards gained', value: cardsIn, total: true },
    ],
  },
  {
    id: 'lost',
    label: 'Cards lost',
    columns: [
      {
        icon: Hammer,
        label: 'Building',
        title: 'Cards spent on pieces and development cards',
        value: p => p.stats.cardsOut.build ?? 0,
      },
      { icon: Trash2, label: 'Discards', title: 'Cards discarded on a 7', value: p => p.stats.cardsOut.discard ?? 0 },
      { icon: Hand, label: 'Robber', title: 'Cards stolen by the robber', value: p => p.stats.cardsOut.steal ?? 0 },
      { icon: Crown, label: 'Monopoly', title: 'Cards lost to Monopoly', value: p => p.stats.cardsOut.monopoly ?? 0 },
      {
        icon: Landmark,
        label: 'Bank',
        title: 'Cards given in bank and harbor trades',
        value: p => p.stats.cardsOut.bank ?? 0,
      },
      {
        icon: Users,
        label: 'Players',
        title: 'Cards given in trades with players',
        value: p => p.stats.cardsOut.trade ?? 0,
      },
      { label: 'Total', title: 'All cards spent or lost', value: cardsOut, total: true },
    ],
  },
  {
    id: 'production',
    label: 'Production',
    columns: [
      ...RESOURCES.map(resource => ({
        label: capitalized(resource),
        resource,
        title: `${capitalized(resource)} from rolls and gold`,
        value: (p: PublicPlayer) => p.stats.produced[resource] ?? 0,
        // Lodestone shows only on Cartographers maps, commodities only with Cities & Knights.
        optional: !(CLASSIC_RESOURCES as readonly string[]).includes(resource),
      })),
      { label: 'Total', title: 'Resources from rolls and gold', value: p => sum(p.stats.produced), total: true },
      { icon: Ban, label: 'Blocked', title: 'Cards the robber kept from this player', value: p => p.stats.blocked },
    ],
  },
  {
    id: 'robber',
    label: 'Robber',
    columns: [
      { icon: Dices, label: '7s', title: 'Sevens this player rolled', value: sevens },
      {
        icon: Move,
        label: 'Moves',
        title: 'Times this player moved the robber or pirate',
        value: p => p.stats.robberMoves,
      },
      { icon: Swords, label: 'Knights', title: 'Knights played', value: p => p.knights },
      { icon: Hand, label: 'Stole', title: 'Cards taken with the robber', value: p => p.stats.cardsIn.steal ?? 0 },
      { icon: Hand, label: 'Robbed', title: 'Cards stolen from this player', value: p => p.stats.cardsOut.steal ?? 0 },
      { icon: Trash2, label: 'Discarded', title: 'Cards discarded on a 7', value: p => p.stats.cardsOut.discard ?? 0 },
      { icon: Ban, label: 'Blocked', title: 'Cards the robber kept from this player', value: p => p.stats.blocked },
    ],
  },
  {
    id: 'dice',
    label: 'Dice',
    columns: [
      { label: 'Rolls', title: 'Times this player rolled', value: p => sum(p.stats.rolls), total: true },
      ...DICE_COLUMNS,
      { label: 'Avg', title: 'Average roll', value: averageRoll },
    ],
  },
  {
    id: 'builds',
    label: 'Builds',
    columns: [
      { icon: Route, label: 'Roads', title: 'Roads built, setup included', value: p => p.stats.built.road ?? 0 },
      {
        icon: Sailboat,
        label: 'Ships',
        title: 'Ships built, setup included',
        value: p => p.stats.built.ship ?? 0,
        optional: true,
      },
      {
        icon: House,
        label: 'Settlements',
        title: 'Settlements built, setup included',
        value: p => p.stats.built.settlement ?? 0,
      },
      { icon: Building2, label: 'Cities', title: 'Cities built', value: p => p.stats.built.city ?? 0 },
      {
        icon: RadioTower,
        label: 'Relays',
        title: 'Relay stations built',
        value: p => p.stats.built.relay ?? 0,
        optional: true,
      },
      {
        icon: Layers,
        label: 'Dev cards',
        title: 'Development cards bought',
        value: p => p.stats.built.development ?? 0,
      },
      { icon: Swords, label: 'Knights', title: 'Knights played', value: p => p.stats.played.knight ?? 0 },
      {
        icon: Route,
        label: 'Roads card',
        title: 'Road Building played',
        value: p => p.stats.played['road-building'] ?? 0,
      },
      {
        icon: Gift,
        label: 'Plenty',
        title: 'Year of Plenty played',
        value: p => p.stats.played['year-of-plenty'] ?? 0,
      },
      { icon: Crown, label: 'Monopoly', title: 'Monopoly played', value: p => p.stats.played.monopoly ?? 0 },
      {
        icon: Flame,
        label: 'Erupted',
        title: 'Settlements and cities a volcano damaged',
        value: p => p.stats.erupted,
        optional: true,
      },
    ],
  },
  {
    id: 'trades',
    label: 'Trades',
    columns: [
      {
        icon: Users,
        label: 'Player trades',
        title: 'Trades with other players',
        value: p => p.stats.trades,
        total: true,
      },
      { icon: ArrowUp, label: 'Gave', title: 'Cards given to players', value: p => p.stats.cardsOut.trade ?? 0 },
      { icon: ArrowDown, label: 'Got', title: 'Cards received from players', value: p => p.stats.cardsIn.trade ?? 0 },
      {
        icon: Landmark,
        label: 'Bank trades',
        title: 'Trades with the bank or a harbor',
        value: p => p.stats.bankTrades,
        total: true,
      },
      { icon: ArrowUp, label: 'Gave', title: 'Cards given to the bank', value: p => p.stats.cardsOut.bank ?? 0 },
      { icon: ArrowDown, label: 'Got', title: 'Cards received from the bank', value: p => p.stats.cardsIn.bank ?? 0 },
    ],
  },
];

/** The category's columns, without optional ones nobody scored in. */
export function visibleColumns(category: StatCategory, view: GameView): StatColumn[] {
  return category.columns.filter(
    column => !column.optional || view.players.some(player => column.value(player, view) !== 0),
  );
}
