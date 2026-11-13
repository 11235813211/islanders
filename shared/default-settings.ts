import type { GameSettings } from './types';

/**
 * The settings every new room starts with. Edit the values here; the host can still change them
 * in the lobby. A wrong value fails `npm run typecheck` or `tests/settings.test.ts`.
 */
export const DEFAULT_SETTINGS: GameSettings = {
  // Points to win: 3 to 20.
  victoryPoints: 10,
  // Seconds per turn: 15 to 900.
  turnSeconds: 120,
  // Seconds before the dice roll themselves: 0 (off), 5, 8, 10, 15, or 30.
  autoRollSeconds: 8,
  // Seconds a trade offer stays open: 15, 30, 45, 60, 90, or 120.
  tradeSeconds: 30,
  // Cards you may hold on a 7 without discarding: 3 to 20.
  discardLimit: 7,
  // Robber can't block players with 2 or fewer points: true or false.
  friendlyRobber: true,
  // Dice: 'balanced' (shuffled deck of the 36 rolls) or 'random'.
  diceMode: 'balanced',
  // Show how often each number has been rolled: true or false.
  trackDice: true,
  // Number tokens on the standard island: 'ordered' (printed spiral) or 'random' (6s and 8s apart).
  numberLayout: 'ordered',
  // Show the bank's card counts: 'auto' (3+ players), 'always', or 'never'.
  showBank: 'auto',
  // Piece look: 'classic' or 'chalet'.
  pieceStyle: 'classic',
  // Seafarers rules (ships, pirate): true or false.
  seafarers: false,
  // Where a road and a ship may join: 'anywhere' or 'settlement' (published rule).
  routeLinks: 'anywhere',
  // Jungle discoveries: 'kept', 'tradable', or 'card'.
  discoveries: 'kept',
  // Volcanoes pay a resource of the owner's choice: true or false.
  volcanoGold: true,
  // Setup settlements may touch a volcano: true or false.
  volcanoStart: true,
  // Eruption dice: 'balanced' or 'random'.
  volcanoDice: 'balanced',
  // Cartographers: gold fields and volcanoes may be charted too: true or false.
  chartSpecial: true,
};
