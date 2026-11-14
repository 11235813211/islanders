import type { BoardDesign, BoardRules } from './maps/types';
/** Every resource. Lodestone is only in play on Cartographers maps (see cartographersRules). */
export const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore', 'lodestone'] as const;
export type Resource = (typeof RESOURCES)[number];
/** The base game's five resources, for code that never meets lodestone (the trained bot's features). */
export const CLASSIC_RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'] as const;
export type ResourceBag = Record<Resource, number>;
/** Jungle discoveries, when room rules let them move like cards (see DISCOVERY_RULES). */
export type Tradable = Resource | 'discovery';
/** Resources plus, where the room allows it, jungle discoveries. */
export type TradeBag = ResourceBag & { discovery?: number };
/** How jungle discoveries behave. Defined with their labels in shared/settings.ts. */
export type DiscoveryRule = 'kept' | 'tradable' | 'card';
/**
 * Tiles added for sea maps. Sea and icebergs are water; fog is unexplored (its terrain is
 * revealed when a road or ship reaches one of its corners); the rest are land.
 */
export const SEA_TERRAINS = ['sea', 'gold', 'jungle', 'volcano', 'iceberg', 'fog'] as const;
export type SeaTerrain = (typeof SEA_TERRAINS)[number];
/** The base game's tiles. */
export type BaseTerrain = (typeof CLASSIC_RESOURCES)[number] | 'desert';
/** Every tile: base, lodestone (Cartographers), and sea-map tiles. */
export type Terrain = BaseTerrain | 'lodestone' | SeaTerrain;
export interface Hex {
  id: string;
  q: number;
  r: number;
  x: number;
  y: number;
  terrain: Terrain;
  number: number | null;
  /** Numbers charted onto the tile (Cartographers), after `number`. See hexNumbers. */
  extra?: number[];
  /** Cartographers: a split tile also pays this resource; whoever it pays picks either half. */
  split?: Resource;
  /** Corner vertices in order: lower right, bottom, lower left, upper left, top, upper right. */
  vertexIds: string[];
  /** Land tiles on sea maps: which island (connected land) the tile belongs to. */
  island?: number;
  /** Victory points for settling this tile's island for the first time (sea maps). */
  bonus?: number;
  /** No setup settlements may touch this tile's island. */
  noSetup?: boolean;
}
/** Cards from split tiles: each of `count` is one of the two `options`. */
export interface SplitChoice {
  options: [Resource, Resource];
  count: number;
}
export interface Vertex {
  id: string;
  x: number;
  y: number;
  hexIds: string[];
  edgeIds: string[];
  /** The map marks this corner as no place for a starting settlement. */
  noSetup?: boolean;
}
export interface Edge {
  id: string;
  a: string;
  b: string;
}
export interface Harbor {
  id: string;
  edgeId: string;
  vertices: [string, string];
  resource: Resource | 'any';
  x: number;
  y: number;
}
export interface Board {
  hexes: Hex[];
  vertices: Vertex[];
  edges: Edge[];
  harbors: Harbor[];
  /** The map's special rules (setup pieces, piece rewards, routes); absent on boards without any. */
  rules?: BoardRules;
}
export interface Building {
  playerId: string;
  kind: 'settlement' | 'city';
}
export const DEVELOPMENT_TYPES = ['knight', 'road-building', 'year-of-plenty', 'monopoly', 'victory-point'] as const;
export type DevelopmentType = (typeof DEVELOPMENT_TYPES)[number];
export interface DevelopmentCard {
  id: string;
  kind: DevelopmentType;
  boughtTurn: number;
}
/** Seat colors players can pick in the lobby. Display values live in shared/colors.ts. */
export const PLAYER_COLOR_IDS = ['white', 'orange', 'red', 'blue', 'green', 'brown', 'black', 'purple'] as const;
export type PlayerColor = (typeof PLAYER_COLOR_IDS)[number];
/** Bot strength. Advanced is the default, and also plays turns that time out. */
export const BOT_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];
export const DEFAULT_BOT_LEVEL: BotLevel = 'advanced';
export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  resources: ResourceBag;
  development: DevelopmentCard[];
  knights: number;
  /** Jungle finds. Each one stands in for any resource when buying a development card. */
  discoveries: number;
  /** Set for bot seats, including humans who left mid-game (their seat is taken over). */
  bot?: BotLevel;
}
/** Where a player's cards came from (counts only, so a stolen card's kind stays hidden). */
export const CARD_SOURCES = [
  'roll',
  'gold',
  'setup',
  'explore',
  'steal',
  'monopoly',
  'plenty',
  'bank',
  'trade',
] as const;
export type CardSource = (typeof CARD_SOURCES)[number];
/** Where a player's cards went. */
export const CARD_LOSSES = ['build', 'discard', 'steal', 'monopoly', 'bank', 'trade'] as const;
export type CardLoss = (typeof CARD_LOSSES)[number];
export type BuiltPiece = 'road' | 'ship' | 'settlement' | 'city' | 'development' | 'relay' | 'survey';
/** Public per-player totals for the whole game, shown on the end-of-game screen. */
export interface PlayerStats {
  cardsIn: Partial<Record<CardSource, number>>;
  cardsOut: Partial<Record<CardLoss, number>>;
  /** Resources paid by rolls and gold choices, by kind. */
  produced: Partial<ResourceBag>;
  /** This player's own dice totals. Hidden until the end when the room doesn't track dice. */
  rolls: Partial<Record<number, number>>;
  /** Pieces placed (setup included) and development cards bought. */
  built: Partial<Record<BuiltPiece, number>>;
  played: Partial<Record<DevelopmentType, number>>;
  /** Cards a robber kept from this player's buildings on rolls. */
  blocked: number;
  robberMoves: number;
  /** Completed trades with other players, and with the bank or a harbor. */
  trades: number;
  bankTrades: number;
  /** Settlements and cities a volcano damaged. */
  erupted: number;
}
export interface Spectator {
  id: string;
  name: string;
}
export type Phase =
  | 'lobby'
  | 'setup-settlement'
  | 'setup-road'
  | 'roll'
  | 'discard'
  | 'robber'
  | 'steal'
  | 'gold'
  /** Volcanoes showing the roll erupt: the roller rolls a die for each (after any gold choices). */
  | 'eruption'
  | 'free-roads'
  | 'build'
  /** Five or six players: after each turn, the others may build in order (no trading). */
  | 'special-build'
  | 'finished';
/**
 * Structured record of what a log line describes, for bots, stats, and UI.
 * `steal.resource` is only visible to the two players involved (see getView).
 */
export type GameEvent =
  | { kind: 'roll'; playerId: string; dice: [number, number]; gains: Record<string, ResourceBag> }
  /** `paid`: the cards that went to the bank for it (absent when it was free: setup, Road Building). */
  | {
      kind: 'build';
      playerId: string;
      piece: 'road' | 'ship' | 'settlement' | 'city' | 'development' | 'relay' | 'survey';
      paid?: ResourceBag;
    }
  | { kind: 'bank-trade'; playerId: string; give: ResourceBag; get: ResourceBag }
  | { kind: 'player-trade'; fromId: string; toId: string; give: TradeBag; get: TradeBag }
  | { kind: 'offer'; playerId: string; give: TradeBag; want: TradeBag; to?: string[] }
  | { kind: 'counter'; playerId: string; toId: string; give: TradeBag; want: TradeBag }
  | { kind: 'discard'; playerId: string; resources: TradeBag }
  | { kind: 'steal'; thiefId: string; victimId: string; resource: Tradable | null }
  | { kind: 'development'; playerId: string; card: DevelopmentType; gains: TradeBag | null }
  | { kind: 'gold'; playerId: string; resources: ResourceBag }
  | {
      kind: 'eruption';
      hexId: string;
      die: number;
      vertexId: string;
      playerId: string | null;
      damage: 'none' | 'city' | 'settlement';
      /** The building the lava reached, before the damage. */
      piece: 'settlement' | 'city' | null;
    }
  | {
      kind: 'iceberg';
      die: number;
      edgeId: string;
      playerId: string | null;
      /** Where the iceberg was, and where it moved (null when land or the pirate stopped it). */
      hexId: string;
      toHexId: string | null;
    }
  | { kind: 'discover'; playerId: string; hexId: string; terrain: Terrain }
  /** Which fog tile someone peeked at; what it hides stays theirs alone. */
  | { kind: 'peek'; playerId: string; hexId: string }
  /** Someone charted a tile: `numbers` is what it shows now. */
  | { kind: 'chart'; playerId: string; hexId: string; numbers: number[] }
  /** Someone split a tile: it now pays `resource` too. */
  | { kind: 'split'; playerId: string; hexId: string; resource: Resource }
  /** A person's connection came or went (logged by the room, see logPresence). */
  | { kind: 'presence'; playerId: string; online: boolean }
  /** A person ran out of time and the game made a forced choice for them (see engine/time.ts). */
  | { kind: 'takeover'; playerId: string; action: GameAction['type'] }
  | { kind: 'win'; playerId: string; points: number };
export interface GameLog {
  id: number;
  text: string;
  turn?: number;
  event?: GameEvent;
}
export interface ChatMessage {
  id: string;
  senderId: string;
  name: string;
  text: string;
  at: number;
  spectator: boolean;
}
export const PIECE_STYLES = ['classic', 'chalet'] as const;
/** How settlements and cities are drawn. Purely visual; the rules are the same. */
export type PieceStyle = (typeof PIECE_STYLES)[number];
/**
 * Whether everyone sees the bank's card counts. `auto` (the default) shows them except with two
 * players, where the counts would reveal the other player's hand by subtraction.
 */
export type BankDisplay = 'auto' | 'always' | 'never';
export interface GameSettings {
  autoRollSeconds: number;
  trackDice: boolean;
  numberLayout: 'random' | 'ordered';
  turnSeconds: number;
  friendlyRobber: boolean;
  discardLimit: number;
  victoryPoints: number;
  pieceStyle: PieceStyle;
  /** Seconds a trade offer stays open. */
  tradeSeconds: number;
  /** Everyone sees how many cards of each resource the bank has left. */
  showBank: BankDisplay;
  /** How jungle discoveries behave (only matters on maps with a jungle). */
  discoveries: DiscoveryRule;
  /** Volcanoes pay a resource of each owner's choice before erupting (the gold variant). */
  volcanoGold: boolean;
  /** Seafarers rules: ships and the pirate. On the standard island this adds a ring of sea. */
  seafarers: boolean;
  /** Dice: plain random, or balanced (draws from a shuffled deck of the 36 combinations). */
  diceMode: 'random' | 'balanced';
  /** Setup settlements may touch a volcano. */
  volcanoStart: boolean;
  /** Eruption dice: plain random, or balanced (each volcano draws from its own shuffled deck holding each face twice). */
  volcanoDice: 'random' | 'balanced';
  /** Seafarers: where a road and a ship may join. `settlement` is the published rule (only at your own building). */
  routeLinks: 'anywhere' | 'settlement';
  /** Cartographers: gold fields and volcanoes may be charted too. */
  chartSpecial: boolean;
}
/** A recipient's alternative terms. `give` is what the countering player gives. */
export interface TradeCounter {
  id: string;
  fromId: string;
  give: TradeBag;
  want: TradeBag;
}
export interface TradeOffer {
  id: string;
  fromId: string;
  give: TradeBag;
  want: TradeBag;
  /** Players the offer was sent to. */
  to: string[];
  /** Recipients who said yes; the offering player picks one of them to trade with. */
  acceptedBy: string[];
  declinedBy: string[];
  counters: TradeCounter[];
  createdAt: number;
  expiresAt: number;
}
/**
 * A trade two players agreed on while neither was taking their turn. It is offered again,
 * already accepted by the other, at the start of the next turn of either player.
 */
export interface DeferredTrade {
  id: string;
  /** Who gives `give` and receives `want`. */
  fromId: string;
  toId: string;
  give: TradeBag;
  want: TradeBag;
}
export interface Proposal {
  id: string;
  kind: 'undo' | 'pause' | 'resume';
  fromId: string;
  required: string[];
  accepted: string[];
  rejected: string[];
  expiresAt: number;
  description: string;
}
/** A lobby request from one player to take another's color (the two trade colors if accepted). */
export interface ColorSwap {
  from: string;
  to: string;
}
export interface UndoRecord {
  actorId: string;
  description: string;
  at: number;
  snapshot: Omit<
    GameState,
    | 'undo'
    | 'undoHistory'
    | 'proposal'
    | 'board'
    | 'roomId'
    | 'hostId'
    | 'version'
    | 'chat'
    | 'log'
    | 'spectators'
    | 'settings'
    | 'setupOrder'
    | 'developmentDeck'
    | 'testMode'
    | 'design'
    | 'map'
    | 'volcanoDecks'
    | 'diceDeck'
    | 'fog'
    | 'colorSwaps'
  >;
}
export interface GameState {
  /** See shared/engine/migrations.ts. Bump when the stored shape changes. */
  schemaVersion: number;
  roomId: string;
  version: number;
  board: Board;
  players: Player[];
  spectators: Spectator[];
  hostId: string;
  /** Lobby color swap requests waiting for an answer. */
  colorSwaps: ColorSwap[];
  phase: Phase;
  buildings: Record<string, Building>;
  roads: Record<string, string>;
  /** Edge id → owner. Only on sea maps. */
  ships: Record<string, string>;
  /** Robber hex id, or '' when it starts off the board (sea maps without a desert). */
  robber: string;
  /** Pirate hex id on sea maps, or null when it is not on the board. */
  pirate: string | null;
  /** The hex the robber or pirate just moved to, during the steal phase. */
  stealHex: string | null;
  bank: ResourceBag;
  setupOrder: string[];
  setupIndex: number;
  lastSettlement: string | null;
  turnIndex: number;
  turn: number;
  dice: [number, number] | null;
  pendingDiscards: Record<string, number>;
  /** Players choosing resources from gold fields, volcanoes, or split tiles, and how many each. */
  pendingGold: Record<string, number>;
  /** The part of each player's `pendingGold` that split tiles limit to their two resources. */
  pendingSplit: Record<string, SplitChoice[]>;
  /** When gold choices are made for whoever hasn't chosen. */
  goldDeadline: number | null;
  /** When the robber (or pirate) is placed for a player who hasn't moved it. */
  robberDeadline: number | null;
  /** Volcano hexes about to erupt (the eruption phase), or null. */
  eruption: string[] | null;
  /** Fog hex id → what it will turn out to be. Hidden, like the deck, until revealed. */
  fog: Record<string, { terrain: Terrain; number: number | null }>;
  /** Cartographers: fog tiles each player has peeked at (hidden; each sees only their own). */
  fogPeeks: Record<string, string[]>;
  /** Balanced volcano dice: faces left for each volcano. Hidden, like the deck. */
  volcanoDecks: Record<string, number[]>;
  /** Balanced dice: combinations not yet drawn, next first. Never sent to clients. */
  diceDeck: [number, number][];
  /** Total of the last roll (balanced dice make a repeat less likely). */
  lastRollTotal: number | null;
  /** Cartographers: edges in `roads` that hold relay stations, and in `ships` that hold survey ships. */
  relays: string[];
  surveys: string[];
  /** Ships built this turn (they may not move until next turn). */
  shipsBuilt: string[];
  shipMoved: boolean;
  /** Islands each player has settled, and the bonus points those islands gave. */
  islands: Record<string, number[]>;
  bonusPoints: Record<string, number>;
  /** Maps with routes: the route (index into board.rules.routes) each player's starting settlements chose. */
  routeOf: Record<string, number>;
  /** The most public points each player has had (piece rewards stay once earned). */
  peakPoints: Record<string, number>;
  /** The public count of each player's cards (engine/hands.ts). */
  handGuess: HandGuess;
  winnerId: string | null;
  log: GameLog[];
  settings: GameSettings;
  /** The chosen map's design (null for the standard island), kept so Play again can rebuild it. */
  design: BoardDesign | null;
  map: MapInfo | null;
  rollDeadline: number | null;
  diceCounts: Record<number, number>;
  tradeOffer: TradeOffer | null;
  /** Off-turn trades waiting for either player's turn (engine/trade.ts reproposeDeferred). */
  deferredTrades: DeferredTrade[];
  testMode: boolean;
  developmentDeck: DevelopmentCard[];
  developmentPlayed: boolean;
  freeRoads: number;
  /** Who is building in the special build phase, or null. */
  specialBuilder: string | null;
  /** Players waiting to build after this turn, in the order they asked. */
  specialQueue: string[];
  /** Who asked to build this turn (each player may ask once). */
  specialAsked: string[];
  resumePhase: 'roll' | 'build' | null;
  longestRoadId: string | null;
  largestArmyId: string | null;
  turnDeadline: number | null;
  turnExpired: boolean;
  pausedAt: number | null;
  /** 'idle' pauses start when nobody is connected and end when someone returns. */
  pauseReason: 'vote' | 'idle' | null;
  /** Last state change; bots act a short "thinking" delay after it. */
  updatedAt: number;
  finishedAt: number | null;
  stats: Record<string, PlayerStats>;
  proposal: Proposal | null;
  undo: UndoRecord | null;
  undoHistory: UndoRecord[];
  chat: ChatMessage[];
}
export interface PublicPlayer {
  id: string;
  name: string;
  color: PlayerColor;
  resourceCount: number;
  points: number;
  publicPoints: number;
  roadsLeft: number;
  shipsLeft: number;
  relaysLeft: number;
  surveysLeft: number;
  settlementsLeft: number;
  citiesLeft: number;
  developmentCount: number;
  knights: number;
  discoveries: number;
  bonusPoints: number;
  /** Maps with routes: this player's route (index into board.rules.routes), and whether they built in its finish. */
  route: number | null;
  routeDone: boolean;
  /** The most public points this player has had (what piece rewards count). */
  peakPoints: number;
  longestRoad: number;
  bot: BotLevel | null;
  stats: PlayerStats;
}
export interface LegalMoves {
  settlements: string[];
  roads: string[];
  ships: string[];
  cities: string[];
  /** Land hexes for the robber and, on sea maps, sea hexes for the pirate. */
  robberHexes: string[];
  stealTargets: string[];
  /**
   * Cartographers: edges for a relay station, ships that may become survey ships (and, for each,
   * the nearest of your settlements and cities along your route, several when tied), and tiles you
   * can chart or split now.
   */
  relays: string[];
  surveys: string[];
  surveyTowns: Record<string, string[]>;
  chartHexes: string[];
  splitHexes: string[];
  /** Fog tiles you may pay a lodestone to peek at. */
  peekHexes: string[];
  /** Ship edge → edges it may move to this turn. */
  shipMoves: Record<string, string[]>;
  /** Can buy a development card now (jungle discoveries count toward the cost). */
  development: boolean;
}
/** Which map a room plays. */
export interface MapInfo {
  id: string;
  name: string;
  /** The player counts of each of the map's layouts, fewest first. */
  layouts: { min: number; max: number }[];
  /** The layout the host chose, or null to play the one that fits the table. */
  layout: { min: number; max: number } | null;
}
/**
 * The public card count (engine/hands.ts): `likely` is what anyone watching could work out;
 * `seen` is the real hands at the last update, kept only to find what changed. Never sent.
 */
export interface HandGuess {
  seen: Record<string, ResourceBag>;
  likely: Record<string, ResourceBag>;
  /** The last log entry already counted (steals are found in the log). */
  logId: number;
}
export interface GameView {
  roomId: string;
  version: number;
  board: Board;
  players: PublicPlayer[];
  spectators: Spectator[];
  hostId: string;
  colorSwaps: ColorSwap[];
  phase: Phase;
  buildings: Record<string, Building>;
  roads: Record<string, string>;
  ships: Record<string, string>;
  relays: string[];
  surveys: string[];
  /** Cartographers rules are in play: lodestone, relay stations, survey ships, charts, and splits. */
  cartographers: boolean;
  /** Fog tiles you peeked at, and what each hides. Only ever your own (all of them once the game ends). */
  fogPeeks: Record<string, { terrain: Terrain; number: number | null }>;
  robber: string;
  pirate: string | null;
  /** Bots only (null for people): each player's likely cards, counted from public moves. */
  likelyHands: Record<string, ResourceBag> | null;
  bank: Record<Resource, boolean>;
  /** Whether the discovery supply has any left (like `bank`, without the count). */
  discoveryInSupply: boolean;
  /** Cards left of each resource, when the room shows them (settings.showBank). */
  bankCounts: ResourceBag | null;
  /** Discoveries left in the supply, on jungle maps where bank counts are shown. */
  discoveryBank: number | null;
  /** The map has a jungle, so discovery rules matter. */
  jungle: boolean;
  activePlayerId: string | null;
  /** Who places in each setup step, and the step now (public; see setupSequence). */
  setupOrder: string[];
  setupIndex: number;
  /** Whose turn it is; differs from activePlayerId during setup and the special build phase. */
  turnPlayerId: string | null;
  turn: number;
  dice: [number, number] | null;
  pendingDiscards: Record<string, number>;
  pendingGold: Record<string, number>;
  pendingSplit: Record<string, SplitChoice[]>;
  goldDeadline: number | null;
  robberDeadline: number | null;
  eruption: string[] | null;
  specialQueue: string[];
  specialAsked: string[];
  /** What the map has or may draw: sea (it needs Seafarers) and volcanoes. */
  features: { sea: boolean; volcano: boolean; fogLand: number };
  winnerId: string | null;
  log: GameLog[];
  selfId: string;
  role: 'player' | 'spectator';
  hand: ResourceBag;
  legal: LegalMoves;
  settings: GameSettings;
  rollDeadline: number | null;
  diceCounts: Record<number, number>;
  tradeOffer: TradeOffer | null;
  testMode: boolean;
  development: DevelopmentCard[];
  developmentRemaining: number;
  playableDevelopment: string[];
  tradeRates: Record<Resource, number>;
  longestRoadId: string | null;
  largestArmyId: string | null;
  turnDeadline: number | null;
  turnExpired: boolean;
  pausedAt: number | null;
  pauseReason: 'vote' | 'idle' | null;
  proposal: Proposal | null;
  /** The latest move its actor may ask to undo. `endsTurn` when that move was ending their turn. */
  undoAvailable: { actorId: string; description: string; endsTurn: boolean } | null;
  chat: ChatMessage[];
  map: MapInfo | null;
  /** True on maps with sea tiles: ships, the pirate, and island bonuses are in play. */
  seafaring: boolean;
}
export type GameAction =
  | { type: 'start' }
  | { type: 'configure'; settings: Partial<GameSettings> & Pick<GameSettings, 'autoRollSeconds' | 'trackDice'> }
  | { type: 'choose-color'; color: PlayerColor }
  | { type: 'ask-color-swap'; playerId: string }
  | { type: 'answer-color-swap'; playerId: string; accept: boolean }
  | { type: 'leave' }
  | { type: 'switch-role' }
  | { type: 'remove-player'; playerId: string }
  | { type: 'transfer-host'; playerId: string }
  | { type: 'add-bot'; level: BotLevel }
  | { type: 'set-bot-level'; playerId: string; level: BotLevel }
  | { type: 'play-again' }
  | { type: 'offer-trade'; give: TradeBag; want: TradeBag; to?: string[] }
  | { type: 'counter-trade'; offerId: string; give: TradeBag; want: TradeBag }
  | { type: 'accept-counter'; offerId: string; counterId: string }
  | { type: 'accept-trade'; offerId: string }
  /** The offering player trades with one of the recipients who accepted. */
  | { type: 'confirm-trade'; offerId: string; playerId: string }
  | { type: 'decline-trade'; offerId: string }
  | { type: 'cancel-trade'; offerId: string }
  | { type: 'place-settlement'; vertexId: string }
  | { type: 'place-road'; edgeId: string }
  | { type: 'place-ship'; edgeId: string }
  | { type: 'build-ship'; edgeId: string }
  | { type: 'move-ship'; from: string; to: string }
  | { type: 'choose-gold'; resources: ResourceBag }
  /** `layoutFor`: play the map's layout made for this many players, whatever the table's size. */
  | { type: 'choose-map'; mapId: string; layoutFor?: number }
  | { type: 'roll' }
  | { type: 'roll-volcanoes' }
  | { type: 'build-road'; edgeId: string }
  | { type: 'build-settlement'; vertexId: string }
  | { type: 'build-city'; vertexId: string }
  | { type: 'build-relay'; edgeId: string }
  /** Turn one of your ships into a survey ship; it charts the tiles around `vertexId`, the nearest town on its route. */
  | { type: 'build-survey'; edgeId: string; vertexId: string }
  /** Cartographers: pay a lodestone to see what a fog tile hides (only you see it). */
  | { type: 'peek-fog'; hexId: string }
  /** Cartographers: pay lodestone to step a tile's number toward 7. */
  | { type: 'chart-hex'; hexId: string }
  /** Cartographers: pay lodestone and one `resource` to make a tile pay that resource too. */
  | { type: 'split-hex'; hexId: string; resource: Resource }
  /** Bank or harbor trade: `count` times the rate of `give` for `count` of `receive`. */
  | { type: 'trade'; give: Resource; receive: Resource; count?: number }
  /** A bank trade mixing rates: see bankTradeSize in rules.ts. */
  | { type: 'bank-trade'; give: ResourceBag; receive: ResourceBag }
  | { type: 'end-turn' }
  /** Five or six players: during someone else's turn, ask to build when it ends. */
  | { type: 'request-special-build' }
  | { type: 'discard'; resources: TradeBag }
  | { type: 'move-robber'; hexId: string }
  | { type: 'steal'; playerId: string }
  /** `discoveries`: which of the card's resources jungle discoveries pay for (default: missing ones first). */
  | { type: 'buy-development'; discoveries?: ResourceBag }
  | { type: 'play-knight'; cardId: string }
  | { type: 'play-road-building'; cardId: string }
  | { type: 'play-monopoly'; cardId: string; resource: Tradable }
  | { type: 'play-plenty'; cardId: string; resources: TradeBag }
  | { type: 'finish-free-roads' }
  | { type: 'chat'; text: string }
  | { type: 'propose'; kind: Proposal['kind'] }
  | { type: 'vote'; proposalId: string; accept: boolean };
export interface Session {
  roomId: string;
  playerId: string;
  token: string;
}
export interface AccountSession {
  username: string;
  /** The username as typed when registering (capitals kept); `username` is the lowercase login key. */
  displayName?: string;
  token: string;
  expiresAt: number;
}
export interface AccountRoom {
  roomId: string;
  playerId: string;
}
/** "My rooms" entry with live status from the room. */
export interface AccountRoomStatus extends AccountRoom {
  phase: Phase;
  players: string[];
  yourTurn: boolean;
  winner: string | null;
}
/** Whether this player agreed to have games saved, and whether this game is (or will be) saved. */
export interface RecordingStatus {
  mine: boolean;
  on: boolean;
}
export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'view-as'; playerId: string }
  | { type: 'consent'; value: boolean }
  | { type: 'action'; id: string; version: number; action: GameAction };
export type ServerMessage =
  | { type: 'state'; state: GameView; online: string[]; recording?: RecordingStatus; acknowledgedId?: string }
  | { type: 'error'; message: string; id?: string };
