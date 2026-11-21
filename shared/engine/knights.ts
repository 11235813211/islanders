// Cities & Knights: the parts of the expansion that run by themselves (setup, the event die,
// barbarians, progress draws, metropolises, chased knights). Player moves are in knights-actions.ts
// and progress.ts; what each seat may do is in knights-legal.ts.
import { shuffled } from '../board';
import {
  activeStrength,
  barbarianStrength,
  EVENT_FACES,
  KNIGHTS_LIMITS,
  type KnightsState,
  PROGRESS,
  PROGRESS_KINDS,
  type ProgressCard,
  TRACKS,
  type Track,
} from '../knights';
import { DEFAULT_SETUP } from '../maps/special';
import { hexNumbers } from '../rules';
import { boardIndex } from '../seafaring';
import { CLASSIC_RESOURCES, type GameState, type ResourceBag } from '../types';
import { addLog, ownBoard, pieceCounts, pieceLimits, resourceCount } from './core';

/** Cities & Knights is on in this game. */
export const knightsRules = (state: Pick<GameState, 'ck'>): boolean => !!state.ck;

const noTracks = (): Record<Track, number> => ({ trade: 0, politics: 0, science: 0 });

/** A fresh expansion state: shuffled progress decks and nobody's improvements yet. */
export function newKnightsState(playerIds: string[], random: () => number): KnightsState {
  const decks = Object.fromEntries(TRACKS.map(t => [t, [] as ProgressCard[]])) as Record<Track, ProgressCard[]>;
  let n = 0;
  for (const kind of PROGRESS_KINDS)
    for (let i = 0; i < PROGRESS[kind].count; i++) decks[PROGRESS[kind].track].push({ id: `pc-${n++}`, kind });
  for (const t of TRACKS) decks[t] = shuffled(decks[t], random);
  return {
    knights: {},
    improvements: Object.fromEntries(playerIds.map(id => [id, noTracks()])),
    metropolis: { trade: null, politics: null, science: null },
    walls: [],
    barbarian: 0,
    attacks: 0,
    event: null,
    defender: {},
    cardPoints: {},
    merchant: null,
    fleet: null,
    smith: 0,
    crane: false,
    gifts: {},
    pendingKnight: null,
    lastAttack: null,
    decks,
    hands: Object.fromEntries(playerIds.map(id => [id, []])),
    sabotage: false,
    bishop: false,
  };
}

/**
 * At the start: the deck of progress cards, the commodities in the bank (see bankFor), and a city
 * as each player's second starting piece (on maps that don't set their own start).
 */
export function startKnights(next: GameState, random: () => number): void {
  if (!next.settings.citiesKnights) {
    next.ck = null;
    return;
  }
  next.ck = newKnightsState(
    next.players.map(p => p.id),
    random,
  );
  next.developmentDeck = [];
  const setup = next.board.rules?.setup;
  if (!setup || setup.join() === DEFAULT_SETUP.join()) {
    ownBoard(next);
    next.board.rules = { ...next.board.rules, setup: ['settlement', 'city'] };
  }
}

/** Your level on a track. */
export const levelOf = (ck: Pick<KnightsState, 'improvements'>, playerId: string, track: Track): number =>
  ck.improvements[playerId]?.[track] ?? 0;

/** Cards a player may hold on a 7: the room's limit plus 2 for each of their city walls. */
export function discardLimit(state: GameState, playerId: string): number {
  const walls = state.ck?.walls.filter(v => state.buildings[v]?.playerId === playerId).length ?? 0;
  return state.settings.discardLimit + walls * KNIGHTS_LIMITS.wallCards;
}

/** Where a 7's discards lead: the robber, or back to building (Saboteur, or before the first attack). */
export function afterDiscards(next: GameState): GameState['phase'] {
  if (!next.ck) return 'robber';
  const back = next.ck.sabotage || !next.ck.attacks;
  next.ck.sabotage = false;
  return back ? 'build' : 'robber';
}

/** The robber stays on its tile until the barbarians first land. */
export const robberLocked = (state: Pick<GameState, 'ck'>): boolean => !!state.ck && state.ck.attacks === 0;

/**
 * Roll and resolve the event die before the roll pays out: the barbarian ship sails on (and may
 * land), or a city gate hands progress cards to everyone whose level in its color covers the red die.
 */
export function resolveEventDie(next: GameState, red: number, rollerId: string, random: () => number): void {
  const ck = next.ck!;
  const face = EVENT_FACES[Math.floor(random() * EVENT_FACES.length)]!;
  ck.event = face;
  if (face === 'ship') {
    ck.barbarian++;
    if (ck.barbarian >= KNIGHTS_LIMITS.barbarianDistance) barbarianAttack(next, random);
    else addLog(next, `The barbarian ship sailed closer (${ck.barbarian} of ${KNIGHTS_LIMITS.barbarianDistance}).`);
    return;
  }
  const seat = next.players.findIndex(p => p.id === rollerId);
  const order = next.players.map((_, i) => next.players[(seat + i) % next.players.length]!);
  const drew: string[] = [];
  for (const player of order) {
    const level = levelOf(ck, player.id, face);
    if (level > 0 && red <= level + 1 && drawProgress(next, player.id, face)) drew.push(player.name);
  }
  const gate = `The ${PROGRESS_TRACK_NAMES[face]} gate opened on a red ${red}`;
  addLog(next, drew.length ? `${gate}: ${drew.join(', ')} drew progress cards.` : `${gate}: nobody drew.`);
}

const PROGRESS_TRACK_NAMES: Record<Track, string> = { trade: 'yellow', politics: 'blue', science: 'green' };

/**
 * Draw the top progress card of a track. Point cards are shown and scored at once. With a full
 * hand (four cards) the card stays in the deck. Returns whether a card was drawn.
 */
export function drawProgress(next: GameState, playerId: string, track: Track): boolean {
  const ck = next.ck!;
  const hand = ck.hands[playerId] ?? [];
  if (!ck.decks[track].length || hand.length >= KNIGHTS_LIMITS.hand) return false;
  const card = ck.decks[track].pop()!;
  if (PROGRESS[card.kind].target === 'points') {
    ck.cardPoints[playerId] = (ck.cardPoints[playerId] ?? 0) + 1;
    const name = next.players.find(p => p.id === playerId)!.name;
    addLog(next, `${name} drew ${PROGRESS[card.kind].name}: 1 victory point.`);
    return true;
  }
  ck.hands[playerId] = [...hand, card];
  return true;
}

/** Production a building's corner sees, in dice combinations out of 36 (for the game's own picks). */
function cornerOdds(state: GameState, vertexId: string): number {
  const index = boardIndex(state.board);
  let odds = 0;
  for (const hexId of index.vertex.get(vertexId)!.hexIds)
    for (const n of hexNumbers(index.hex.get(hexId)!)) odds += 6 - Math.abs(7 - n);
  return odds;
}

/**
 * The barbarians land. Every active knight on the island defends against one strength for each
 * city. Win: the single strongest defender earns a Defender of Catan point (a tie draws progress
 * cards instead). Lose: whoever put up the least among players with a plain city loses one. Then
 * all knights go inactive, and from now on the robber may move.
 */
export function barbarianAttack(next: GameState, random: () => number): void {
  const ck = next.ck!;
  const strength = barbarianStrength(next.buildings);
  const knights = Object.fromEntries(next.players.map(p => [p.id, activeStrength(ck, p.id)]));
  const defense = Object.values(knights).reduce((n, k) => n + k, 0);
  const won = defense >= strength;
  const defenders: string[] = [];
  const losers: string[] = [];
  const name = (id: string) => next.players.find(p => p.id === id)!.name;
  if (won) {
    const best = Math.max(0, ...Object.values(knights));
    const top = best > 0 ? next.players.filter(p => knights[p.id] === best).map(p => p.id) : [];
    defenders.push(...top);
    if (top.length === 1) {
      ck.defender[top[0]!] = (ck.defender[top[0]!] ?? 0) + 1;
      addLog(
        next,
        `The knights held off the barbarians (${defense} against ${strength}). ${name(top[0]!)} is Defender of Catan: 1 point.`,
      );
    } else {
      for (const id of top) drawProgress(next, id, favoriteTrack(next, id, random));
      addLog(
        next,
        top.length
          ? `The knights held off the barbarians (${defense} against ${strength}). ${top.map(name).join(', ')} tied and drew progress cards.`
          : 'The barbarians found no cities to attack.',
      );
    }
  } else {
    const exposed = next.players.filter(p => plainCities(next, p.id).length > 0);
    const least = Math.min(...exposed.map(p => knights[p.id]!));
    for (const p of exposed.filter(p => knights[p.id] === least)) {
      losers.push(p.id);
      reduceCity(next, cityToLose(next, p.id));
    }
    addLog(
      next,
      `The barbarians won (${strength} against ${defense}). ${losers.map(name).join(', ') || 'Nobody'} lost a city.`,
    );
  }
  for (const knight of Object.values(ck.knights)) knight.active = false;
  ck.barbarian = 0;
  ck.attacks++;
  ck.lastAttack = { turn: next.turn, strength, defense, knights, won, defenders, losers };
}

/** A player's cities without a metropolis (the ones barbarians can take). */
function plainCities(state: GameState, playerId: string): string[] {
  const held = new Set(Object.values(state.ck!.metropolis));
  return Object.entries(state.buildings)
    .filter(([v, b]) => b.playerId === playerId && b.kind === 'city' && !held.has(v))
    .map(([v]) => v);
}

/** The city a player loses: one without a wall first, then the one that earns least. */
function cityToLose(state: GameState, playerId: string): string {
  const walls = new Set(state.ck!.walls);
  return plainCities(state, playerId).sort(
    (a, b) => Number(walls.has(a)) - Number(walls.has(b)) || cornerOdds(state, a) - cornerOdds(state, b),
  )[0]!;
}

/** A city drops to a settlement (losing its wall); with no settlement left in supply it is lost. */
export function reduceCity(next: GameState, vertexId: string): void {
  const building = next.buildings[vertexId]!;
  next.ck!.walls = next.ck!.walls.filter(v => v !== vertexId);
  const stock = pieceCounts(next, building.playerId).settlements < pieceLimits(next, building.playerId).settlements;
  if (stock) building.kind = 'settlement';
  else delete next.buildings[vertexId];
}

/** The track a tied defender draws from: their highest, or at random among equals. */
function favoriteTrack(state: GameState, playerId: string, random: () => number): Track {
  const ck = state.ck!;
  const open = TRACKS.filter(t => ck.decks[t].length);
  const best = Math.max(...open.map(t => levelOf(ck, playerId, t)));
  const choices = open.filter(t => levelOf(ck, playerId, t) === best);
  return choices[Math.floor(random() * choices.length)] ?? 'science';
}

/**
 * Who holds each metropolis after an improvement: the first to reach level 4 takes it, and the
 * first to reach 5 takes it from a holder still below 5. It sits on one of the holder's cities
 * without a metropolis (the one that earns most).
 */
export function updateMetropolis(next: GameState, playerId: string, track: Track): void {
  const ck = next.ck!;
  const level = levelOf(ck, playerId, track);
  if (level < 4) return;
  const at = ck.metropolis[track];
  const holder = at ? next.buildings[at]?.playerId : null;
  if (holder === playerId) return;
  if (holder && !(level === 5 && levelOf(ck, holder, track) < 5)) return;
  const city = plainCities(next, playerId).sort((a, b) => cornerOdds(next, b) - cornerOdds(next, a))[0];
  if (!city) return;
  ck.metropolis[track] = city;
  const name = next.players.find(p => p.id === playerId)!.name;
  addLog(next, `${name} built the ${track} metropolis${holder ? ', taking it over' : ''}.`);
}

/** Does this player have a city that could take the metropolis an improvement would give? */
export const hasPlainCity = (state: GameState, playerId: string): boolean => plainCities(state, playerId).length > 0;

/**
 * A knight that is chased away moves along its owner's roads to the nearest open corner, keeping
 * its strength and state; with nowhere to go it leaves the board.
 */
export function chaseKnight(next: GameState, vertexId: string): void {
  const ck = next.ck!;
  const knight = ck.knights[vertexId]!;
  delete ck.knights[vertexId];
  const spot = knightReach(next, knight.playerId, vertexId, true)[0];
  const name = next.players.find(p => p.id === knight.playerId)!.name;
  if (spot) {
    ck.knights[spot] = knight;
    addLog(next, `${name}'s knight was chased away and moved along their roads.`);
  } else addLog(next, `${name}'s knight was chased away and had nowhere to go.`);
}

/**
 * Open corners a player's knight can reach from `from` along the player's own roads, nearest
 * first. It can't pass other players' buildings or knights. With `empty`, only open corners;
 * otherwise also corners holding a weaker opponent knight (which would be chased away).
 */
export function knightReach(
  state: Pick<GameState, 'board' | 'roads' | 'buildings' | 'ck'>,
  playerId: string,
  from: string,
  empty: boolean,
): string[] {
  const ck = state.ck!;
  const index = boardIndex(state.board);
  const level = ck.knights[from]?.level ?? 0;
  const seen = new Set([from]);
  const queue = [from];
  const found: string[] = [];
  while (queue.length) {
    const v = queue.shift()!;
    for (const edgeId of index.vertex.get(v)!.edgeIds) {
      if (state.roads[edgeId] !== playerId) continue;
      const edge = index.edge.get(edgeId)!;
      const to = edge.a === v ? edge.b : edge.a;
      if (seen.has(to)) continue;
      seen.add(to);
      const building = state.buildings[to];
      const knight = ck.knights[to];
      if (building && building.playerId !== playerId) continue;
      if (knight) {
        if (!empty && knight.playerId !== playerId && knight.level < level) found.push(to);
        continue;
      }
      if (!building) found.push(to);
      queue.push(to);
    }
  }
  return found;
}

/** Turn bookkeeping that ends with the turn: Merchant Fleet, Smith, and Crane. */
export function endKnightsTurn(next: GameState): void {
  if (!next.ck) return;
  next.ck.fleet = null;
  next.ck.smith = 0;
  next.ck.crane = false;
}

/**
 * Science 3 (aqueduct): after a roll that paid you nothing, choose any resource. It is owed as a
 * gold choice, so the gold panel and clock handle it.
 */
export function aqueduct(next: GameState, gains: Record<string, ResourceBag>): void {
  const ck = next.ck!;
  for (const player of next.players) {
    if (levelOf(ck, player.id, 'science') < 3) continue;
    const got = gains[player.id];
    if ((got && resourceCount(got)) || next.pendingGold[player.id]) continue;
    if (!CLASSIC_RESOURCES.some(r => next.bank[r] > 0)) continue;
    next.pendingGold[player.id] = 1;
    addLog(next, `${player.name}'s aqueduct pays a resource of their choice.`);
  }
}
