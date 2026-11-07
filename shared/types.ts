export const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'] as const;
export type Resource = (typeof RESOURCES)[number];
export type ResourceBag = Record<Resource, number>;
export type Terrain = Resource | 'desert';
export interface Hex {
  id: string;
  q: number;
  r: number;
  x: number;
  y: number;
  terrain: Terrain;
  number: number | null;
  vertexIds: string[];
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
  | 'free-roads'
  | 'build'
  | 'finished';
/**
 * Structured record of what a log line describes, for bots, stats, and UI.
 * `steal.resource` is only visible to the two players involved (see getView).
 */
export type GameEvent =
  | { kind: 'roll'; playerId: string; dice: [number, number]; gains: Record<string, ResourceBag> }
  | { kind: 'build'; playerId: string; piece: 'road' | 'settlement' | 'city' | 'development' }
  | { kind: 'bank-trade'; playerId: string; give: ResourceBag; get: ResourceBag }
  | { kind: 'player-trade'; fromId: string; toId: string; give: ResourceBag; get: ResourceBag }
  | { kind: 'offer'; playerId: string }
  | { kind: 'discard'; playerId: string; resources: ResourceBag }
  | { kind: 'steal'; thiefId: string; victimId: string; resource: Resource | null }
  | { kind: 'development'; playerId: string; card: DevelopmentType; gains: ResourceBag | null }
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
export interface GameSettings {
  autoRollSeconds: number;
  trackDice: boolean;
  numberLayout: 'random' | 'ordered';
  turnSeconds: number;
  friendlyRobber: boolean;
  discardLimit: number;
  victoryPoints: number;
}
/** A recipient's alternative terms. `give` is what the countering player gives. */
export interface TradeCounter {
  id: string;
  fromId: string;
  give: ResourceBag;
  want: ResourceBag;
}
export interface TradeOffer {
  id: string;
  fromId: string;
  give: ResourceBag;
  want: ResourceBag;
  /** Players the offer was sent to. */
  to: string[];
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
  robber: string;
  bank: ResourceBag;
  setupOrder: string[];
  setupIndex: number;
  lastSettlement: string | null;
  turnIndex: number;
  turn: number;
  dice: [number, number] | null;
  pendingDiscards: Record<string, number>;
  winnerId: string | null;
  log: GameLog[];
  settings: GameSettings;
  rollDeadline: number | null;
  diceCounts: Record<number, number>;
  tradeOffer: TradeOffer | null;
  testMode: boolean;
  developmentDeck: DevelopmentCard[];
  developmentPlayed: boolean;
  freeRoads: number;
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
  settlementsLeft: number;
  citiesLeft: number;
  developmentCount: number;
  knights: number;
  longestRoad: number;
  bot: BotLevel | null;
  stats: PlayerStats;
}
export interface LegalMoves {
  settlements: string[];
  roads: string[];
  cities: string[];
  robberHexes: string[];
  stealTargets: string[];
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
  robber: string;
  bank: Record<Resource, boolean>;
  activePlayerId: string | null;
  turn: number;
  dice: [number, number] | null;
  pendingDiscards: Record<string, number>;
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
  undoAvailable: { actorId: string; description: string } | null;
  chat: ChatMessage[];
}
export type GameAction =
  | { type: 'start' }
  | { type: 'configure'; settings: Partial<GameSettings> & Pick<GameSettings, 'autoRollSeconds' | 'trackDice'> }
  | { type: 'choose-color'; color: PlayerColor }
  | { type: 'leave' }
  | { type: 'remove-player'; playerId: string }
  | { type: 'transfer-host'; playerId: string }
  | { type: 'add-bot'; level: BotLevel }
  | { type: 'set-bot-level'; playerId: string; level: BotLevel }
  | { type: 'play-again' }
  | { type: 'offer-trade'; give: ResourceBag; want: ResourceBag; to?: string[] }
  | { type: 'counter-trade'; offerId: string; give: ResourceBag; want: ResourceBag }
  | { type: 'accept-counter'; offerId: string; counterId: string }
  | { type: 'accept-trade'; offerId: string }
  | { type: 'decline-trade'; offerId: string }
  | { type: 'cancel-trade'; offerId: string }
  | { type: 'place-settlement'; vertexId: string }
  | { type: 'place-road'; edgeId: string }
  | { type: 'roll' }
  | { type: 'build-road'; edgeId: string }
  | { type: 'build-settlement'; vertexId: string }
  | { type: 'build-city'; vertexId: string }
  | { type: 'trade'; give: Resource; receive: Resource }
  | { type: 'end-turn' }
  | { type: 'discard'; resources: ResourceBag }
  | { type: 'move-robber'; hexId: string }
  | { type: 'steal'; playerId: string }
  | { type: 'buy-development' }
  | { type: 'play-knight'; cardId: string }
  | { type: 'play-road-building'; cardId: string }
  | { type: 'play-monopoly'; cardId: string; resource: Resource }
  | { type: 'play-plenty'; cardId: string; resources: ResourceBag }
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
