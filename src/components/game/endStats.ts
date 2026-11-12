import { type GameView, type PublicPlayer, RESOURCES } from '../../../shared/types';

/** One column of an end-of-game stats table: a number per player. */
export interface StatColumn {
  label: string;
  title: string;
  value: (player: PublicPlayer, view: GameView) => number;
  /** Hidden when every player has zero (sea-map and variant stats). */
  optional?: boolean;
  /** Shown bold, for totals. */
  total?: boolean;
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
      { label: 'VP', title: 'Victory points', value: p => p.points, total: true },
      { label: 'Gained', title: 'Cards gained in any way', value: cardsIn },
      { label: 'Lost', title: 'Cards spent or lost in any way', value: cardsOut },
      { label: '7s', title: 'Sevens this player rolled', value: sevens },
      { label: 'Stolen', title: 'Cards taken with the robber', value: p => p.stats.cardsIn.steal ?? 0 },
      { label: 'Trades', title: 'Trades with other players', value: p => p.stats.trades },
    ],
  },
  {
    id: 'points',
    label: 'Points',
    columns: [
      {
        label: 'Settlements',
        title: 'Settlements on the board (1 each)',
        value: (p, v) => standing(v, p.id, 'settlement'),
      },
      { label: 'Cities', title: 'Points from cities (2 each)', value: (p, v) => 2 * standing(v, p.id, 'city') },
      { label: 'Road', title: 'Longest road (2)', value: (p, v) => (v.longestRoadId === p.id ? 2 : 0) },
      { label: 'Army', title: 'Largest army (2)', value: (p, v) => (v.largestArmyId === p.id ? 2 : 0) },
      { label: 'VP cards', title: 'Victory point cards', value: p => p.points - p.publicPoints },
      { label: 'Islands', title: 'Island bonus points', value: p => p.bonusPoints, optional: true },
      { label: 'Total', title: 'Victory points', value: p => p.points, total: true },
    ],
  },
  {
    id: 'gained',
    label: 'Cards gained',
    columns: [
      { label: 'Rolls', title: 'Cards from dice rolls', value: p => p.stats.cardsIn.roll ?? 0 },
      {
        label: 'Gold',
        title: 'Cards chosen from gold fields and volcanoes',
        value: p => p.stats.cardsIn.gold ?? 0,
        optional: true,
      },
      { label: 'Setup', title: 'Cards from the second setup settlement', value: p => p.stats.cardsIn.setup ?? 0 },
      {
        label: 'Exploring',
        title: 'Cards for revealing fog',
        value: p => p.stats.cardsIn.explore ?? 0,
        optional: true,
      },
      { label: 'Robber', title: 'Cards taken with the robber', value: p => p.stats.cardsIn.steal ?? 0 },
      { label: 'Monopoly', title: 'Cards taken with Monopoly', value: p => p.stats.cardsIn.monopoly ?? 0 },
      { label: 'Plenty', title: 'Cards from Year of Plenty', value: p => p.stats.cardsIn.plenty ?? 0 },
      { label: 'Bank', title: 'Cards received in bank and harbor trades', value: p => p.stats.cardsIn.bank ?? 0 },
      { label: 'Players', title: 'Cards received in trades with players', value: p => p.stats.cardsIn.trade ?? 0 },
      { label: 'Total', title: 'All cards gained', value: cardsIn, total: true },
    ],
  },
  {
    id: 'lost',
    label: 'Cards lost',
    columns: [
      {
        label: 'Building',
        title: 'Cards spent on pieces and development cards',
        value: p => p.stats.cardsOut.build ?? 0,
      },
      { label: 'Discards', title: 'Cards discarded on a 7', value: p => p.stats.cardsOut.discard ?? 0 },
      { label: 'Robber', title: 'Cards stolen by the robber', value: p => p.stats.cardsOut.steal ?? 0 },
      { label: 'Monopoly', title: 'Cards lost to Monopoly', value: p => p.stats.cardsOut.monopoly ?? 0 },
      { label: 'Bank', title: 'Cards given in bank and harbor trades', value: p => p.stats.cardsOut.bank ?? 0 },
      { label: 'Players', title: 'Cards given in trades with players', value: p => p.stats.cardsOut.trade ?? 0 },
      { label: 'Total', title: 'All cards spent or lost', value: cardsOut, total: true },
    ],
  },
  {
    id: 'production',
    label: 'Production',
    columns: [
      ...RESOURCES.map(resource => ({
        label: capitalized(resource),
        title: `${capitalized(resource)} from rolls and gold`,
        value: (p: PublicPlayer) => p.stats.produced[resource] ?? 0,
      })),
      { label: 'Total', title: 'Resources from rolls and gold', value: p => sum(p.stats.produced), total: true },
      { label: 'Blocked', title: 'Cards the robber kept from this player', value: p => p.stats.blocked },
    ],
  },
  {
    id: 'robber',
    label: 'Robber',
    columns: [
      { label: '7s', title: 'Sevens this player rolled', value: sevens },
      { label: 'Moves', title: 'Times this player moved the robber or pirate', value: p => p.stats.robberMoves },
      { label: 'Knights', title: 'Knights played', value: p => p.knights },
      { label: 'Stole', title: 'Cards taken with the robber', value: p => p.stats.cardsIn.steal ?? 0 },
      { label: 'Robbed', title: 'Cards stolen from this player', value: p => p.stats.cardsOut.steal ?? 0 },
      { label: 'Discarded', title: 'Cards discarded on a 7', value: p => p.stats.cardsOut.discard ?? 0 },
      { label: 'Blocked', title: 'Cards the robber kept from this player', value: p => p.stats.blocked },
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
      { label: 'Roads', title: 'Roads built, setup included', value: p => p.stats.built.road ?? 0 },
      { label: 'Ships', title: 'Ships built, setup included', value: p => p.stats.built.ship ?? 0, optional: true },
      { label: 'Settlements', title: 'Settlements built, setup included', value: p => p.stats.built.settlement ?? 0 },
      { label: 'Cities', title: 'Cities built', value: p => p.stats.built.city ?? 0 },
      { label: 'Dev cards', title: 'Development cards bought', value: p => p.stats.built.development ?? 0 },
      { label: 'Knights', title: 'Knights played', value: p => p.stats.played.knight ?? 0 },
      { label: 'Roads card', title: 'Road Building played', value: p => p.stats.played['road-building'] ?? 0 },
      { label: 'Plenty', title: 'Year of Plenty played', value: p => p.stats.played['year-of-plenty'] ?? 0 },
      { label: 'Monopoly', title: 'Monopoly played', value: p => p.stats.played.monopoly ?? 0 },
      {
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
      { label: 'Player trades', title: 'Trades with other players', value: p => p.stats.trades, total: true },
      { label: 'Gave', title: 'Cards given to players', value: p => p.stats.cardsOut.trade ?? 0 },
      { label: 'Got', title: 'Cards received from players', value: p => p.stats.cardsIn.trade ?? 0 },
      { label: 'Bank trades', title: 'Trades with the bank or a harbor', value: p => p.stats.bankTrades, total: true },
      { label: 'Gave', title: 'Cards given to the bank', value: p => p.stats.cardsOut.bank ?? 0 },
      { label: 'Got', title: 'Cards received from the bank', value: p => p.stats.cardsIn.bank ?? 0 },
    ],
  },
];

/** The category's columns, without optional ones nobody scored in. */
export function visibleColumns(category: StatCategory, view: GameView): StatColumn[] {
  return category.columns.filter(
    column => !column.optional || view.players.some(player => column.value(player, view) !== 0),
  );
}
