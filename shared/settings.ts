import { DEFAULT_SETTINGS, POINT_REWARDS } from './default-settings';
import { GUEST_NAMES } from './guest-names';
import { SPECIAL_LIMITS } from './maps/special';
import type { PieceReward } from './maps/types';
import { type BotLevel, type DiscoveryRule, type GameSettings, type Phase, PIECE_STYLES } from './types';

/** The most seats at a table (and the most players a map can be made for). */
export const MAX_PLAYERS = 8;

export { DEFAULT_SETTINGS };

/** Automatic dice roll delays the lobby offers (0 is off). */
export const AUTO_ROLL_SECONDS = [0, 5, 8, 10, 15, 30];

/** Whether the bank's card counts are shown at a table of `players` (see BankDisplay). */
export function bankShown(settings: Pick<GameSettings, 'showBank'>, players: number): boolean {
  if (settings.showBank === 'always') return true;
  return settings.showBank === 'auto' && players > 2;
}

/** Trade offer lengths the lobby offers. */
export const TRADE_SECONDS = [15, 30, 45, 60, 90, 120] as const;

/** Lengths the lobby offers for short choices: the robber or pirate, gold, volcano picks. */
export const DECISION_SECONDS = [10, 15, 20, 25, 30, 45, 60] as const;

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
export const VICTORY_POINT_RANGE = { min: 3, max: 50 } as const;

/** One extra-pieces reward within limits (rooms and the board editor share them). */
export function validReward(value: unknown): value is PieceReward {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  const most = SPECIAL_LIMITS.rewardPieces;
  const int = (n: unknown, max: number, min = 0) => Number.isInteger(n) && Number(n) >= min && Number(n) <= max;
  return (
    Object.keys(r).length === (r.ships === undefined ? 4 : 5) &&
    int(r.points, VICTORY_POINT_RANGE.max, 1) &&
    int(r.settlements, most) &&
    int(r.cities, most) &&
    int(r.roads, most * 3) &&
    (r.ships === undefined || int(r.ships, most * 3))
  );
}

/** The extra pieces a room starts with for `victoryPoints` to win (see POINT_REWARDS); `sea` adds ships. */
export function pointRewards(victoryPoints: number, sea: boolean): PieceReward[] {
  const { first, every, ahead } = POINT_REWARDS;
  const pieces = sea ? POINT_REWARDS.seaPieces : POINT_REWARDS.pieces;
  const out: PieceReward[] = [];
  for (let points = first; points + ahead <= victoryPoints && out.length < SPECIAL_LIMITS.rewards; points += every)
    out.push({ points, ...pieces });
  return out;
}

/** A code an admin host may give their room: 4–12 letters and digits, starting with a letter. */
export const CUSTOM_ROOM_CODE = /^[A-Z][A-Z0-9]{3,11}$/;

/** A room closes once no human player has been connected for this long. */
export const EMPTY_ROOM_MS = 5 * 60 * 1000;
/** A game against bots waits this long instead, so it can be finished later. */
export const SAVED_BOT_GAME_HOURS = 24;

/** One person playing bots in a real (not solo test) game: nobody else is waiting on them. */
export function isBotGame(game: { phase: Phase; testMode: boolean; players: { bot?: BotLevel | null }[] }): boolean {
  if (game.testMode || game.phase === 'lobby' || game.phase === 'pick-board' || game.phase === 'finished') return false;
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
    (s.pieceRewards === undefined ||
      (Array.isArray(s.pieceRewards) &&
        s.pieceRewards.length <= SPECIAL_LIMITS.rewards &&
        s.pieceRewards.every(validReward))) &&
    (s.pieceStyle === undefined || PIECE_STYLES.includes(s.pieceStyle as never)) &&
    (s.tradeSeconds === undefined || TRADE_SECONDS.includes(s.tradeSeconds as never)) &&
    (s.decisionSeconds === undefined || DECISION_SECONDS.includes(s.decisionSeconds as never)) &&
    (s.showBank === undefined || ['auto', 'always', 'never'].includes(s.showBank as string)) &&
    (s.discoveries === undefined || Object.hasOwn(DISCOVERY_RULES, s.discoveries as string)) &&
    (s.volcanoGold === undefined || typeof s.volcanoGold === 'boolean') &&
    (s.seafarers === undefined || typeof s.seafarers === 'boolean') &&
    (s.diceMode === undefined || ['random', 'balanced'].includes(s.diceMode as string)) &&
    (s.volcanoStart === undefined || typeof s.volcanoStart === 'boolean') &&
    (s.volcanoDice === undefined || ['random', 'balanced'].includes(s.volcanoDice as string)) &&
    (s.routeLinks === undefined || ['anywhere', 'settlement'].includes(s.routeLinks as string)) &&
    (s.chartSpecial === undefined || typeof s.chartSpecial === 'boolean') &&
    (s.citiesKnights === undefined || typeof s.citiesKnights === 'boolean')
  );
}

/** A player name made tidy, or null if it can't be used: 1–24 characters, no markup or control characters. */
export function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return name.length < 1 || name.length > 24 || /[\p{Cc}\p{Cf}<>]/u.test(name) ? null : name;
}

/** Whether someone other than `selfId` in this room already goes by `name` (capitals don't count). */
export function nameTaken(members: readonly { id: string; name: string }[], name: string, selfId: string): boolean {
  const key = name.toLowerCase();
  return members.some(member => member.id !== selfId && member.name.toLowerCase() === key);
}

/** A name from shared/guest-names.ts nobody in the room is using, numbered once the list runs out. */
export function guestName(taken: readonly string[], random: () => number = Math.random): string {
  const used = new Set(taken.map(name => name.toLowerCase()));
  const free = GUEST_NAMES.filter(name => !used.has(name.toLowerCase()));
  if (free.length) return free[Math.floor(random() * free.length)]!;
  const base = GUEST_NAMES[Math.floor(random() * GUEST_NAMES.length)] ?? 'Guest';
  for (let n = 2; ; n++) if (!used.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}
