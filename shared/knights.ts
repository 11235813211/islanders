// Cities & Knights: the card table, tracks, costs, and state shapes shared by the engine, bots,
// and the UI. The rules themselves live in shared/engine/knights*.ts and engine/progress.ts.
import type { Commodity, Resource, ResourceBag } from './types';

/** The three city improvement tracks, each with its own commodity and progress deck. */
export const TRACKS = ['trade', 'politics', 'science'] as const;
export type Track = (typeof TRACKS)[number];

/** What each track is called, what it costs, and what its third level gives. */
export const TRACK_INFO: Record<Track, { name: string; commodity: Commodity; color: string; level3: string }> = {
  trade: {
    name: 'Trade',
    commodity: 'cloth',
    color: 'yellow',
    level3: 'Trading house: trade commodities with the bank 2:1.',
  },
  politics: {
    name: 'Politics',
    commodity: 'coin',
    color: 'blue',
    level3: 'Fortress: knights can be promoted to mighty.',
  },
  science: {
    name: 'Science',
    commodity: 'paper',
    color: 'green',
    level3: 'Aqueduct: when a roll gives you nothing, take a resource of your choice.',
  },
};

/** The commodity a city on this tile resource makes besides the resource. */
export const COMMODITY_OF: Partial<Record<Resource, Commodity>> = { wood: 'paper', sheep: 'cloth', ore: 'coin' };

/** What a progress card needs from the person playing it. */
export type ProgressTarget =
  | 'none'
  | 'dice'
  | 'two-hexes'
  | 'city'
  | 'settlement'
  | 'resource'
  | 'commodity'
  | 'card'
  | 'player'
  | 'hex'
  | 'road'
  | 'knight'
  | 'points';

export const PROGRESS_KINDS = [
  'alchemist',
  'inventor',
  'crane',
  'engineer',
  'irrigation',
  'medicine',
  'mining',
  'printer',
  'road-building',
  'smith',
  'commercial-harbor',
  'master-merchant',
  'merchant',
  'merchant-fleet',
  'resource-monopoly',
  'trade-monopoly',
  'bishop',
  'constitution',
  'deserter',
  'diplomat',
  'intrigue',
  'saboteur',
  'spy',
  'warlord',
  'wedding',
] as const;
export type ProgressKind = (typeof PROGRESS_KINDS)[number];

interface ProgressInfo {
  track: Track;
  /** Copies in the deck. */
  count: number;
  name: string;
  text: string;
  target: ProgressTarget;
}

/** Every progress card: 18 per track. Card text here is what the hand and the help show. */
export const PROGRESS: Record<ProgressKind, ProgressInfo> = {
  alchemist: {
    track: 'science',
    count: 2,
    name: 'Alchemist',
    text: 'Before you roll: choose the red and yellow dice. The event die rolls as usual.',
    target: 'dice',
  },
  inventor: {
    track: 'science',
    count: 2,
    name: 'Inventor',
    text: 'Swap the numbers of two tiles. Not 2, 12, 6, or 8.',
    target: 'two-hexes',
  },
  crane: {
    track: 'science',
    count: 2,
    name: 'Crane',
    text: 'Your next city improvement this turn costs 1 commodity less.',
    target: 'none',
  },
  engineer: { track: 'science', count: 1, name: 'Engineer', text: 'Build a city wall for free.', target: 'city' },
  irrigation: {
    track: 'science',
    count: 2,
    name: 'Irrigation',
    text: 'Take 2 grain for each fields tile beside your settlements and cities.',
    target: 'none',
  },
  medicine: {
    track: 'science',
    count: 2,
    name: 'Medicine',
    text: 'Upgrade a settlement to a city for 2 ore and 1 grain.',
    target: 'settlement',
  },
  mining: {
    track: 'science',
    count: 2,
    name: 'Mining',
    text: 'Take 2 ore for each mountains tile beside your settlements and cities.',
    target: 'none',
  },
  printer: { track: 'science', count: 1, name: 'Printer', text: '1 victory point. Shown at once.', target: 'points' },
  'road-building': {
    track: 'science',
    count: 2,
    name: 'Road Building',
    text: 'Build 2 roads for free.',
    target: 'none',
  },
  smith: {
    track: 'science',
    count: 2,
    name: 'Smith',
    text: 'Promote up to 2 knights for free this turn.',
    target: 'none',
  },
  'commercial-harbor': {
    track: 'trade',
    count: 2,
    name: 'Commercial Harbor',
    text: 'Name a resource. Each opponent with a commodity gets 1 of it from you and gives you a random commodity.',
    target: 'resource',
  },
  'master-merchant': {
    track: 'trade',
    count: 2,
    name: 'Master Merchant',
    text: 'Take 2 random cards from a player with more points than you.',
    target: 'player',
  },
  merchant: {
    track: 'trade',
    count: 6,
    name: 'Merchant',
    text: 'Put the merchant on a tile beside your building: you trade its resource 2:1. Worth 1 point while you hold it.',
    target: 'hex',
  },
  'merchant-fleet': {
    track: 'trade',
    count: 2,
    name: 'Merchant Fleet',
    text: 'This turn, trade one card kind of your choice with the bank 2:1.',
    target: 'card',
  },
  'resource-monopoly': {
    track: 'trade',
    count: 4,
    name: 'Resource Monopoly',
    text: 'Name a resource. Each opponent gives you 2 of it, if they can.',
    target: 'resource',
  },
  'trade-monopoly': {
    track: 'trade',
    count: 2,
    name: 'Trade Monopoly',
    text: 'Name a commodity. Each opponent gives you 1 of it, if they can.',
    target: 'commodity',
  },
  bishop: {
    track: 'politics',
    count: 2,
    name: 'Bishop',
    text: 'Move the robber. Take 1 random card from each player beside its new tile.',
    target: 'none',
  },
  constitution: {
    track: 'politics',
    count: 1,
    name: 'Constitution',
    text: '1 victory point. Shown at once.',
    target: 'points',
  },
  deserter: {
    track: 'politics',
    count: 2,
    name: 'Deserter',
    text: 'An opponent loses their weakest knight. You place a knight of the same strength for free.',
    target: 'player',
  },
  diplomat: {
    track: 'politics',
    count: 2,
    name: 'Diplomat',
    text: 'Remove an open road (one with a free end). If it is yours, place it again for free.',
    target: 'road',
  },
  intrigue: {
    track: 'politics',
    count: 2,
    name: 'Intrigue',
    text: 'Chase away an opponent’s knight that stands on one of your roads.',
    target: 'knight',
  },
  saboteur: {
    track: 'politics',
    count: 2,
    name: 'Saboteur',
    text: 'Each player with at least as many points as you discards half their cards.',
    target: 'none',
  },
  spy: {
    track: 'politics',
    count: 3,
    name: 'Spy',
    text: 'Take a random progress card from an opponent.',
    target: 'player',
  },
  warlord: {
    track: 'politics',
    count: 2,
    name: 'Warlord',
    text: 'Activate all your knights for free.',
    target: 'none',
  },
  wedding: {
    track: 'politics',
    count: 2,
    name: 'Wedding',
    text: 'Each player with more points than you gives you 2 cards of their choice.',
    target: 'none',
  },
};

const bag = (cards: Partial<ResourceBag>): ResourceBag => ({
  wood: 0,
  brick: 0,
  sheep: 0,
  wheat: 0,
  ore: 0,
  lodestone: 0,
  paper: 0,
  cloth: 0,
  coin: 0,
  ...cards,
});

/** Cities & Knights costs. A city improvement costs its new level in the track's commodity. */
export const KNIGHTS_COSTS = {
  knight: bag({ sheep: 1, ore: 1 }),
  promote: bag({ sheep: 1, ore: 1 }),
  activate: bag({ wheat: 1 }),
  wall: bag({ brick: 2 }),
  medicine: bag({ ore: 2, wheat: 1 }),
};

/** Fixed numbers of the expansion. */
export const KNIGHTS_LIMITS = {
  /** Steps the barbarian ship sails before it lands. */
  barbarianDistance: 7,
  /** Knight pieces of each strength per player. */
  knightsPerLevel: 2,
  walls: 3,
  /** Each wall lets you hold this many more cards on a 7. */
  wallCards: 2,
  /** Progress cards you may hold (point cards are shown at once and don't count). */
  hand: 4,
  maxLevel: 5,
  /** Points to win in a new Cities & Knights room. */
  victoryPoints: 13,
} as const;

export type KnightLevel = 1 | 2 | 3;
export const KNIGHT_NAMES: Record<KnightLevel, string> = { 1: 'Basic knight', 2: 'Strong knight', 3: 'Mighty knight' };

export interface Knight {
  playerId: string;
  level: KnightLevel;
  active: boolean;
  /** The turn it was last activated: a knight can't act on the turn it is activated. */
  activeTurn: number;
  /** The turn it was last promoted: once per turn. */
  promotedTurn: number;
}

/** The event die: the barbarian ship (three faces) or a city gate of one track's color. */
export type EventFace = 'ship' | Track;
export const EVENT_FACES: EventFace[] = ['ship', 'ship', 'ship', 'trade', 'politics', 'science'];

export interface ProgressCard {
  id: string;
  kind: ProgressKind;
}

/** What players can see of the expansion, and what the engine keeps on top (see KnightsState). */
export interface KnightsBoard {
  /** Vertex id → the knight standing there. */
  knights: Record<string, Knight>;
  /** Player id → their level on each track (0–5). */
  improvements: Record<string, Record<Track, number>>;
  /** The city (vertex id) holding each track's metropolis, or null. */
  metropolis: Record<Track, string | null>;
  /** Cities with a wall. */
  walls: string[];
  /** Steps the barbarian ship has sailed toward the island (it lands at barbarianDistance). */
  barbarian: number;
  /** Barbarian attacks so far. The robber stays put until the first. */
  attacks: number;
  /** The event die's last face. */
  event: EventFace | null;
  /** Defender of Catan points won by each player. */
  defender: Record<string, number>;
  /** Points from Printer and Constitution cards. */
  cardPoints: Record<string, number>;
  merchant: { hexId: string; playerId: string } | null;
  /** This turn only: the card kind the active player trades 2:1 (Merchant Fleet). */
  fleet: Resource | null;
  /** This turn only: free knight promotions left (Smith), and the Crane's discount. */
  smith: number;
  crane: boolean;
  /** Wedding: who still owes the active player cards, and how many. */
  gifts: Record<string, number>;
  /** Deserter: the strength of the knight the active player now places, or null. */
  pendingKnight: KnightLevel | null;
  /** The last barbarian attack, for the log panel and the barbarian track. */
  lastAttack: BarbarianAttack | null;
}

/** How a barbarian attack went. */
export interface BarbarianAttack {
  turn: number;
  strength: number;
  defense: number;
  /** Each player's active knight strength. */
  knights: Record<string, number>;
  won: boolean;
  /** Defender of Catan (one top knight player), or players who drew a progress card for a tie. */
  defenders: string[];
  /** Players who lost a city. */
  losers: string[];
}

export interface KnightsState extends KnightsBoard {
  /** The three progress decks, next card last. Hidden. */
  decks: Record<Track, ProgressCard[]>;
  /** Each player's progress cards. Hidden from everyone else. */
  hands: Record<string, ProgressCard[]>;
  /** Saboteur's discards return to building, not to the robber. */
  sabotage: boolean;
  /** Bishop: the robber's next move takes a card from everyone beside it. */
  bishop: boolean;
}

/** What one seat can do with the expansion right now (see knightMoves in engine/knights-legal.ts). */
export interface KnightMoves {
  build: string[];
  activate: string[];
  promote: string[];
  /** Knight vertex → where it may move (a weaker opponent knight there is chased away). */
  moves: Record<string, string[]>;
  /** Active knights beside the robber that may chase it away. */
  chase: string[];
  walls: string[];
  improve: Track[];
  /** Progress cards that can be played now. */
  playable: string[];
  /** Where the Deserter's knight may go. */
  placeKnight: string[];
  /** Targets for the progress cards that need one. */
  targets: {
    merchant: string[];
    intrigue: string[];
    diplomat: string[];
    medicine: string[];
    engineer: string[];
    inventor: string[];
    /** Players with more points than you (Master Merchant). */
    richer: string[];
    /** Opponents holding progress cards (Spy). */
    spy: string[];
    /** Opponents with a knight (Deserter). */
    deserter: string[];
  };
}

export interface KnightsView extends KnightsBoard {
  deckCounts: Record<Track, number>;
  handCounts: Record<string, number>;
  /** Your own progress cards. */
  hand: ProgressCard[];
  legal: KnightMoves;
}

/** A player's points from the expansion: metropolises, Defender of Catan, point cards, and the merchant. */
export function knightsPoints(
  state: { buildings: Record<string, { playerId: string }>; ck: KnightsBoard | null },
  playerId: string,
): number {
  const ck = state.ck;
  if (!ck) return 0;
  const metropolises = Object.values(ck.metropolis).filter(v => v && state.buildings[v]?.playerId === playerId).length;
  return (
    metropolises * 2 +
    (ck.defender[playerId] ?? 0) +
    (ck.cardPoints[playerId] ?? 0) +
    (ck.merchant?.playerId === playerId ? 1 : 0)
  );
}

/** Total strength of a player's active knights (what they put against the barbarians). */
export function activeStrength(ck: Pick<KnightsBoard, 'knights'>, playerId: string): number {
  return Object.values(ck.knights)
    .filter(k => k.playerId === playerId && k.active)
    .reduce((n, k) => n + k.level, 0);
}

/** The barbarians' strength: every city on the island, metropolises included. */
export function barbarianStrength(buildings: Record<string, { kind: string }>): number {
  return Object.values(buildings).filter(b => b.kind === 'city').length;
}
