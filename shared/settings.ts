import { GUEST_NAMES } from './guest-names';
import { type BotLevel, type DiscoveryRule, type GameSettings, type Phase, PIECE_STYLES } from './types';

/** Automatic dice roll delays the lobby offers (0 is off). */
export const AUTO_ROLL_SECONDS = [0, 5, 8, 10, 15, 30];

export const DEFAULT_SETTINGS: GameSettings = {
  autoRollSeconds: 8,
  trackDice: true,
  numberLayout: 'ordered',
  turnSeconds: 120,
  friendlyRobber: true,
  discardLimit: 7,
  victoryPoints: 10,
  pieceStyle: 'classic',
  tradeSeconds: 30,
  showBank: 'auto',
  discoveries: 'kept',
  volcanoGold: true,
  seafarers: false,
  diceMode: 'balanced',
  volcanoStart: true,
  volcanoDice: 'balanced',
  routeLinks: 'anywhere',
  chartSpecial: true,
};
/** Whether the bank's card counts are shown at a table of `players` (see BankDisplay). */
export function bankShown(settings: Pick<GameSettings, 'showBank'>, players: number): boolean {
  if (settings.showBank === 'always') return true;
  return settings.showBank === 'auto' && players > 2;
}

/** Trade offer lengths the lobby offers. */
export const TRADE_SECONDS = [15, 30, 45, 60, 90, 120] as const;

/**
 * Discovery rules: what jungle discoveries can do besides paying for development cards.
 * `kept` is the published jungle rule.
 */
export const DISCOVERY_RULES: Record<
  DiscoveryRule,
  { label: string; hint: string; tradable: boolean; inHand: boolean; stealable: boolean }
> = {
  kept: {
    label: 'Kept safe',
    hint: 'Never stolen, traded, or discarded',
    tradable: false,
    inHand: false,
    stealable: false,
  },
  tradable: {
    label: 'Tradable',
    hint: 'Traded, and counted toward discards on a 7; never stolen or taken by Monopoly',
    tradable: true,
    inHand: true,
    stealable: false,
  },
  card: {
    label: 'Like a card',
    hint: 'Stolen, traded, discarded, and taken by Monopoly or Year of Plenty like a resource',
    tradable: true,
    inHand: true,
    stealable: true,
  },
};
export const VICTORY_POINT_RANGE = { min: 3, max: 20 } as const;

/** A room closes once no human player has been connected for this long. */
export const EMPTY_ROOM_MS = 5 * 60 * 1000;
/** A game against bots waits this long instead, so it can be finished later. */
export const SAVED_BOT_GAME_HOURS = 24;

/** One person playing bots in a real (not solo test) game: nobody else is waiting on them. */
export function isBotGame(game: { phase: Phase; testMode: boolean; players: { bot?: BotLevel | null }[] }): boolean {
  if (game.testMode || game.phase === 'lobby' || game.phase === 'finished') return false;
  return game.players.filter(p => !p.bot).length === 1;
}

/** How long a room with no player connected stays open. */
export function emptyRoomMs(game: Parameters<typeof isBotGame>[0]): number {
  return isBotGame(game) ? SAVED_BOT_GAME_HOURS * 60 * 60 * 1000 : EMPTY_ROOM_MS;
}

export function validSettings(
  value: unknown,
): value is Partial<GameSettings> & Pick<GameSettings, 'autoRollSeconds' | 'trackDice'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  const integerIn = (field: unknown, min: number, max: number) =>
    Number.isInteger(field) && Number(field) >= min && Number(field) <= max;
  return (
    Object.keys(s).every(key => Object.hasOwn(DEFAULT_SETTINGS, key)) &&
    AUTO_ROLL_SECONDS.includes(s.autoRollSeconds as number) &&
    typeof s.trackDice === 'boolean' &&
    (s.numberLayout === undefined || ['random', 'ordered'].includes(s.numberLayout as string)) &&
    (s.turnSeconds === undefined || integerIn(s.turnSeconds, 15, 900)) &&
    (s.friendlyRobber === undefined || typeof s.friendlyRobber === 'boolean') &&
    (s.discardLimit === undefined || integerIn(s.discardLimit, 3, 20)) &&
    (s.victoryPoints === undefined || integerIn(s.victoryPoints, VICTORY_POINT_RANGE.min, VICTORY_POINT_RANGE.max)) &&
    (s.pieceStyle === undefined || PIECE_STYLES.includes(s.pieceStyle as never)) &&
    (s.tradeSeconds === undefined || TRADE_SECONDS.includes(s.tradeSeconds as never)) &&
    (s.showBank === undefined || ['auto', 'always', 'never'].includes(s.showBank as string)) &&
    (s.discoveries === undefined || Object.hasOwn(DISCOVERY_RULES, s.discoveries as string)) &&
    (s.volcanoGold === undefined || typeof s.volcanoGold === 'boolean') &&
    (s.seafarers === undefined || typeof s.seafarers === 'boolean') &&
    (s.diceMode === undefined || ['random', 'balanced'].includes(s.diceMode as string)) &&
    (s.volcanoStart === undefined || typeof s.volcanoStart === 'boolean') &&
    (s.volcanoDice === undefined || ['random', 'balanced'].includes(s.volcanoDice as string)) &&
    (s.routeLinks === undefined || ['anywhere', 'settlement'].includes(s.routeLinks as string)) &&
    (s.chartSpecial === undefined || typeof s.chartSpecial === 'boolean')
  );
}

/** A name from shared/guest-names.ts nobody in the room is using, numbered once the list runs out. */
export function guestName(taken: readonly string[], random: () => number = Math.random): string {
  const used = new Set(taken.map(name => name.toLowerCase()));
  const free = GUEST_NAMES.filter(name => !used.has(name.toLowerCase()));
  if (free.length) return free[Math.floor(random() * free.length)]!;
  const base = GUEST_NAMES[Math.floor(random() * GUEST_NAMES.length)] ?? 'Guest';
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}
