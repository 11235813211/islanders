import { GUEST_NAMES } from './guest-names';
import { type BotLevel, type GameSettings, type Phase, PIECE_STYLES } from './types';

export const DEFAULT_SETTINGS: GameSettings = {
  autoRollSeconds: 10,
  trackDice: true,
  numberLayout: 'ordered',
  turnSeconds: 120,
  friendlyRobber: false,
  discardLimit: 7,
  victoryPoints: 10,
  pieceStyle: 'classic',
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
    [0, 5, 10, 15, 30].includes(s.autoRollSeconds as number) &&
    typeof s.trackDice === 'boolean' &&
    (s.numberLayout === undefined || ['random', 'ordered'].includes(s.numberLayout as string)) &&
    (s.turnSeconds === undefined || integerIn(s.turnSeconds, 15, 900)) &&
    (s.friendlyRobber === undefined || typeof s.friendlyRobber === 'boolean') &&
    (s.discardLimit === undefined || integerIn(s.discardLimit, 3, 20)) &&
    (s.victoryPoints === undefined || integerIn(s.victoryPoints, VICTORY_POINT_RANGE.min, VICTORY_POINT_RANGE.max)) &&
    (s.pieceStyle === undefined || PIECE_STYLES.includes(s.pieceStyle as never))
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
