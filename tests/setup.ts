import { DEFAULT_SETTINGS } from '../shared/settings';

// Unit tests are written against these settings, so editing shared/default-settings.ts to change
// the live game doesn't break them. Most tests script exact dice with a seeded random; balanced
// dice draw from a deck instead, so tests/dice.test.ts turns them on explicitly.
Object.assign(DEFAULT_SETTINGS, {
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
  diceMode: 'random',
  volcanoStart: true,
  volcanoDice: 'balanced',
  routeLinks: 'anywhere',
  chartSpecial: false,
} satisfies typeof DEFAULT_SETTINGS);
