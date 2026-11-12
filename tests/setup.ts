import { DEFAULT_SETTINGS } from '../shared/settings';

// Most tests script exact dice with a seeded random; balanced dice (the real default) draw from
// a deck instead. tests/dice.test.ts turns balanced dice on explicitly.
DEFAULT_SETTINGS.diceMode = 'random';
