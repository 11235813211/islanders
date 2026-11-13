import { copyData } from '../copy';
import { type BoardDesign, boardExpansions } from '../maps/types';
import { boardIndex } from '../seafaring';
import { DISCOVERY_RULES } from '../settings';
import {
  type GameAction,
  type GameEvent,
  type GameState,
  type Player,
  type PlayerStats,
  RESOURCES,
  type ResourceBag,
  type Tradable,
  type TradeBag,
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

export const emptyBag = (): ResourceBag => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, lodestone: 0 });
export const resourceCount = (bag: ResourceBag): number => RESOURCES.reduce((sum, resource) => sum + bag[resource], 0);
/** Cards plus discoveries in a trade or discard bag. */
export const bagCount = (bag: TradeBag): number => resourceCount(bag) + (bag.discovery ?? 0);
/** What this room lets jungle discoveries do (see DISCOVERY_RULES). */
export const discoveryRule = (state: GameState) => DISCOVERY_RULES[state.settings.discoveries ?? 'kept'];
/** Cards that count toward the discard limit on a 7. */
export const handSize = (state: GameState, player: Player): number =>
  resourceCount(player.resources) + (discoveryRule(state).inHand ? player.discoveries : 0);
/** How many of `item` a player holds. */
export const holding = (player: Player, item: Tradable): number =>
  item === 'discovery' ? player.discoveries : player.resources[item];
/** Add (or with a negative sign, remove) a bag to a player's hand. */
export function addBag(player: Player, bag: TradeBag, sign: 1 | -1 = 1): void {
  for (const r of RESOURCES) player.resources[r] += sign * bag[r];
  player.discoveries += sign * (bag.discovery ?? 0);
}
export const emptyStats = (): PlayerStats => ({
  cardsIn: {},
  cardsOut: {},
  produced: {},
  rolls: {},
  built: {},
  played: {},
  blocked: 0,
  robberMoves: 0,
  trades: 0,
  bankTrades: 0,
  erupted: 0,
});
export const emptyDiceCounts = (): Record<number, number> =>
  Object.fromEntries(Array.from({ length: 11 }, (_, index) => [index + 2, 0]));

export const MAX_PLAYERS = 6;
/** Seconds everyone has to pick gold or volcano resources before a choice is made for them. */
export const GOLD_SECONDS = 25;
/** Seconds to place the robber or pirate before it is placed for you. */
export const ROBBER_SECONDS = 15;
/** Ships and the pirate are in play: the map has sea and the room plays Seafarers. */
export const seaRules = (state: Pick<GameState, 'board' | 'settings'>): boolean =>
  state.settings.seafarers !== false && boardIndex(state.board).seafaring;
/** Seconds everyone has to chart after a 7 before the rest pass. */
export const CHART_SECONDS = 30;
/** Cartographers rules (lodestone, relay stations, survey ships, charting): the map asks for them. */
export const cartographersRules = (state: Pick<GameState, 'design'>): boolean =>
  !!state.design && boardExpansions(state.design).includes('cartographers');
/** Five and six players get the larger island, a bigger bank and deck, and a special build phase. */
export const isLargeGame = (players: number): boolean => players >= 5;
/** Seconds each player gets in the special build phase (or the turn limit, if shorter). */
export const SPECIAL_BUILD_SECONDS = 20;

/** Resource cards of each kind in the bank: 19, or 24 with five or six players. Lodestone only on Cartographers maps. */
export function bankFor(players: number, cartographers = false): ResourceBag {
  const n = isLargeGame(players) ? 24 : 19;
  return { wood: n, brick: n, sheep: n, wheat: n, ore: n, lodestone: cartographers ? n : 0 };
}
/**
 * Jungle discoveries in the supply at the start: 12, grown for 5–6 players by the same share as the
 * resource bank (19 → 24), so 15.
 */
export function discoverySupply(players: number): number {
  return isLargeGame(players) ? 15 : 12;
}
/** Discoveries still in the supply: the total less what players hold (spent ones come back). */
export function discoveriesLeft(state: Pick<GameState, 'players'>): number {
  return Math.max(0, discoverySupply(state.players.length) - state.players.reduce((n, p) => n + p.discoveries, 0));
}
export const BUILD_COSTS: Record<
  'road' | 'ship' | 'settlement' | 'city' | 'development' | 'relay' | 'survey',
  ResourceBag
> = {
  road: { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0, lodestone: 0 },
  ship: { wood: 1, brick: 0, sheep: 1, wheat: 0, ore: 0, lodestone: 0 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 0, lodestone: 0 },
  city: { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 3, lodestone: 0 },
  development: { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1, lodestone: 0 },
  relay: { wood: 1, brick: 0, sheep: 1, wheat: 0, ore: 0, lodestone: 2 },
  survey: { wood: 0, brick: 0, sheep: 0, wheat: 1, ore: 0, lodestone: 2 },
};
export const PIECE_LIMITS = { roads: 15, ships: 15, settlements: 5, cities: 4, relays: 4, surveys: 4 } as const;

/**
 * Copy a state for the next move. The board is shared, not copied: it changes only on rare moves
 * (fog, icebergs, lobby redraws), which call ownBoard first. Log, chat, and undo entries are never
 * changed once written, so only their lists are copied. Copying the board on every move was most
 * of the engine's CPU time.
 */
export function cloneState(state: GameState): GameState {
  const { board, log, chat, undoHistory, ...rest } = state;
  return { ...copyData(rest), board, log: [...log], chat: [...chat], undoHistory: [...undoHistory] };
}

/** Give `next` its own copy of the board before changing it in place (see cloneState). */
export function ownBoard(next: GameState): void {
  next.board = copyData(next.board);
}

/** Append a log line (capped at 60), optionally with a structured event. */
export function addLog(state: GameState, text: string, event?: GameEvent): void {
  state.log.push({ id: (state.log.at(-1)?.id ?? 0) + 1, text, turn: state.turn, ...(event ? { event } : {}) });
  if (state.log.length > 60) state.log = state.log.slice(-60);
}

type FlatStat = { [K in keyof PlayerStats]: PlayerStats[K] extends number ? K : never }[keyof PlayerStats];
type GroupStat = Exclude<keyof PlayerStats, FlatStat>;

/** Add to one of a player's single-number stats. */
export function bumpStat(state: GameState, playerId: string, key: FlatStat, amount = 1): void {
  state.stats[playerId] ??= emptyStats();
  state.stats[playerId][key] += amount;
}

/** Add to one entry of a player's grouped stats (cards in by source, rolls by total, …). */
export function tally<G extends GroupStat>(
  state: GameState,
  playerId: string,
  group: G,
  key: keyof PlayerStats[G] & (string | number),
  amount = 1,
): void {
  if (!amount) return;
  state.stats[playerId] ??= emptyStats();
  const counts = state.stats[playerId][group] as Record<string | number, number>;
  counts[key] = (counts[key] ?? 0) + amount;
}

export function getActivePlayerId(state: GameState): string | null {
  if (state.phase === 'lobby' || state.phase === 'finished') return null;
  if (state.phase === 'setup-settlement' || state.phase === 'setup-road')
    return state.setupOrder[state.setupIndex] ?? null;
  if (state.phase === 'special-build') return state.specialBuilder;
  return state.players[state.turnIndex]?.id ?? null;
}

/** True when the latest undoable move was its actor ending their turn. */
export function undoEndsTurn(state: GameState): boolean {
  const snapshot = state.undo?.snapshot;
  return (
    !!snapshot &&
    (snapshot.phase === 'build' || snapshot.phase === 'special-build') &&
    (snapshot.turn !== state.turn || snapshot.specialBuilder !== state.specialBuilder)
  );
}

export const isHuman = (player: Player): boolean => !player.bot;
export const humanPlayers = (state: GameState): Player[] => state.players.filter(isHuman);

export function canAfford(player: Player, cost: TradeBag): boolean {
  return (
    RESOURCES.every(resource => player.resources[resource] >= cost[resource]) &&
    player.discoveries >= (cost.discovery ?? 0)
  );
}

/** Pay a build cost into the bank. */
export function pay(state: GameState, player: Player, cost: ResourceBag): void {
  requireRule(canAfford(player, cost), 'You do not have enough resources.');
  tally(state, player.id, 'cardsOut', 'build', resourceCount(cost));
  for (const resource of RESOURCES) {
    player.resources[resource] -= cost[resource];
    state.bank[resource] += cost[resource];
  }
}

export function pieceCounts(
  state: Pick<GameState, 'buildings' | 'roads' | 'ships' | 'relays' | 'surveys'>,
  playerId: string,
) {
  const buildings = Object.values(state.buildings).filter(building => building.playerId === playerId);
  const settlements = buildings.filter(building => building.kind === 'settlement').length;
  const cities = buildings.filter(building => building.kind === 'city').length;
  // Relay stations stand on road edges and survey ships were ships; neither uses up a road or ship.
  const relays = (state.relays ?? []).filter(id => state.roads[id] === playerId).length;
  const surveys = (state.surveys ?? []).filter(id => state.ships[id] === playerId).length;
  const roads = Object.values(state.roads).filter(owner => owner === playerId).length - relays;
  const ships = Object.values(state.ships).filter(owner => owner === playerId).length - surveys;
  return { settlements, cities, roads, ships, relays, surveys, points: settlements + cities * 2 + surveys };
}

/** Context passed to every action handler. `next` is a private clone the handler mutates. */
export interface ActionContext {
  state: GameState;
  next: GameState;
  playerId: string;
  player: Player;
  now: number;
  random: () => number;
  /** The design for a `choose-map` action, looked up by the server. */
  design?: BoardDesign;
}

/** One handler per action type, split across the engine modules and merged in apply.ts. */
export type Handlers = {
  [K in GameAction['type']]: (ctx: ActionContext, action: Extract<GameAction, { type: K }>) => void;
};

export function needPhase(next: GameState, ...phases: GameState['phase'][]): void {
  requireRule(phases.includes(next.phase), 'That action is not available right now.');
}
