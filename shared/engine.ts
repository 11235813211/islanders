import { assignNumbers, generateHarbors, generateBoard } from './board';
import { RESOURCES, type GameAction, type GameState, type GameView, type LegalMoves, type Player, type Resource, type ResourceBag } from './types';

import { developmentDeck, longestRoad, tradeRates, updateAwards, victoryPoints } from './rules';
import { DEFAULT_SETTINGS, validSettings } from './settings';
export { DEFAULT_SETTINGS } from './settings';

export class GameError extends Error {
  constructor(message: string) { super(message); this.name = 'GameError'; }
}

export const emptyBag = (): ResourceBag => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
export const resourceCount = (bag: ResourceBag): number => RESOURCES.reduce((sum, resource) => sum + bag[resource], 0);
const AUTO_ROLL_SECONDS = [0, 5, 10, 15, 30];
const emptyDiceCounts = (): Record<number, number> => Object.fromEntries(Array.from({ length: 11 }, (_, index) => [index + 2, 0]));
export const BUILD_COSTS: Record<'road' | 'settlement' | 'city', ResourceBag> = {
  road: { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 0 },
  city: { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 3 },
};

function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new GameError(message);
}

function addLog(state: GameState, text: string): void {
  state.log.push({ id: (state.log.at(-1)?.id ?? 0) + 1, text });
  if (state.log.length > 60) state.log = state.log.slice(-60);
}

export function createGame(roomId: string, random: () => number = Math.random, options: { testMode?: boolean } = {}): GameState {
  const board = generateBoard(random);
  return {
    roomId, version: 0, board, players: [], spectators: [], hostId: '', phase: 'lobby', buildings: {}, roads: {},
    robber: board.hexes.find(hex => hex.terrain === 'desert')!.id,
    bank: { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 },
    setupOrder: [], setupIndex: 0, lastSettlement: null, turnIndex: 0, turn: 0, dice: null,
    pendingDiscards: {}, winnerId: null, log: [],
    settings: { ...DEFAULT_SETTINGS }, rollDeadline: null, diceCounts: emptyDiceCounts(),
    tradeOffer: null, testMode: options.testMode === true,
    developmentDeck: developmentDeck(random), developmentPlayed: false, freeRoads: 0, resumePhase: null,
    longestRoadId: null, largestArmyId: null, turnDeadline: null, turnExpired: false, pausedAt: null, proposal: null, undo: null, chat: [],
  };
}

/** Add fields introduced after the original durable snapshot schema, without mutating it. */
export function normalizeGame(state: GameState, now = Date.now(), random: () => number = Math.random): GameState {
  const next = structuredClone(state);
  next.settings = { ...DEFAULT_SETTINGS, ...next.settings,
    autoRollSeconds: AUTO_ROLL_SECONDS.includes(next.settings?.autoRollSeconds) ? next.settings.autoRollSeconds : DEFAULT_SETTINGS.autoRollSeconds,
    trackDice: typeof next.settings?.trackDice === 'boolean' ? next.settings.trackDice : DEFAULT_SETTINGS.trackDice,
  };
  next.diceCounts = Object.fromEntries(Object.keys(emptyDiceCounts()).map(total => {
    const count = next.diceCounts?.[Number(total)];
    return [total, Number.isSafeInteger(count) && count >= 0 ? count : 0];
  }));
  next.tradeOffer ??= null;
  if (next.tradeOffer) { next.tradeOffer.createdAt ??= now; next.tradeOffer.expiresAt ??= now + 30_000; }
  next.board.harbors ??= generateHarbors(next.board);
  next.spectators ??= []; next.chat ??= [];
  for (const p of next.players) { p.development ??= []; p.knights ??= 0; }
  next.developmentDeck ??= developmentDeck(random);
  next.developmentPlayed ??= false; next.freeRoads ??= 0; next.resumePhase ??= null;
  next.longestRoadId ??= null; next.largestArmyId ??= null; next.turnExpired ??= false;
  next.pausedAt ??= null; next.proposal ??= null; next.undo ??= null;
  next.turnDeadline ??= ['lobby', 'finished'].includes(next.phase) ? null : now + next.settings.turnSeconds * 1000;
  updateAwards(next);
  next.testMode = next.testMode === true;
  if (next.phase !== 'roll' || !next.settings.autoRollSeconds) next.rollDeadline = null;
  else if (!Number.isFinite(next.rollDeadline) || next.rollDeadline === undefined) next.rollDeadline = now + next.settings.autoRollSeconds * 1000;
  return next;
}

export function addPlayer(state: GameState, input: { id: string; name: string }): GameState {
  requireRule(state.phase === 'lobby', 'This game has already started.');
  requireRule(state.players.length < 4, 'This island already has four players.');
  requireRule(typeof input?.id === 'string' && /^[\w-]{1,128}$/.test(input.id)
    && !['__proto__', 'constructor', 'prototype'].includes(input.id), 'Invalid player identity.');
  requireRule(!state.players.some(player => player.id === input.id), 'This player has already joined.');
  requireRule(typeof input.name === 'string', 'Enter a player name.');
  const name = input.name.trim();
  requireRule(name.length >= 1 && name.length <= 24 && !/[\u0000-\u001f\u007f]/.test(name), 'Use a name between 1 and 24 characters.');
  const next = structuredClone(state);
  next.players.push({ id: input.id, name, color: next.players.length, resources: emptyBag(), development: [], knights: 0 });
  if (!next.hostId) next.hostId = input.id;
  next.version++;
  addLog(next, `${name} arrived on the island.`);
  return next;
}

export function getActivePlayerId(state: GameState): string | null {
  if (state.phase === 'lobby' || state.phase === 'finished') return null;
  if (state.phase === 'setup-settlement' || state.phase === 'setup-road') return state.setupOrder[state.setupIndex] ?? null;
  return state.players[state.turnIndex]?.id ?? null;
}

function canAfford(player: Player, cost: ResourceBag): boolean {
  return RESOURCES.every(resource => player.resources[resource] >= cost[resource]);
}

function pieceCounts(state: GameState, playerId: string) {
  const buildings = Object.values(state.buildings).filter(building => building.playerId === playerId);
  const settlements = buildings.filter(building => building.kind === 'settlement').length;
  const cities = buildings.filter(building => building.kind === 'city').length;
  const roads = Object.values(state.roads).filter(owner => owner === playerId).length;
  return { settlements, cities, roads, points: settlements + cities * 2 };
}

function settlementSites(state: GameState, playerId: string, setup: boolean): string[] {
  return state.board.vertices.filter(vertex => {
    if (state.buildings[vertex.id]) return false;
    const incident = state.board.edges.filter(edge => edge.a === vertex.id || edge.b === vertex.id);
    if (incident.some(edge => state.buildings[edge.a === vertex.id ? edge.b : edge.a])) return false;
    return setup || incident.some(edge => state.roads[edge.id] === playerId);
  }).map(vertex => vertex.id);
}

function roadSites(state: GameState, playerId: string, setup: boolean): string[] {
  return state.board.edges.filter(edge => {
    if (state.roads[edge.id]) return false;
    if (setup) return edge.a === state.lastSettlement || edge.b === state.lastSettlement;
    return [edge.a, edge.b].some(vertexId => {
      const building = state.buildings[vertexId];
      if (building) return building.playerId === playerId;
      return state.board.vertices.find(vertex => vertex.id === vertexId)!.edgeIds
        .some(edgeId => state.roads[edgeId] === playerId);
    });
  }).map(edge => edge.id);
}

function stealTargets(state: GameState, playerId: string): string[] {
  const hex = state.board.hexes.find(candidate => candidate.id === state.robber)!;
  return state.players.filter(player => player.id !== playerId && resourceCount(player.resources) > 0
    && hex.vertexIds.some(vertexId => state.buildings[vertexId]?.playerId === player.id))
    .map(player => player.id);
}

function legalMoves(state: GameState, selfId: string): LegalMoves {
  const legal: LegalMoves = { settlements: [], roads: [], cities: [], robberHexes: [], stealTargets: [] };
  const player = state.players.find(candidate => candidate.id === selfId);
  if (!player || getActivePlayerId(state) !== selfId || state.pausedAt !== null) return legal;
  const pieces = pieceCounts(state, selfId);
  if (state.phase === 'setup-settlement') legal.settlements = settlementSites(state, selfId, true);
  if (state.phase === 'setup-road') legal.roads = roadSites(state, selfId, true);
  if (state.phase === 'robber') legal.robberHexes = state.board.hexes.filter(hex => hex.id !== state.robber && (!state.settings.friendlyRobber || !hex.vertexIds.some(id => { const b = state.buildings[id]; return b && b.playerId !== selfId && victoryPoints(state, b.playerId, false) <= 2; }))).map(hex => hex.id);
  if (state.phase === 'steal') legal.stealTargets = stealTargets(state, selfId);
  if (state.phase === 'free-roads' && pieces.roads < 15) legal.roads = roadSites(state, selfId, false);
  if (state.phase === 'build') {
    if (pieces.settlements < 5 && canAfford(player, BUILD_COSTS.settlement)) legal.settlements = settlementSites(state, selfId, false);
    if (pieces.roads < 15 && canAfford(player, BUILD_COSTS.road)) legal.roads = roadSites(state, selfId, false);
    if (pieces.cities < 4 && canAfford(player, BUILD_COSTS.city)) {
      legal.cities = Object.entries(state.buildings)
        .filter(([, building]) => building.playerId === selfId && building.kind === 'settlement')
        .map(([vertexId]) => vertexId);
    }
  }
  return legal;
}

/** Explicit projection prevents internal state and opponents' hands reaching clients. */
export function getView(state: GameState, selfId: string): GameView {
  const player = state.players.find(candidate => candidate.id === selfId);
  requireRule(player || state.spectators.some(p => p.id === selfId), 'You are not a member of this room.');
  return structuredClone({
    roomId: state.roomId, version: state.version, board: state.board, hostId: state.hostId,
    players: state.players.map(candidate => {
      const pieces = pieceCounts(state, candidate.id);
      return { id: candidate.id, name: candidate.name, color: candidate.color,
        resourceCount: resourceCount(candidate.resources), points: victoryPoints(state, candidate.id, candidate.id === selfId || state.phase === 'finished'),
        developmentCount: candidate.development.length, knights: candidate.knights, longestRoad: longestRoad(state, candidate.id),
        roadsLeft: 15 - pieces.roads, settlementsLeft: 5 - pieces.settlements, citiesLeft: 4 - pieces.cities };
    }),
    phase: state.phase, buildings: state.buildings, roads: state.roads, robber: state.robber,
    // Exact bank counts reveal an opponent's hand by subtraction in a two-player
    // game. Clients only need to know whether a bank trade can receive a card.
    bank: Object.fromEntries(RESOURCES.map(resource => [resource, state.bank[resource] > 0])) as Record<Resource, boolean>,
    activePlayerId: getActivePlayerId(state), turn: state.turn, dice: state.dice,
    pendingDiscards: state.pendingDiscards, winnerId: state.winnerId, log: state.log,
    selfId, role: player ? 'player' : 'spectator', hand: player?.resources ?? emptyBag(), legal: legalMoves(state, selfId),
    spectators: state.spectators, development: player?.development ?? [], developmentRemaining: state.developmentDeck.length,
    playableDevelopment: state.pausedAt === null && !state.developmentPlayed && getActivePlayerId(state) === selfId && ['roll', 'build'].includes(state.phase)
      ? (player?.development ?? []).filter(c => c.kind !== 'victory-point' && c.boughtTurn < state.turn).map(c => c.id) : [],
    tradeRates: tradeRates(state, selfId), longestRoadId: state.longestRoadId, largestArmyId: state.largestArmyId,
    turnDeadline: state.turnDeadline, turnExpired: state.turnExpired, pausedAt: state.pausedAt, proposal: state.proposal,
    undoAvailable: state.undo ? { actorId: state.undo.actorId, description: state.undo.description } : null, chat: state.chat,
    settings: state.settings, rollDeadline: state.rollDeadline,
    diceCounts: state.settings.trackDice ? state.diceCounts : {},
    tradeOffer: state.tradeOffer, testMode: state.testMode,
  });
}

const actionFields: Record<string, readonly string[]> = {
  start: [], 'place-settlement': ['vertexId'], 'place-road': ['edgeId'], roll: [],
  'build-road': ['edgeId'], 'build-settlement': ['vertexId'], 'build-city': ['vertexId'],
  trade: ['give', 'receive'], 'end-turn': [], discard: ['resources'],
  'move-robber': ['hexId'], steal: ['playerId'],
  'buy-development': [], 'play-knight': ['cardId'], 'play-road-building': ['cardId'], 'play-monopoly': ['cardId', 'resource'],
  'play-plenty': ['cardId', 'resources'], 'finish-free-roads': [], chat: ['text'], propose: ['kind'], vote: ['proposalId', 'accept'],
  configure: ['settings'], 'offer-trade': ['give', 'want'],
  'accept-trade': ['offerId'], 'decline-trade': ['offerId'], 'cancel-trade': ['offerId'],
};

function validBag(value: unknown, max = 19): value is ResourceBag {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const bag = value as Record<string, unknown>;
  return Object.keys(bag).length === RESOURCES.length && Object.keys(bag).every(key => RESOURCES.includes(key as Resource))
    && RESOURCES.every(resource => Number.isInteger(bag[resource]) && (bag[resource] as number) >= 0 && (bag[resource] as number) <= max);
}

function validateAction(value: unknown): asserts value is GameAction {
  requireRule(value !== null && typeof value === 'object' && !Array.isArray(value), 'Invalid game action.');
  const action = value as Record<string, unknown>;
  requireRule(typeof action.type === 'string' && Object.hasOwn(actionFields, action.type), 'Unknown game action.');
  const fields = actionFields[action.type];
  requireRule(Object.keys(action).length === fields.length + 1
    && Object.keys(action).every(key => key === 'type' || fields.includes(key)), 'Invalid action fields.');
  for (const field of fields) {
    if (field === 'resources' || field === 'settings' || field === 'accept' || field === 'text' || action.type === 'offer-trade') continue;
    requireRule(typeof action[field] === 'string' && (action[field] as string).length <= 128, 'Invalid action selection.');
  }
  if (action.type === 'trade') {
    requireRule(RESOURCES.includes(action.give as Resource) && RESOURCES.includes(action.receive as Resource), 'Choose valid resources.');
  }
  if (action.type === 'discard') {
    requireRule(validBag(action.resources, 95), 'Discard amounts must be nonnegative whole numbers for all five resources.');
  }
  if (action.type === 'configure') {
    requireRule(validSettings(action.settings), 'Choose valid room settings.');
  }
  if (action.type === 'play-plenty') requireRule(validBag(action.resources), 'Choose resources from the bank.');
  if (action.type === 'play-monopoly') requireRule(RESOURCES.includes(action.resource as Resource), 'Choose a resource.');
  if (action.type === 'propose') requireRule(['pause', 'resume', 'undo'].includes(action.kind as string), 'Invalid proposal.');
  if (action.type === 'vote') requireRule(typeof action.accept === 'boolean', 'Choose accept or reject.');
  if (action.type === 'chat') requireRule(typeof action.text === 'string' && action.text.trim().length > 0 && action.text.length <= 280 && !/[\p{Cc}\p{Cf}]/u.test(action.text), 'Use 1–280 characters without control characters.');
  if (action.type === 'offer-trade') {
    requireRule(validBag(action.give) && validBag(action.want), 'Trade amounts must be whole numbers from zero to nineteen for all five resources.');
    const give = action.give; const want = action.want;
    requireRule(resourceCount(give) > 0 && resourceCount(want) > 0, 'A trade must give and receive at least one resource.');
    requireRule(RESOURCES.every(resource => give[resource] === 0 || want[resource] === 0), 'Give and receive different resource types.');
  }
}

function pay(state: GameState, player: Player, cost: ResourceBag): void {
  requireRule(canAfford(player, cost), 'You do not have enough resources.');
  for (const resource of RESOURCES) {
    player.resources[resource] -= cost[resource];
    state.bank[resource] += cost[resource];
  }
}

function produce(state: GameState, total: number): void {
  const demand = new Map<string, ResourceBag>(state.players.map(player => [player.id, emptyBag()]));
  for (const hex of state.board.hexes) {
    if (hex.terrain === 'desert' || hex.number !== total || hex.id === state.robber) continue;
    for (const vertexId of hex.vertexIds) {
      const building = state.buildings[vertexId];
      if (building) demand.get(building.playerId)![hex.terrain] += building.kind === 'city' ? 2 : 1;
    }
  }
  for (const resource of RESOURCES) {
    const recipients = state.players.filter(player => demand.get(player.id)![resource] > 0);
    const needed = recipients.reduce((sum, player) => sum + demand.get(player.id)![resource], 0);
    if (recipients.length > 1 && needed > state.bank[resource]) continue;
    for (const player of recipients) {
      const amount = Math.min(demand.get(player.id)![resource], state.bank[resource]);
      state.bank[resource] -= amount;
      player.resources[resource] += amount;
    }
  }
}

export function addSpectator(state: GameState, input: { id: string; name: string }): GameState {
  requireRule(state.spectators.length < 16, 'This room already has sixteen spectators.');
  requireRule(!state.players.some(p => p.id === input.id) && !state.spectators.some(p => p.id === input.id), 'Already in this room.');
  const next = structuredClone(state);
  next.spectators.push(input); next.version++;
  return next;
}

function shiftClocks(state: GameState, milliseconds: number): void {
  if (state.turnDeadline !== null) state.turnDeadline += milliseconds;
  if (state.rollDeadline !== null) state.rollDeadline += milliseconds;
  if (state.tradeOffer) { state.tradeOffer.createdAt += milliseconds; state.tradeOffer.expiresAt += milliseconds; }
}
function resolveProposal(state: GameState, now: number): GameState {
  const proposal = state.proposal!;
  if (!proposal.required.every(id => proposal.accepted.includes(id))) return state;
  if (proposal.kind === 'pause') { state.pausedAt = now; addLog(state, 'The players paused the game.'); }
  if (proposal.kind === 'resume') {
    shiftClocks(state, now - state.pausedAt!); state.pausedAt = null;
    addLog(state, 'The players resumed the game.');
  }
  if (proposal.kind === 'undo') {
    const undo = state.undo!;
    const restored: GameState = { ...structuredClone(undo.snapshot), version: state.version, chat: state.chat, spectators: state.spectators, log: state.log, undo: null, proposal: null };
    shiftClocks(restored, now - undo.at);
    addLog(restored, `The players undid: ${undo.description}`);
    return restored;
  }
  state.proposal = null;
  return state;
}
function socialAction(state: GameState, playerId: string, action: GameAction, now: number, online?: string[]): GameState | null {
  if (!['chat', 'propose', 'vote'].includes(action.type)) return null;
  const member = [...state.players, ...state.spectators].find(p => p.id === playerId);
  requireRule(member, 'You are not a member of this room.');
  let next = structuredClone(state);
  if (action.type === 'chat') {
    const last = [...next.chat].reverse().find(message => message.senderId === playerId);
    requireRule(!last || now - last.at >= 1000, 'Wait a moment before sending another message.');
    next.chat.push({ id: `chat-${next.version + 1}`, senderId: playerId, name: member.name, text: action.text.trim(), at: now, spectator: !next.players.some(p => p.id === playerId) });
    next.chat = next.chat.slice(-80);
  } else {
    requireRule(next.players.some(p => p.id === playerId), 'Spectators cannot vote or change the game.');
    requireRule(!['lobby', 'finished'].includes(next.phase), 'Start a game before proposing a change.');
    if (action.type === 'propose') {
      requireRule(!next.proposal || next.proposal.expiresAt <= now, 'A proposal is already open.');
      if (action.kind === 'undo') requireRule(next.undo && next.undo.actorId === playerId && next.pausedAt === null, 'You can request undo of your latest build, trade, or turn change.');
      if (action.kind === 'pause') requireRule(next.pausedAt === null, 'The game is already paused.');
      if (action.kind === 'resume') requireRule(next.pausedAt !== null, 'The game is not paused.');
      const required = next.players.filter(p => action.kind === 'undo' || !online || online.includes(p.id) || p.id === playerId).map(p => p.id);
      next.proposal = { id: `proposal-${next.version + 1}`, kind: action.kind, fromId: playerId, required, accepted: [playerId], expiresAt: now + 45_000, description: action.kind === 'undo' ? next.undo!.description : action.kind === 'pause' ? 'Pause the game and its clocks' : 'Resume the game' };
      next = resolveProposal(next, now);
    } else if (action.type === 'vote') {
      const proposal = next.proposal;
      requireRule(proposal && proposal.id === action.proposalId && proposal.expiresAt > now, 'That proposal has expired.');
      requireRule(proposal.required.includes(playerId) && !proposal.accepted.includes(playerId), 'Your vote has already been recorded or is not needed.');
      if (action.accept) { proposal.accepted.push(playerId); next = resolveProposal(next, now); }
      else { addLog(next, `${member.name} declined the ${proposal.kind} proposal.`); next.proposal = null; }
    }
  }
  next.version++; return next;
}

/** Called by durable alarms; deadlines never depend on an open browser. */
export function advanceTime(state: GameState, now: number, random: () => number = Math.random): GameState {
  let next = structuredClone(state);
  let changed = false;
  if (next.proposal && next.proposal.expiresAt <= now) { next.proposal = null; changed = true; }
  if (next.pausedAt === null) {
    if (next.tradeOffer && next.tradeOffer.expiresAt <= now) { next.tradeOffer = null; changed = true; }
    if (next.turnDeadline !== null && next.turnDeadline <= now && !next.turnExpired) {
      next.turnExpired = true; changed = true; addLog(next, 'Time is up. Waiting for the player; no automatic moves are made.');
    }
    if (next.phase === 'roll' && ((next.rollDeadline !== null && next.rollDeadline <= now) || next.turnExpired)) {
      return applyAction(next, getActivePlayerId(next)!, { type: 'roll' }, random, now);
    }
  }
  if (changed) next.version++;
  return changed ? next : state;
}

/** Every accepted command returns a new state; rejected commands leave input intact. */
export function applyAction(state: GameState, playerId: string, action: GameAction, random: () => number = Math.random, now = Date.now(), context: { online?: string[] } = {}): GameState {
  validateAction(action);
  const social = socialAction(state, playerId, action, now, context.online);
  if (social) return social;
  requireRule(state.pausedAt === null, 'The game is paused. Propose resuming to continue.');
  requireRule(state.players.some(player => player.id === playerId), 'You are not a player in this room.');
  requireRule(state.phase !== 'finished', 'This game has finished.');
  if (!['start', 'configure', 'discard', 'accept-trade', 'decline-trade'].includes(action.type)) {
    requireRule(getActivePlayerId(state) === playerId, 'Wait for your turn.');
  }
  const next = structuredClone(state);
  const player = next.players.find(candidate => candidate.id === playerId)!;
  const legal = legalMoves(next, playerId);
  const needPhase = (phase: GameState['phase']) => requireRule(next.phase === phase, 'That action is not available right now.');

  switch (action.type) {
    case 'configure': {
      needPhase('lobby');
      requireRule(next.hostId === playerId, 'Only the host can change room settings.');
      next.settings = { ...next.settings, ...action.settings };
      if (state.settings.numberLayout !== next.settings.numberLayout) assignNumbers(next.board, next.settings.numberLayout, random);
      addLog(next, `${player.name} updated the room settings.`);
      break;
    }
    case 'start': {
      needPhase('lobby');
      requireRule(next.hostId === playerId, 'Only the host can start the game.');
      requireRule(next.players.length >= 2 && next.players.length <= 4, 'Invite at least one friend before starting.');
      const ids = next.players.map(candidate => candidate.id);
      next.setupOrder = [...ids, ...[...ids].reverse()];
      next.phase = 'setup-settlement';
      addLog(next, 'The expedition begins. Place two settlements and connecting roads in snake order.');
      break;
    }
    case 'place-settlement': {
      needPhase('setup-settlement');
      requireRule(legal.settlements.includes(action.vertexId), 'Choose an open intersection at least two roads from other settlements.');
      next.buildings[action.vertexId] = { playerId, kind: 'settlement' };
      next.lastSettlement = action.vertexId;
      if (next.setupIndex >= next.players.length) {
        const vertex = next.board.vertices.find(candidate => candidate.id === action.vertexId)!;
        for (const hexId of vertex.hexIds) {
          const terrain = next.board.hexes.find(hex => hex.id === hexId)!.terrain;
          if (terrain !== 'desert' && next.bank[terrain] > 0) { next.bank[terrain]--; player.resources[terrain]++; }
        }
      }
      next.phase = 'setup-road';
      addLog(next, `${player.name} founded a settlement.`);
      break;
    }
    case 'place-road': {
      needPhase('setup-road');
      requireRule(legal.roads.includes(action.edgeId), 'Connect this road to the settlement you just placed.');
      next.roads[action.edgeId] = playerId;
      next.lastSettlement = null;
      next.setupIndex++;
      if (next.setupIndex === next.setupOrder.length) {
        next.phase = 'roll'; next.turnIndex = 0; next.turn = 1;
        addLog(next, 'Everyone is settled. Roll the dice to gather resources.');
      } else { next.phase = 'setup-settlement'; }
      break;
    }
    case 'roll': {
      needPhase('roll');
      next.dice = [Math.floor(random() * 6) + 1, Math.floor(random() * 6) + 1];
      const total = next.dice[0] + next.dice[1];
      next.rollDeadline = null;
      next.diceCounts[total]++;
      addLog(next, `${player.name} rolled ${total}.`);
      if (total === 7) {
        next.pendingDiscards = {};
        for (const candidate of next.players) {
          const count = resourceCount(candidate.resources);
          if (count > next.settings.discardLimit) next.pendingDiscards[candidate.id] = Math.floor(count / 2);
        }
        next.phase = Object.keys(next.pendingDiscards).length ? 'discard' : 'robber';
      } else { produce(next, total); next.phase = 'build'; }
      break;
    }
    case 'discard': {
      needPhase('discard');
      const amount = next.pendingDiscards[playerId];
      requireRule(amount > 0, 'You do not need to discard.');
      requireRule(resourceCount(action.resources) === amount, `Choose exactly ${amount} resources to discard.`);
      pay(next, player, action.resources);
      delete next.pendingDiscards[playerId];
      if (!Object.keys(next.pendingDiscards).length) next.phase = 'robber';
      addLog(next, `${player.name} discarded ${amount} resources.`);
      break;
    }
    case 'move-robber': {
      needPhase('robber');
      requireRule(legal.robberHexes.includes(action.hexId), 'Move the robber to a different hex.');
      next.robber = action.hexId;
      next.phase = stealTargets(next, playerId).length ? 'steal' : next.resumePhase ?? 'build';
      if (next.phase !== 'steal') next.resumePhase = null;
      addLog(next, `${player.name} moved the robber.`);
      break;
    }
    case 'steal': {
      needPhase('steal');
      requireRule(legal.stealTargets.includes(action.playerId), 'Choose an opponent with resources bordering the robber.');
      const victim = next.players.find(candidate => candidate.id === action.playerId)!;
      let index = Math.floor(random() * resourceCount(victim.resources));
      for (const resource of RESOURCES) {
        if (index < victim.resources[resource]) { victim.resources[resource]--; player.resources[resource]++; break; }
        index -= victim.resources[resource];
      }
      next.phase = next.resumePhase ?? 'build'; next.resumePhase = null;
      addLog(next, `${player.name} took one resource from ${victim.name}.`);
      break;
    }
    case 'build-road': {
      requireRule(next.phase === 'build' || next.phase === 'free-roads', 'Cannot build a road now.');
      requireRule(legal.roads.includes(action.edgeId), 'Choose a connected, open road and make sure you can pay its cost.');
      if (next.phase !== 'free-roads') pay(next, player, BUILD_COSTS.road);
      next.roads[action.edgeId] = playerId;
      addLog(next, `${player.name} built a road.`);
      if (next.phase === 'free-roads') {
        next.freeRoads--;
        if (!next.freeRoads || pieceCounts(next, playerId).roads === 15 || !roadSites(next, playerId, false).length) { next.phase = next.resumePhase ?? 'build'; next.resumePhase = null; next.freeRoads = 0; }
      }
      break;
    }
    case 'build-settlement': {
      needPhase('build');
      requireRule(legal.settlements.includes(action.vertexId), 'Choose a legal settlement connected to your road and make sure you can pay its cost.');
      pay(next, player, BUILD_COSTS.settlement);
      next.buildings[action.vertexId] = { playerId, kind: 'settlement' };
      addLog(next, `${player.name} founded a settlement.`);
      break;
    }
    case 'build-city': {
      needPhase('build');
      requireRule(legal.cities.includes(action.vertexId), 'Upgrade one of your settlements and make sure you can pay its cost.');
      pay(next, player, BUILD_COSTS.city);
      next.buildings[action.vertexId] = { playerId, kind: 'city' };
      addLog(next, `${player.name} upgraded a settlement to a city.`);
      break;
    }
    case 'trade': {
      needPhase('build');
      requireRule(action.give !== action.receive, 'Choose two different resource types.');
      const ratio = tradeRates(next, playerId)[action.give];
      requireRule(player.resources[action.give] >= ratio, `This maritime trade needs ${ratio} resources of one type.`);
      requireRule(next.bank[action.receive] > 0, 'The bank has no cards of that resource left.');
      player.resources[action.give] -= ratio; next.bank[action.give] += ratio;
      next.bank[action.receive]--; player.resources[action.receive]++;
      addLog(next, `${player.name} traded ${ratio} ${action.give} for one ${action.receive}.`);
      break;
    }
    case 'offer-trade': {
      needPhase('build');
      requireRule(canAfford(player, action.give), 'You do not have the resources you are offering.');
      next.tradeOffer = { id: `trade-${next.version + 1}`, fromId: playerId, give: structuredClone(action.give), want: structuredClone(action.want), declinedBy: [], createdAt: now, expiresAt: now + 30_000 };
      addLog(next, `${player.name} offered a trade.`);
      break;
    }
    case 'accept-trade': {
      needPhase('build');
      const offer = next.tradeOffer;
      requireRule(offer && offer.id === action.offerId && offer.expiresAt > now, 'This trade offer is no longer available.');
      requireRule(offer.fromId !== playerId, 'You cannot accept your own trade.');
      requireRule(offer.fromId === getActivePlayerId(next), 'This trade offer is no longer available.');
      const proposer = next.players.find(candidate => candidate.id === offer.fromId)!;
      requireRule(canAfford(proposer, offer.give) && canAfford(player, offer.want), 'Both players must have the resources in the offer.');
      for (const resource of RESOURCES) {
        proposer.resources[resource] += offer.want[resource] - offer.give[resource];
        player.resources[resource] += offer.give[resource] - offer.want[resource];
      }
      next.tradeOffer = null;
      addLog(next, `${player.name} accepted ${proposer.name}’s trade.`);
      break;
    }
    case 'decline-trade': {
      needPhase('build');
      const offer = next.tradeOffer;
      requireRule(offer && offer.id === action.offerId && offer.expiresAt > now, 'This trade offer is no longer available.');
      requireRule(offer.fromId !== playerId, 'Cancel your own trade instead.');
      requireRule(!offer.declinedBy.includes(playerId), 'You already declined this offer.');
      offer.declinedBy.push(playerId);
      break;
    }
    case 'cancel-trade': {
      needPhase('build');
      requireRule(next.tradeOffer && next.tradeOffer.id === action.offerId, 'This trade offer is no longer available.');
      requireRule(next.tradeOffer.fromId === playerId, 'Only the offering player can cancel this trade.');
      next.tradeOffer = null;
      addLog(next, `${player.name} canceled the trade offer.`);
      break;
    }
    case 'buy-development': {
      needPhase('build'); requireRule(next.developmentDeck.length, 'The development deck is empty.');
      pay(next, player, { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1 });
      player.development.push({ ...next.developmentDeck.pop()!, boughtTurn: next.turn });
      addLog(next, `${player.name} bought a development card.`); break;
    }
    case 'play-knight': case 'play-road-building': case 'play-monopoly': case 'play-plenty': {
      requireRule(['roll', 'build'].includes(next.phase), 'Play development cards before rolling or while building.');
      requireRule(!next.developmentPlayed, 'Only one development card may be played each turn.');
      const kind = { 'play-knight': 'knight', 'play-road-building': 'road-building', 'play-monopoly': 'monopoly', 'play-plenty': 'year-of-plenty' }[action.type];
      const index = player.development.findIndex(c => c.id === action.cardId && c.kind === kind && c.boughtTurn < next.turn);
      requireRule(index >= 0, 'Choose a development card bought on an earlier turn.');
      if (action.type === 'play-knight') {
        player.knights++; next.resumePhase = next.phase as 'roll' | 'build'; next.phase = 'robber';
      }
      if (action.type === 'play-road-building') {
        requireRule(pieceCounts(next, playerId).roads < 15 && roadSites(next, playerId, false).length, 'No roads can be placed.');
        next.resumePhase = next.phase as 'roll' | 'build'; next.phase = 'free-roads'; next.freeRoads = Math.min(2, 15 - pieceCounts(next, playerId).roads);
      }
      if (action.type === 'play-monopoly') {
        for (const other of next.players) if (other.id !== playerId) { player.resources[action.resource] += other.resources[action.resource]; other.resources[action.resource] = 0; }
      }
      if (action.type === 'play-plenty') {
        const available = resourceCount(next.bank);
        requireRule(available > 0 && resourceCount(action.resources) === Math.min(2, available), 'Choose two available resources, or all remaining cards if only one is left.');
        requireRule(RESOURCES.every(r => next.bank[r] >= action.resources[r]), 'The bank does not have those resources.');
        for (const r of RESOURCES) { next.bank[r] -= action.resources[r]; player.resources[r] += action.resources[r]; }
      }
      player.development.splice(index, 1); next.developmentPlayed = true;
      addLog(next, `${player.name} played ${kind.replaceAll('-', ' ')}.`); break;
    }
    case 'finish-free-roads': {
      needPhase('free-roads'); next.freeRoads = 0; next.phase = next.resumePhase ?? 'build'; next.resumePhase = null;
      addLog(next, `${player.name} finished Road Building.`); break;
    }
    case 'end-turn': {
      needPhase('build');
      next.turnIndex = (next.turnIndex + 1) % next.players.length;
      next.turn++; next.dice = null; next.phase = 'roll'; next.developmentPlayed = false;
      addLog(next, `${player.name} ended their turn.`);
      next.tradeOffer = null;
      break;
    }
  }
  updateAwards(next);
  const activeId = getActivePlayerId(next);
  if (next.turn > 0 && activeId && victoryPoints(next, activeId) >= 10) {
    next.phase = 'finished'; next.winnerId = activeId; next.tradeOffer = null; next.proposal = null;
    addLog(next, `${next.players.find(p => p.id === activeId)!.name} reached 10 points and won the island!`);
  }
  if (next.tradeOffer && !canAfford(next.players.find(candidate => candidate.id === next.tradeOffer!.fromId)!, next.tradeOffer.give)) {
    next.tradeOffer = null;
    addLog(next, 'The trade offer closed because the offered resources changed.');
  }
  if (next.phase === 'roll' && state.phase !== 'roll') {
    next.rollDeadline = next.settings.autoRollSeconds ? now + next.settings.autoRollSeconds * 1000 : null;
  } else if (next.phase !== 'roll') next.rollDeadline = null;
  if (action.type === 'start' || next.setupIndex !== state.setupIndex || next.turn !== state.turn) {
    next.turnDeadline = now + next.settings.turnSeconds * 1000; next.turnExpired = false;
  }
  if (next.phase === 'finished') { next.turnDeadline = null; next.rollDeadline = null; next.undo = null; }
  const reversible = ['place-settlement', 'place-road', 'build-road', 'build-settlement', 'build-city', 'trade', 'accept-trade', 'end-turn'];
  const passive = ['offer-trade', 'decline-trade', 'cancel-trade'];
  if (!passive.includes(action.type)) {
    next.proposal = null;
    if (reversible.includes(action.type) && next.phase !== 'finished') {
      const { undo: _undo, proposal: _proposal, ...snapshot } = structuredClone(state);
      next.undo = { actorId: playerId, at: now, description: next.log.at(-1)?.text ?? action.type, snapshot };
    } else next.undo = null;
  }
  next.version++;
  return next;
}
