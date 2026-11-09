import type { BoardDesign } from './maps/types';
export const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'] as const;
export type Resource = (typeof RESOURCES)[number];
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
export type BaseTerrain = Resource | 'desert';
export type Terrain = BaseTerrain | SeaTerrain;
export interface Hex {
  id: string;
  q: number;
  r: number;
  x: number;
  y: number;
  terrain: Terrain;
  number: number | null;
  /** Corner vertices in order: lower right, bottom, lower left, upper left, top, upper right. */
  vertexIds: string[];
  /** Land tiles on sea maps: which island (connected land) the tile belongs to. */
  island?: number;
  /** Victory points for settling this tile's island for the first time (sea maps). */
  bonus?: number;
  /** No setup settlements may touch this tile's island. */
  noSetup?: boolean;
}
export interface Vertex {
  id: string;
  x: number;
  y: number;
  hexIds: string[];
  edgeIds: string[];
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
/** Public per-player totals, shown on the end-of-game screen. */
export interface PlayerStats {
  gained: number;
  stolen: number;
  lost: number;
  discarded: number;
  trades: number;
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
  | { kind: 'build'; playerId: string; piece: 'road' | 'ship' | 'settlement' | 'city' | 'development' }
  | { kind: 'bank-trade'; playerId: string; give: ResourceBag; get: ResourceBag }
  | { kind: 'player-trade'; fromId: string; toId: string; give: TradeBag; get: TradeBag }
  | { kind: 'offer'; playerId: string; give: TradeBag; want: TradeBag; to?: string[] }
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
  showBank: boolean;
  /** How jungle discoveries behave (only matters on maps with a jungle). */
  discoveries: DiscoveryRule;
  /** Volcanoes pay a resource of each owner's choice before erupting (the gold variant). */
  volcanoGold: boolean;
  /** Seafarers rules: ships and the pirate. On the standard island this adds a ring of sea. */
  seafarers: boolean;
  /** Setup settlements may touch a volcano. */
  volcanoStart: boolean;
  /** Eruption dice: plain random, or balanced (each volcano works through all six faces before repeating). */
  volcanoDice: 'random' | 'balanced';
  /** Which ships may move: the published rule (end of an open route) or any route end, even beside a settlement. */
  shipMoving: 'open' | 'ends';
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
    | 'fog'
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
  /** Players choosing resources from gold fields or volcanoes, and how many each. */
  pendingGold: Record<string, number>;
  /** When gold choices are made for whoever hasn't chosen. */
  goldDeadline: number | null;
  /** Volcano hexes about to erupt (the eruption phase), or null. */
  eruption: string[] | null;
  /** Fog hex id → what it will turn out to be. Hidden, like the deck, until revealed. */
  fog: Record<string, { terrain: Terrain; number: number | null }>;
  /** Balanced volcano dice: faces left for each volcano. Hidden, like the deck. */
  volcanoDecks: Record<string, number[]>;
  /** Ships built this turn (they may not move until next turn). */
  shipsBuilt: string[];
  shipMoved: boolean;
  /** Islands each player has settled, and the bonus points those islands gave. */
  islands: Record<string, number[]>;
  bonusPoints: Record<string, number>;
  winnerId: string | null;
  log: GameLog[];
  settings: GameSettings;
  /** The chosen map's design (null for the standard island), kept so Play again can rebuild it. */
  design: BoardDesign | null;
  map: MapInfo | null;
  rollDeadline: number | null;
  diceCounts: Record<number, number>;
  tradeOffer: TradeOffer | null;
  testMode: boolean;
  developmentDeck: DevelopmentCard[];
  developmentPlayed: boolean;
  freeRoads: number;
  /** Who is building in the special build phase, or null. */
  specialBuilder: string | null;
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
  settlementsLeft: number;
  citiesLeft: number;
  developmentCount: number;
  knights: number;
  discoveries: number;
  bonusPoints: number;
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
  /** Ship edge → edges it may move to this turn. */
  shipMoves: Record<string, string[]>;
  /** Can buy a development card now (jungle discoveries count toward the cost). */
  development: boolean;
}
/** Which map a room plays. */
export interface MapInfo {
  id: string;
  name: string;
  players: { min: number; max: number };
}
export interface GameView {
  roomId: string;
  version: number;
  board: Board;
  players: PublicPlayer[];
  spectators: Spectator[];
  hostId: string;
  phase: Phase;
  buildings: Record<string, Building>;
  roads: Record<string, string>;
  ships: Record<string, string>;
  robber: string;
  pirate: string | null;
  bank: Record<Resource, boolean>;
  /** Cards left of each resource, when the room shows them (settings.showBank). */
  bankCounts: ResourceBag | null;
  /** The map has a jungle, so discovery rules matter. */
  jungle: boolean;
  activePlayerId: string | null;
  /** Whose turn it is; differs from activePlayerId during setup and the special build phase. */
  turnPlayerId: string | null;
  turn: number;
  dice: [number, number] | null;
  pendingDiscards: Record<string, number>;
  pendingGold: Record<string, number>;
  goldDeadline: number | null;
  eruption: string[] | null;
  /** What the map has or may draw: sea (it needs Seafarers) and volcanoes. */
  features: { sea: boolean; volcano: boolean };
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
  | { type: 'choose-map'; mapId: string }
  | { type: 'roll' }
  | { type: 'roll-volcanoes' }
  | { type: 'build-road'; edgeId: string }
  | { type: 'build-settlement'; vertexId: string }
  | { type: 'build-city'; vertexId: string }
  /** Bank or harbor trade: `count` times the rate of `give` for `count` of `receive`. */
  | { type: 'trade'; give: Resource; receive: Resource; count?: number }
  | { type: 'end-turn' }
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
export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'view-as'; playerId: string }
  | { type: 'action'; id: string; version: number; action: GameAction };
export type ServerMessage =
  | { type: 'state'; state: GameView; online: string[]; acknowledgedId?: string }
  | { type: 'error'; message: string; id?: string };
