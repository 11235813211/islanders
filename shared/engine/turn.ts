import { type GameState, RESOURCES, type ResourceBag } from '../types';
import {
  addLog,
  BUILD_COSTS,
  bumpStat,
  emptyBag,
  type Handlers,
  needPhase,
  PIECE_LIMITS,
  pay,
  pieceCounts,
  requireRule,
  resourceCount,
} from './core';
import { legalMoves, roadSites, stealTargets } from './legal';

/** Pay out a roll. If the bank can't cover everyone owed a resource, nobody gets it (unless only one player is owed). */
function produce(state: GameState, total: number): Record<string, ResourceBag> {
  const demand = new Map<string, ResourceBag>(state.players.map(player => [player.id, emptyBag()]));
  for (const hex of state.board.hexes) {
    if (hex.terrain === 'desert' || hex.number !== total || hex.id === state.robber) continue;
    for (const vertexId of hex.vertexIds) {
      const building = state.buildings[vertexId];
      if (building) demand.get(building.playerId)![hex.terrain] += building.kind === 'city' ? 2 : 1;
    }
  }
  const gains: Record<string, ResourceBag> = {};
  for (const resource of RESOURCES) {
    const recipients = state.players.filter(player => demand.get(player.id)![resource] > 0);
    const needed = recipients.reduce((sum, player) => sum + demand.get(player.id)![resource], 0);
    if (recipients.length > 1 && needed > state.bank[resource]) continue;
    for (const player of recipients) {
      const amount = Math.min(demand.get(player.id)![resource], state.bank[resource]);
      state.bank[resource] -= amount;
      player.resources[resource] += amount;
      gains[player.id] ??= emptyBag();
      gains[player.id]![resource] += amount;
    }
  }
  for (const [id, bag] of Object.entries(gains)) bumpStat(state, id, 'gained', resourceCount(bag));
  return gains;
}

/** Take one weighted-random card from the victim, then return to the phase the robber interrupted. */
export function stealResource(state: GameState, actorId: string, victimId: string, random: () => number): void {
  const player = state.players.find(p => p.id === actorId)!;
  const victim = state.players.find(p => p.id === victimId)!;
  let index = Math.floor(random() * resourceCount(victim.resources));
  for (const resource of RESOURCES) {
    if (index < victim.resources[resource]) {
      victim.resources[resource]--;
      player.resources[resource]++;
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
    index -= victim.resources[resource];
  }
  state.phase = state.resumePhase ?? 'build';
  state.resumePhase = null;
}

function finishFreeRoads(next: GameState): void {
  next.phase = next.resumePhase ?? 'build';
  next.resumePhase = null;
  next.freeRoads = 0;
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
    // The second setup settlement collects one of each adjacent resource.
    if (next.setupIndex >= next.players.length) {
      const vertex = next.board.vertices.find(candidate => candidate.id === action.vertexId)!;
      for (const hexId of vertex.hexIds) {
        const terrain = next.board.hexes.find(hex => hex.id === hexId)!.terrain;
        if (terrain !== 'desert' && next.bank[terrain] > 0) {
          next.bank[terrain]--;
          player.resources[terrain]++;
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
    next.lastSettlement = null;
    next.setupIndex++;
    addLog(next, `${player.name} built a road.`, { kind: 'build', playerId, piece: 'road' });
    if (next.setupIndex === next.setupOrder.length) {
      next.phase = 'roll';
      next.turnIndex = 0;
      next.turn = 1;
      addLog(next, 'Setup complete.');
    } else next.phase = 'setup-settlement';
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
      for (const candidate of next.players) {
        const count = resourceCount(candidate.resources);
        if (count > next.settings.discardLimit) next.pendingDiscards[candidate.id] = Math.floor(count / 2);
      }
      next.phase = Object.keys(next.pendingDiscards).length ? 'discard' : 'robber';
      addLog(next, `${player.name} rolled ${total}.`, { kind: 'roll', playerId, dice, gains: {} });
    } else {
      const gains = produce(next, total);
      next.phase = 'build';
      addLog(next, `${player.name} rolled ${total}.`, { kind: 'roll', playerId, dice, gains });
    }
  },

  discard({ next, player, playerId }, action) {
    needPhase(next, 'discard');
    const amount = next.pendingDiscards[playerId];
    requireRule(amount && amount > 0, 'You do not need to discard.');
    requireRule(resourceCount(action.resources) === amount, `Choose exactly ${amount} resources to discard.`);
    pay(next, player, action.resources);
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
    next.robber = action.hexId;
    const victims = stealTargets(next, playerId);
    next.phase = victims.length ? 'steal' : (next.resumePhase ?? 'build');
    if (!victims.length) next.resumePhase = null;
    addLog(next, `${player.name} moved the robber.`);
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
    needPhase(next, 'build', 'free-roads');
    requireRule(
      legalMoves(next, playerId).roads.includes(action.edgeId),
      'Choose a connected, open road and make sure you can pay its cost.',
    );
    if (next.phase !== 'free-roads') pay(next, player, BUILD_COSTS.road);
    next.roads[action.edgeId] = playerId;
    addLog(next, `${player.name} built a road.`, { kind: 'build', playerId, piece: 'road' });
    if (next.phase === 'free-roads') {
      next.freeRoads--;
      if (
        !next.freeRoads ||
        pieceCounts(next, playerId).roads === PIECE_LIMITS.roads ||
        !roadSites(next, playerId, false).length
      )
        finishFreeRoads(next);
    }
  },

  'build-settlement'({ next, player, playerId }, action) {
    needPhase(next, 'build');
    requireRule(
      legalMoves(next, playerId).settlements.includes(action.vertexId),
      'Choose a legal settlement connected to your road and make sure you can pay its cost.',
    );
    pay(next, player, BUILD_COSTS.settlement);
    next.buildings[action.vertexId] = { playerId, kind: 'settlement' };
    addLog(next, `${player.name} founded a settlement.`, { kind: 'build', playerId, piece: 'settlement' });
  },

  'build-city'({ next, player, playerId }, action) {
    needPhase(next, 'build');
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

  'end-turn'({ next, player }) {
    needPhase(next, 'build');
    next.turnIndex = (next.turnIndex + 1) % next.players.length;
    next.turn++;
    next.dice = null;
    next.phase = 'roll';
    next.developmentPlayed = false;
    next.tradeOffer = null;
    addLog(next, `${player.name} ended their turn.`);
  },
};
