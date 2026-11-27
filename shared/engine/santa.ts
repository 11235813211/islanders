// The North Pole (room setting `northPole`; drawn the same with or without the Christmas look).
// Santa lives on a one-tile island above the map with its own number; nobody may settle on its
// corners. When the number is rolled, the roller picks another player's settlement or city, and
// Santa flies there with one card of a random standard resource from the bank.
import { HEX_RADIUS, withLoneHex } from '../board';
import { logName } from '../candy-names';
import { type Board, CLASSIC_RESOURCES, type ClassicResource, type GameState, type NorthPole } from '../types';
import { addLog, type Handlers, needPhase, requireRule, tally } from './core';

/** Numbers the North Pole may draw: never 7, 6, or 8 (too often) nor 2, 3, 11, or 12 (too rarely). */
export const NORTH_POLE_NUMBERS = [4, 5, 9, 10] as const;

/**
 * Santa's island for a fresh board: one tile of its own above the map, across a row of water,
 * with its own number. Null when the room has no North Pole.
 */
export function placeNorthPole(state: GameState, random: () => number): { board: Board; northPole: NorthPole } | null {
  if (!state.settings.northPole) return null;
  const { hexes } = state.board;
  const top = Math.min(...hexes.map(h => h.r));
  const r = top - 2;
  const middle = hexes.reduce((sum, h) => sum + h.x, 0) / hexes.length;
  const q = Math.round(middle / (Math.sqrt(3) * HEX_RADIUS) - r / 2);
  // Desert terrain pays nothing; the North Pole is drawn in its place.
  const { board, hexId } = withLoneHex(state.board, q, r, 'desert');
  const number = NORTH_POLE_NUMBERS[Math.floor(random() * NORTH_POLE_NUMBERS.length)]!;
  return { board, northPole: { hexId, number } };
}

/** Corners holding another player's settlement or city: where the roller may send Santa. */
export function santaTargets(state: Pick<GameState, 'buildings'>, rollerId: string): string[] {
  return Object.entries(state.buildings)
    .filter(([, building]) => building.playerId !== rollerId)
    .map(([vertexId]) => vertexId);
}

/** One of a rival's networks: buildings and the roads and ships joining them, picked as one. */
export interface SantaNetwork {
  playerId: string;
  /** Where Santa lands when this network is picked: its first building. */
  vertexId: string;
  vertices: string[];
  edges: string[];
}

/**
 * Every other player's connected networks (their buildings and roads or ships, split where a
 * rival's building sits on the route, as for the longest road), each holding at least one
 * building. The roller picks one, and Santa flies to it.
 */
export function santaNetworks(
  state: Pick<GameState, 'board' | 'buildings' | 'roads' | 'ships'>,
  rollerId: string,
): SantaNetwork[] {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    const up = parent.get(k)!;
    if (up === k) return k;
    const root = find(up);
    parent.set(k, root);
    return root;
  };
  const join = (a: string, b: string) => parent.set(find(a), find(b));
  const owner = new Map<string, string>();
  for (const [vertexId, b] of Object.entries(state.buildings))
    if (b.playerId !== rollerId) owner.set(`v:${vertexId}`, b.playerId);
  for (const [edgeId, playerId] of [...Object.entries(state.roads), ...Object.entries(state.ships ?? {})])
    if (playerId !== rollerId) owner.set(`e:${edgeId}`, playerId);
  for (const key of owner.keys()) parent.set(key, key);
  for (const vertex of state.board.vertices) {
    const here = state.buildings[vertex.id];
    const pieces = vertex.edgeIds.map(e => `e:${e}`).filter(k => owner.has(k));
    if (here && here.playerId !== rollerId) pieces.push(`v:${vertex.id}`);
    // A building blocks other players' routes through its corner.
    const through = pieces.filter(k => !here || owner.get(k) === here.playerId);
    for (const a of through) for (const b of through) if (owner.get(a) === owner.get(b)) join(a, b);
  }
  const groups = new Map<string, SantaNetwork>();
  for (const [key, playerId] of owner) {
    const root = find(key);
    const group = groups.get(root) ?? { playerId, vertexId: '', vertices: [], edges: [] };
    groups.set(root, group);
    if (key.startsWith('v:')) group.vertices.push(key.slice(2));
    else group.edges.push(key.slice(2));
  }
  return [...groups.values()].filter(g => g.vertices.length > 0).map(g => ({ ...g, vertexId: g.vertices.sort()[0]! }));
}

/** After a roll pays out: whether Santa is coming (his number, and someone to visit). */
export function santaComes(state: GameState, total: number, rollerId: string): boolean {
  return state.northPole?.number === total && santaTargets(state, rollerId).length > 0;
}

/** One random standard resource the bank still has, or null when all five are gone. */
function giftFrom(state: GameState, random: () => number): ClassicResource | null {
  const stocked = CLASSIC_RESOURCES.filter(r => state.bank[r] > 0);
  return stocked.length ? stocked[Math.floor(random() * stocked.length)]! : null;
}

export const santaHandlers: Pick<Handlers, 'send-santa'> = {
  /** The roller sends Santa to a building in another player's network (santaNetworks); its owner gets the card. */
  'send-santa'({ next, player, playerId, random }, action) {
    needPhase(next, 'santa');
    requireRule(santaTargets(next, playerId).includes(action.vertexId), 'Choose another player’s settlement or city.');
    const targetId = next.buildings[action.vertexId]!.playerId;
    const target = next.players.find(p => p.id === targetId)!;
    const resource = giftFrom(next, random);
    next.phase = 'build';
    if (!resource) {
      addLog(next, `Santa visited ${target.name}, but the bank had nothing left to give.`);
      return;
    }
    next.bank[resource]--;
    target.resources[resource]++;
    tally(next, targetId, 'cardsIn', 'santa', 1);
    addLog(next, `${player.name} sent Santa to ${target.name}, who got one ${logName(next.settings, resource)}.`, {
      kind: 'santa',
      playerId,
      targetId,
      vertexId: action.vertexId,
      resource,
    });
  },
};
