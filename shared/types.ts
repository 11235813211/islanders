export const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'] as const;
export type Resource = (typeof RESOURCES)[number];
export type ResourceBag = Record<Resource, number>;
export type Terrain = Resource | 'desert';
export interface Hex { id: string; q: number; r: number; x: number; y: number; terrain: Terrain; number: number | null; vertexIds: string[] }
export interface Vertex { id: string; x: number; y: number; hexIds: string[]; edgeIds: string[] }
export interface Edge { id: string; a: string; b: string }
export interface Harbor { id: string; edgeId: string; vertices: [string, string]; resource: Resource | 'any'; x: number; y: number }
export interface Board { hexes: Hex[]; vertices: Vertex[]; edges: Edge[]; harbors: Harbor[] }
export interface Building { playerId: string; kind: 'settlement' | 'city' }
export const DEVELOPMENT_TYPES = ['knight', 'road-building', 'year-of-plenty', 'monopoly', 'victory-point'] as const;
export type DevelopmentType = (typeof DEVELOPMENT_TYPES)[number];
export interface DevelopmentCard { id: string; kind: DevelopmentType; boughtTurn: number }
export interface Player { id: string; name: string; color: number; resources: ResourceBag; development: DevelopmentCard[]; knights: number }
export interface Spectator { id: string; name: string }
export type Phase = 'lobby' | 'setup-settlement' | 'setup-road' | 'roll' | 'discard' | 'robber' | 'steal' | 'free-roads' | 'build' | 'finished';
export interface GameLog { id: number; text: string }
export interface ChatMessage { id: string; senderId: string; name: string; text: string; at: number; spectator: boolean }
export interface GameSettings {
  autoRollSeconds: number; trackDice: boolean; numberLayout: 'random' | 'ordered';
  turnSeconds: number; friendlyRobber: boolean; discardLimit: number;
}
export interface TradeOffer { id: string; fromId: string; give: ResourceBag; want: ResourceBag; declinedBy: string[]; createdAt: number; expiresAt: number }
export interface Proposal { id: string; kind: 'undo' | 'pause' | 'resume'; fromId: string; required: string[]; accepted: string[]; expiresAt: number; description: string }
export interface UndoRecord { actorId: string; description: string; at: number; snapshot: Omit<GameState, 'undo' | 'proposal'> }
export interface GameState {
  roomId: string; version: number; board: Board; players: Player[]; spectators: Spectator[]; hostId: string;
  phase: Phase; buildings: Record<string, Building>; roads: Record<string, string>; robber: string;
  bank: ResourceBag; setupOrder: string[]; setupIndex: number; lastSettlement: string | null;
  turnIndex: number; turn: number; dice: [number, number] | null;
  pendingDiscards: Record<string, number>; winnerId: string | null; log: GameLog[];
  settings: GameSettings; rollDeadline: number | null; diceCounts: Record<number, number>;
  tradeOffer: TradeOffer | null; testMode: boolean;
  developmentDeck: DevelopmentCard[]; developmentPlayed: boolean; freeRoads: number;
  resumePhase: 'roll' | 'build' | null; longestRoadId: string | null; largestArmyId: string | null;
  turnDeadline: number | null; turnExpired: boolean; pausedAt: number | null;
  proposal: Proposal | null; undo: UndoRecord | null; chat: ChatMessage[];
}
export interface PublicPlayer { id: string; name: string; color: number; resourceCount: number; points: number; roadsLeft: number; settlementsLeft: number; citiesLeft: number; developmentCount: number; knights: number; longestRoad: number }
export interface LegalMoves { settlements: string[]; roads: string[]; cities: string[]; robberHexes: string[]; stealTargets: string[] }
export interface GameView {
  roomId: string; version: number; board: Board; players: PublicPlayer[]; spectators: Spectator[]; hostId: string;
  phase: Phase; buildings: Record<string, Building>; roads: Record<string, string>; robber: string;
  bank: Record<Resource, boolean>; activePlayerId: string | null; turn: number; dice: [number, number] | null;
  pendingDiscards: Record<string, number>; winnerId: string | null; log: GameLog[];
  selfId: string; role: 'player' | 'spectator'; hand: ResourceBag; legal: LegalMoves;
  settings: GameSettings; rollDeadline: number | null; diceCounts: Record<number, number>;
  tradeOffer: TradeOffer | null; testMode: boolean;
  development: DevelopmentCard[]; developmentRemaining: number; playableDevelopment: string[];
  tradeRates: Record<Resource, number>; longestRoadId: string | null; largestArmyId: string | null;
  turnDeadline: number | null; turnExpired: boolean; pausedAt: number | null;
  proposal: Proposal | null; undoAvailable: { actorId: string; description: string } | null; chat: ChatMessage[];
}
export type GameAction =
  | { type: 'start' }
  | { type: 'configure'; settings: Partial<GameSettings> & Pick<GameSettings, 'autoRollSeconds' | 'trackDice'> }
  | { type: 'offer-trade'; give: ResourceBag; want: ResourceBag }
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
export interface Session { roomId: string; playerId: string; token: string }
export interface AccountSession { username: string; token: string; expiresAt: number }
export interface AccountRoom { roomId: string; playerId: string }
export type ClientMessage = { type: 'auth'; token: string } | { type: 'view-as'; playerId: string } | { type: 'action'; id: string; version: number; action: GameAction };
export type ServerMessage = { type: 'state'; state: GameView; online: string[]; acknowledgedId?: string } | { type: 'error'; message: string; id?: string };
