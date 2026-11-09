import { boardIndex, islandBonus, terrainResource, vertexIsland } from '../seafaring';
import { type GameState, RESOURCES, type Tradable } from '../types';
import {
  addBag,
  addLog,
  BUILD_COSTS,
  bagCount,
  bumpStat,
  canAfford,
  discoveryRule,
  emptyBag,
  type Handlers,
  handSize,
  holding,
  isLargeGame,
  needPhase,
  PIECE_LIMITS,
  pay,
  pieceCounts,
  requireRule,
} from './core';
import { canSpecialBuild, legalMoves, roadSites, shipSites, stealTargets } from './legal';
import { drift, erupt, produce } from './production';

/**
 * Take one weighted-random card (or, where the room allows it, a discovery) from the victim, then
 * return to the phase the robber interrupted.
 */
export function stealResource(state: GameState, actorId: string, victimId: string, random: () => number): void {
  const player = state.players.find(p => p.id === actorId)!;
  const victim = state.players.find(p => p.id === victimId)!;
  const pool: Tradable[] = discoveryRule(state).stealable ? [...RESOURCES, 'discovery'] : [...RESOURCES];
  let index = Math.floor(random() * pool.reduce((n, item) => n + holding(victim, item), 0));
  for (const resource of pool) {
    if (index < holding(victim, resource)) {
      const one = { ...emptyBag(), [resource]: 1 };
      addBag(victim, one, -1);
      addBag(player, one);
      bumpStat(state, actorId, 'stolen');
      bumpStat(state, victimId, 'lost');
      addLog(state, `${player.name} took one resource from ${victim.name}.`, {
        kind: 'steal',
        thiefId: actorId,
        victimId,
        resource,
      });
      break;
    }
    index -= holding(victim, resource);
  }
  state.phase = state.resumePhase ?? 'build';
  state.resumePhase = null;
}

export function finishFreeRoads(next: GameState): void {
  next.phase = next.resumePhase ?? 'build';
  next.resumePhase = null;
  next.freeRoads = 0;
}

/** After a free road or ship from Road Building: stop when both are used or nothing more fits. */
export function afterFreePiece(next: GameState, playerId: string): void {
  next.freeRoads--;
  const pieces = pieceCounts(next, playerId);
  const roads = pieces.roads < PIECE_LIMITS.roads && roadSites(next, playerId, false).length;
  const ships = pieces.ships < PIECE_LIMITS.ships && shipSites(next, playerId, false).length;
  if (!next.freeRoads || (!roads && !ships)) finishFreeRoads(next);
}

/** Note the island a new settlement stands on; the first settlement there may earn its bonus. */
export function visitIsland(next: GameState, playerId: string, vertexId: string, setup: boolean): void {
  const island = vertexIsland(next.board, vertexId);
  if (island === null) return;
  const visited = next.islands[playerId] ?? [];
  if (visited.includes(island)) return;
  next.islands[playerId] = [...visited, island];
  const bonus = setup ? 0 : islandBonus(next.board, island);
  if (!bonus) return;
  next.bonusPoints[playerId] = (next.bonusPoints[playerId] ?? 0) + bonus;
  const name = next.players.find(p => p.id === playerId)!.name;
  addLog(next, `${name} settled a new island and earned ${bonus} bonus point${bonus === 1 ? '' : 's'}.`);
}

/**
 * With five or six players, after each turn the others may build in turn order (no trading or
 * cards). Returns who builds next, skipping anyone with nothing they could build; null ends it.
 */
function nextSpecialBuilder(next: GameState): string | null {
  if (!isLargeGame(next.players.length)) return null;
  const count = next.players.length;
  const from = next.specialBuilder ? next.players.findIndex(p => p.id === next.specialBuilder) : next.turnIndex;
  for (let i = (from + 1) % count; i !== next.turnIndex; i = (i + 1) % count)
    if (canSpecialBuild(next, next.players[i]!.id)) return next.players[i]!.id;
  return null;
}

/** End the setup round's road-or-ship placement. */
export function finishSetupLink(next: GameState): void {
  next.lastSettlement = null;
  next.setupIndex++;
  if (next.setupIndex === next.setupOrder.length) {
    next.phase = 'roll';
    next.turnIndex = 0;
    next.turn = 1;
    addLog(next, 'Setup complete.');
  } else next.phase = 'setup-settlement';
}

export const turnHandlers: Pick<
  Handlers,
  | 'place-settlement'
  | 'place-road'
  | 'roll'
  | 'discard'
  | 'move-robber'
  | 'steal'
  | 'build-road'
  | 'build-settlement'
  | 'build-city'
  | 'finish-free-roads'
  | 'end-turn'
> = {
  'place-settlement'({ next, player, playerId }, action) {
    needPhase(next, 'setup-settlement');
    requireRule(
      legalMoves(next, playerId).settlements.includes(action.vertexId),
      'Choose an open intersection at least two roads from other settlements.',
    );
    next.buildings[action.vertexId] = { playerId, kind: 'settlement' };
    next.lastSettlement = action.vertexId;
    visitIsland(next, playerId, action.vertexId, true);
    // The second setup settlement collects one of each adjacent resource.
    if (next.setupIndex >= next.players.length) {
      const index = boardIndex(next.board);
      for (const hexId of index.vertex.get(action.vertexId)!.hexIds) {
        const resource = terrainResource(index.hex.get(hexId)!.terrain);
        if (resource && next.bank[resource] > 0) {
          next.bank[resource]--;
          player.resources[resource]++;
          bumpStat(next, playerId, 'gained');
        }
      }
    }
    next.phase = 'setup-road';
    addLog(next, `${player.name} founded a settlement.`, { kind: 'build', playerId, piece: 'settlement' });
  },

  'place-road'({ next, player, playerId }, action) {
    needPhase(next, 'setup-road');
    requireRule(
      legalMoves(next, playerId).roads.includes(action.edgeId),
      'Connect this road to the settlement you just placed.',
    );
    next.roads[action.edgeId] = playerId;
    addLog(next, `${player.name} built a road.`, { kind: 'build', playerId, piece: 'road' });
    finishSetupLink(next);
  },

  roll({ next, player, playerId, random }) {
    needPhase(next, 'roll');
    const dice: [number, number] = [Math.floor(random() * 6) + 1, Math.floor(random() * 6) + 1];
    next.dice = dice;
    const total = dice[0] + dice[1];
    next.rollDeadline = null;
    next.diceCounts[total]++;
    if (total === 7) {
      next.pendingDiscards = {};
      next.stealHex = null;
      for (const candidate of next.players) {
        const count = handSize(next, candidate);
        if (count > next.settings.discardLimit) next.pendingDiscards[candidate.id] = Math.floor(count / 2);
      }
      next.phase = Object.keys(next.pendingDiscards).length ? 'discard' : 'robber';
      addLog(next, `${player.name} rolled ${total}.`, { kind: 'roll', playerId, dice, gains: {} });
    } else {
      const gains = produce(next, total);
      addLog(next, `${player.name} rolled ${total}.`, { kind: 'roll', playerId, dice, gains });
      erupt(next, total, random);
      drift(next, total, random);
      next.phase = Object.keys(next.pendingGold).length ? 'gold' : 'build';
    }
  },

  discard({ next, player, playerId }, action) {
    needPhase(next, 'discard');
    const amount = next.pendingDiscards[playerId];
    requireRule(amount && amount > 0, 'You do not need to discard.');
    requireRule(bagCount(action.resources) === amount, `Choose exactly ${amount} resources to discard.`);
    requireRule(
      !action.resources.discovery || discoveryRule(next).inHand,
      'Discoveries are not discarded in this room.',
    );
    requireRule(canAfford(player, action.resources), 'You do not have enough resources.');
    addBag(player, action.resources, -1);
    for (const r of RESOURCES) next.bank[r] += action.resources[r];
    delete next.pendingDiscards[playerId];
    bumpStat(next, playerId, 'discarded', amount);
    if (!Object.keys(next.pendingDiscards).length) next.phase = 'robber';
    addLog(next, `${player.name} discarded ${amount} resources.`, {
      kind: 'discard',
      playerId,
      resources: action.resources,
    });
  },

  'move-robber'({ next, player, playerId, random }, action) {
    needPhase(next, 'robber');
    requireRule(legalMoves(next, playerId).robberHexes.includes(action.hexId), 'Move the robber to a different hex.');
    const pirate = boardIndex(next.board).hex.get(action.hexId)!.terrain === 'sea';
    if (pirate) next.pirate = action.hexId;
    else next.robber = action.hexId;
    next.stealHex = action.hexId;
    const victims = stealTargets(next, playerId);
    next.phase = victims.length ? 'steal' : (next.resumePhase ?? 'build');
    if (!victims.length) next.resumePhase = null;
    addLog(next, `${player.name} moved the ${pirate ? 'pirate' : 'robber'}.`);
    if (victims.length === 1) stealResource(next, playerId, victims[0]!, random);
  },

  steal({ next, playerId, random }, action) {
    needPhase(next, 'steal');
    requireRule(
      legalMoves(next, playerId).stealTargets.includes(action.playerId),
      'Choose an opponent with resources bordering the robber.',
    );
    stealResource(next, playerId, action.playerId, random);
  },

  'build-road'({ next, player, playerId }, action) {
    needPhase(next, 'build', 'free-roads', 'special-build');
    requireRule(
      legalMoves(next, playerId).roads.includes(action.edgeId),
      'Choose a connected, open road and make sure you can pay its cost.',
    );
    if (next.phase !== 'free-roads') pay(next, player, BUILD_COSTS.road);
    next.roads[action.edgeId] = playerId;
    addLog(next, `${player.name} built a road.`, { kind: 'build', playerId, piece: 'road' });
    if (next.phase === 'free-roads') afterFreePiece(next, playerId);
  },

  'build-settlement'({ next, player, playerId }, action) {
    needPhase(next, 'build', 'special-build');
    requireRule(
      legalMoves(next, playerId).settlements.includes(action.vertexId),
      'Choose a legal settlement connected to your road and make sure you can pay its cost.',
    );
    pay(next, player, BUILD_COSTS.settlement);
    next.buildings[action.vertexId] = { playerId, kind: 'settlement' };
    addLog(next, `${player.name} founded a settlement.`, { kind: 'build', playerId, piece: 'settlement' });
    visitIsland(next, playerId, action.vertexId, false);
  },

  'build-city'({ next, player, playerId }, action) {
    needPhase(next, 'build', 'special-build');
    requireRule(
      legalMoves(next, playerId).cities.includes(action.vertexId),
      'Upgrade one of your settlements and make sure you can pay its cost.',
    );
    pay(next, player, BUILD_COSTS.city);
    next.buildings[action.vertexId] = { playerId, kind: 'city' };
    addLog(next, `${player.name} upgraded a settlement to a city.`, { kind: 'build', playerId, piece: 'city' });
  },

  'finish-free-roads'({ next, player }) {
    needPhase(next, 'free-roads');
    finishFreeRoads(next);
    addLog(next, `${player.name} finished Road Building.`);
  },

  /** Ends a turn, or one player's part of the special build phase. */
  'end-turn'({ next, player }) {
    needPhase(next, 'build', 'special-build');
    if (next.phase === 'build') addLog(next, `${player.name} ended their turn.`);
    next.tradeOffer = null;
    const builder = nextSpecialBuilder(next);
    if (builder) {
      next.phase = 'special-build';
      next.specialBuilder = builder;
      return;
    }
    next.specialBuilder = null;
    next.turnIndex = (next.turnIndex + 1) % next.players.length;
    next.turn++;
    next.dice = null;
    next.phase = 'roll';
    next.developmentPlayed = false;
    next.shipsBuilt = [];
    next.shipMoved = false;
  },
};
