export const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'] as const;
export type Resource = (typeof RESOURCES)[number];
export type ResourceBag = Record<Resource, number>;
export type Terrain = Resource | 'desert';
export interface Hex { id: string; q: number; r: number; x: number; y: number; terrain: Terrain; number: number | null; vertexIds: string[] }
export interface Vertex { id: string; x: number; y: number; hexIds: string[]; edgeIds: string[] }
export interface Edge { id: string; a: string; b: string }
export interface Board { hexes: Hex[]; vertices: Vertex[]; edges: Edge[] }
export interface Building { playerId: string; kind: 'settlement' | 'city' }
export interface Player { id: string; name: string; color: number; resources: ResourceBag }
export type Phase = 'lobby' | 'setup-settlement' | 'setup-road' | 'roll' | 'discard' | 'robber' | 'steal' | 'build' | 'finished';
export interface GameLog { id: number; text: string }
export interface GameSettings { autoRollSeconds: number; trackDice: boolean }
export interface TradeOffer { id: string; fromId: string; give: ResourceBag; want: ResourceBag; declinedBy: string[] }
export interface GameState {
  roomId: string; version: number; board: Board; players: Player[]; hostId: string;
  phase: Phase; buildings: Record<string, Building>; roads: Record<string, string>; robber: string;
  bank: ResourceBag; setupOrder: string[]; setupIndex: number; lastSettlement: string | null;
  turnIndex: number; turn: number; dice: [number, number] | null;
  pendingDiscards: Record<string, number>; winnerId: string | null; log: GameLog[];
  settings: GameSettings; rollDeadline: number | null; diceCounts: Record<number, number>;
  tradeOffer: TradeOffer | null; testMode: boolean;
}
export interface PublicPlayer { id: string; name: string; color: number; resourceCount: number; points: number; roadsLeft: number; settlementsLeft: number; citiesLeft: number }
export interface LegalMoves { settlements: string[]; roads: string[]; cities: string[]; robberHexes: string[]; stealTargets: string[] }
export interface GameView {
  roomId: string; version: number; board: Board; players: PublicPlayer[]; hostId: string;
  phase: Phase; buildings: Record<string, Building>; roads: Record<string, string>; robber: string;
  bank: Record<Resource, boolean>; activePlayerId: string | null; turn: number; dice: [number, number] | null;
  pendingDiscards: Record<string, number>; winnerId: string | null; log: GameLog[];
  selfId: string; hand: ResourceBag; legal: LegalMoves;
  settings: GameSettings; rollDeadline: number | null; diceCounts: Record<number, number>;
  tradeOffer: TradeOffer | null; testMode: boolean;
}
export type GameAction =
  | { type: 'start' }
  | { type: 'configure'; settings: GameSettings }
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
  | { type: 'steal'; playerId: string };
export interface Session { roomId: string; playerId: string; token: string }
export interface AccountSession { username: string; token: string; expiresAt: number }
export interface AccountRoom { roomId: string; playerId: string }
export type ClientMessage = { type: 'auth'; token: string } | { type: 'view-as'; playerId: string } | { type: 'action'; id: string; version: number; action: GameAction };
export type ServerMessage = { type: 'state'; state: GameView; online: string[]; acknowledgedId?: string } | { type: 'error'; message: string; id?: string };
