import {
  type GameAction,
  type GameEvent,
  type GameState,
  type Player,
  type PlayerStats,
  RESOURCES,
  type ResourceBag,
} from '../types';

/** Thrown for any rejected command. The message is shown to the player. */
export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameError';
  }
}

export function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new GameError(message);
}

export const emptyBag = (): ResourceBag => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
export const resourceCount = (bag: ResourceBag): number => RESOURCES.reduce((sum, resource) => sum + bag[resource], 0);
export const emptyStats = (): PlayerStats => ({ gained: 0, stolen: 0, lost: 0, discarded: 0, trades: 0 });
export const emptyDiceCounts = (): Record<number, number> =>
  Object.fromEntries(Array.from({ length: 11 }, (_, index) => [index + 2, 0]));

export const AUTO_ROLL_SECONDS = [0, 5, 10, 15, 30];
export const MAX_PLAYERS = 4;
export const TRADE_OFFER_MS = 30_000;
export const BUILD_COSTS: Record<'road' | 'settlement' | 'city' | 'development', ResourceBag> = {
  road: { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 0 },
  city: { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 3 },
  development: { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1 },
};
export const PIECE_LIMITS = { roads: 15, settlements: 5, cities: 4 } as const;

/** Append a log line (capped at 60), optionally with a structured event. */
export function addLog(state: GameState, text: string, event?: GameEvent): void {
  state.log.push({ id: (state.log.at(-1)?.id ?? 0) + 1, text, turn: state.turn, ...(event ? { event } : {}) });
  if (state.log.length > 60) state.log = state.log.slice(-60);
}

export function bumpStat(state: GameState, playerId: string, key: keyof PlayerStats, amount = 1): void {
  state.stats[playerId] ??= emptyStats();
  state.stats[playerId][key] += amount;
}

export function getActivePlayerId(state: GameState): string | null {
  if (state.phase === 'lobby' || state.phase === 'finished') return null;
  if (state.phase === 'setup-settlement' || state.phase === 'setup-road')
    return state.setupOrder[state.setupIndex] ?? null;
  return state.players[state.turnIndex]?.id ?? null;
}

/** True when the latest undoable move was its actor ending their turn. */
export function undoEndsTurn(state: GameState): boolean {
  const snapshot = state.undo?.snapshot;
  return !!snapshot && snapshot.phase === 'build' && snapshot.turn !== state.turn;
}

export const isHuman = (player: Player): boolean => !player.bot;
export const humanPlayers = (state: GameState): Player[] => state.players.filter(isHuman);

export function canAfford(player: Player, cost: ResourceBag): boolean {
  return RESOURCES.every(resource => player.resources[resource] >= cost[resource]);
}

export function pay(state: GameState, player: Player, cost: ResourceBag): void {
  requireRule(canAfford(player, cost), 'You do not have enough resources.');
  for (const resource of RESOURCES) {
    player.resources[resource] -= cost[resource];
    state.bank[resource] += cost[resource];
  }
}

export function pieceCounts(state: GameState, playerId: string) {
  const buildings = Object.values(state.buildings).filter(building => building.playerId === playerId);
  const settlements = buildings.filter(building => building.kind === 'settlement').length;
  const cities = buildings.filter(building => building.kind === 'city').length;
  const roads = Object.values(state.roads).filter(owner => owner === playerId).length;
  return { settlements, cities, roads, points: settlements + cities * 2 };
}

/** Context passed to every action handler. `next` is a private clone the handler mutates. */
export interface ActionContext {
  state: GameState;
  next: GameState;
  playerId: string;
  player: Player;
  now: number;
  random: () => number;
}

/** One handler per action type, split across the engine modules and merged in apply.ts. */
export type Handlers = {
  [K in GameAction['type']]: (ctx: ActionContext, action: Extract<GameAction, { type: K }>) => void;
};

export function needPhase(next: GameState, ...phases: GameState['phase'][]): void {
  requireRule(phases.includes(next.phase), 'That action is not available right now.');
}
