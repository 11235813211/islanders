import type { GameSettings } from './types';

/**
 * The settings every new room starts with. Edit the values here; the host can still change them
 * in the lobby. A wrong value fails `npm run typecheck` or `tests/settings.test.ts`.
 */
export const DEFAULT_SETTINGS: GameSettings = {
  // Points to win: 3 to 50.
  victoryPoints: 10,
  // Extra pieces at some points, on maps without their own. Changing points to win refills this
  // from POINT_REWARDS below; the host can then edit it.
  pieceRewards: [],
  // Seconds per turn: 15 to 900.
  turnSeconds: 90,
  // Seconds before the dice roll themselves: 0 (off), 5, 8, 10, 15, or 30.
  autoRollSeconds: 8,
  // Seconds a trade offer stays open: 15, 30, 45, 60, 90, or 120.
  tradeSeconds: 30,
  // Seconds for short choices (robber, pirate, gold picks): 10, 15, 20, 25, 30, 45, or 60.
  decisionSeconds: 20,
  // Cards you may hold on a 7 without discarding: 3 to 20.
  discardLimit: 10,
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

/**
 * Extra pieces a room gets when the host sets points to win, on a map without its own: `pieces`
 * at `first` points, then again every `every` points, for each step at least `ahead` points below
 * the goal (10 from 14 points, 13 from 17, 16 from 20, ...).
 */
export const POINT_REWARDS = {
  first: 10,
  every: 3,
  ahead: 4,
  pieces: { settlements: 1, cities: 1, roads: 3 },
} as const;

/**
 * Back-end tuning: the same for every room, never shown in the lobby. Edit the values here.
 */
export const TUNING = {
  // Seconds each trade, build, or card played during the build phase adds to the turn clock
  // (never above a full turn).
  actionBonusSeconds: 20,
  // Trade offers one person may have open at once.
  maxOpenOffers: 3,
  // Maps one person may propose (or back) in the lobby at once.
  mapProposalsPerPlayer: 3,
  // Seconds the host may be disconnected before hosting passes to someone connected.
  hostAwaySeconds: 20,
  // Seconds between a client's pings. Background tabs may slow this down.
  pingSeconds: 3,
  // Seconds without a ping before a person counts as disconnected. Keep well above pingSeconds,
  // or background tabs flicker between connected and disconnected.
  disconnectSeconds: 10,
} as const;
