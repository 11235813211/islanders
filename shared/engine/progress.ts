// Cities & Knights progress cards: one handler, one small function per card.
import { removePiece } from '../crossings';
import { KNIGHTS_COSTS, KNIGHTS_LIMITS, PROGRESS, type ProgressKind } from '../knights';
import { victoryPoints } from '../rules';
import { boardIndex } from '../seafaring';
import {
  CLASSIC_RESOURCES,
  COMMODITIES,
  type Commodity,
  type GameAction,
  type GameState,
  type Player,
  type Resource,
} from '../types';
import {
  type ActionContext,
  addBag,
  addLog,
  emptyBag,
  type Handlers,
  handSize,
  ownBoard,
  pay,
  pieceCounts,
  pieceLimits,
  requireRule,
  resourceCount,
  tally,
} from './core';
import { chaseKnight, robberLocked } from './knights';
import { knightMoves, knightSites } from './knights-legal';
import { roadSites } from './legal';
import { performRoll } from './turn';

type Play = Extract<GameAction, { type: 'play-progress' }>;

/** Move one card of `kind` from one player to another, if they have it. */
function takeCard(from: Player, to: Player, kind: Resource): boolean {
  if (from.resources[kind] <= 0) return false;
  from.resources[kind]--;
  to.resources[kind]++;
  return true;
}

/** One card at random from a hand (resources and commodities), or null when it is empty. */
function randomCard(player: Player, random: () => number): Resource | null {
  const total = resourceCount(player.resources);
  if (!total) return null;
  let pick = Math.floor(random() * total);
  for (const [kind, count] of Object.entries(player.resources) as [Resource, number][]) {
    if (pick < count) return kind;
    pick -= count;
  }
  return null;
}

const others = (next: GameState, playerId: string) => next.players.filter(p => p.id !== playerId);
const need = <T>(value: T | undefined, message: string): T => {
  requireRule(value !== undefined, message);
  return value;
};

/** Each card's effect. Checks that are the same for every card are in the handler below. */
const EFFECTS: Record<ProgressKind, (ctx: ActionContext, action: Play) => void> = {
  alchemist(ctx, action) {
    const red = need(action.red, 'Choose the red die.');
    const yellow = need(action.yellow, 'Choose the yellow die.');
    performRoll(ctx.next, ctx.player, ctx.random, [red, yellow]);
  },
  inventor({ next }, action) {
    const legal = knightMoves(next, next.players[next.turnIndex]!.id).targets.inventor;
    requireRule(
      action.hexId &&
        action.otherHexId &&
        action.hexId !== action.otherHexId &&
        legal.includes(action.hexId) &&
        legal.includes(action.otherHexId),
      'Choose two different tiles numbered 3, 4, 5, 9, 10, or 11.',
    );
    ownBoard(next);
    const index = boardIndex(next.board);
    const a = index.hex.get(action.hexId!)!;
    const b = index.hex.get(action.otherHexId!)!;
    [a.number, b.number] = [b.number, a.number];
  },
  crane({ next }) {
    next.ck!.crane = true;
  },
  engineer({ next, playerId }, action) {
    requireRule(
      action.vertexId && knightMoves(next, playerId).targets.engineer.includes(action.vertexId),
      'Choose one of your cities without a wall.',
    );
    next.ck!.walls.push(action.vertexId!);
  },
  irrigation: ctx => harvest(ctx, 'wheat'),
  mining: ctx => harvest(ctx, 'ore'),
  medicine({ next, player, playerId }, action) {
    requireRule(
      action.vertexId && knightMoves(next, playerId).targets.medicine.includes(action.vertexId),
      'Choose one of your settlements.',
    );
    pay(next, player, KNIGHTS_COSTS.medicine);
    next.buildings[action.vertexId!] = { playerId, kind: 'city' };
    tally(next, playerId, 'built', 'city');
  },
  printer() {},
  constitution() {},
  'road-building'({ next, playerId }) {
    const left = pieceLimits(next, playerId).roads - pieceCounts(next, playerId).roads;
    requireRule(left > 0 && roadSites(next, playerId, false).length, 'No roads can be placed.');
    next.resumePhase = 'build';
    next.phase = 'free-roads';
    next.freeRoads = Math.min(2, left);
  },
  smith({ next }) {
    next.ck!.smith = 2;
  },
  'commercial-harbor'({ next, player, playerId, random }, action) {
    const resource = need(action.resource, 'Choose the resource you give.');
    requireRule(CLASSIC_RESOURCES.includes(resource as never), 'Choose a resource to give.');
    for (const other of others(next, playerId)) {
      const held = COMMODITIES.filter(c => other.resources[c] > 0);
      if (!held.length || player.resources[resource] <= 0) continue;
      const commodity = held[Math.floor(random() * held.length)]!;
      takeCard(player, other, resource);
      takeCard(other, player, commodity);
    }
  },
  'master-merchant'({ next, player, playerId, random }, action) {
    requireRule(
      action.playerId && knightMoves(next, playerId).targets.richer.includes(action.playerId),
      'Choose a player with more points than you.',
    );
    const victim = next.players.find(p => p.id === action.playerId)!;
    for (let i = 0; i < 2; i++) {
      const card = randomCard(victim, random);
      if (card) takeCard(victim, player, card);
    }
  },
  merchant({ next, playerId }, action) {
    requireRule(
      action.hexId && knightMoves(next, playerId).targets.merchant.includes(action.hexId),
      'Choose a resource tile beside one of your settlements or cities.',
    );
    next.ck!.merchant = { hexId: action.hexId!, playerId };
  },
  'merchant-fleet'({ next }, action) {
    const kind = need(action.resource, 'Choose the card kind to trade 2:1.');
    requireRule([...CLASSIC_RESOURCES, ...COMMODITIES].includes(kind as never), 'Choose a resource or commodity.');
    next.ck!.fleet = kind;
  },
  'resource-monopoly'({ next, player, playerId }, action) {
    const resource = need(action.resource, 'Choose a resource.');
    requireRule(CLASSIC_RESOURCES.includes(resource as never), 'Choose a resource.');
    for (const other of others(next, playerId)) for (let i = 0; i < 2; i++) takeCard(other, player, resource);
  },
  'trade-monopoly'({ next, player, playerId }, action) {
    const commodity = need(action.resource, 'Choose a commodity.');
    requireRule(COMMODITIES.includes(commodity as Commodity), 'Choose a commodity.');
    for (const other of others(next, playerId)) takeCard(other, player, commodity);
  },
  bishop({ next }) {
    requireRule(!robberLocked(next), 'The robber stays put until the barbarians first land.');
    next.ck!.bishop = true;
    next.resumePhase = 'build';
    next.phase = 'robber';
  },
  deserter({ next, playerId }, action) {
    requireRule(
      action.playerId && knightMoves(next, playerId).targets.deserter.includes(action.playerId),
      'Choose an opponent with a knight.',
    );
    const ck = next.ck!;
    // The weakest knight goes: lowest strength, inactive before active.
    const [vertex, knight] = Object.entries(ck.knights)
      .filter(([, k]) => k.playerId === action.playerId)
      .sort(([, a], [, b]) => a.level - b.level || Number(a.active) - Number(b.active))[0]!;
    delete ck.knights[vertex];
    const level = knight.level;
    const placed = Object.values(ck.knights).filter(k => k.playerId === playerId && k.level === level).length;
    const fits = placed < KNIGHTS_LIMITS.knightsPerLevel && knightSites(next, playerId).length > 0;
    if (fits) {
      ck.pendingKnight = level;
      next.phase = 'place-knight';
    }
  },
  diplomat({ next, playerId }, action) {
    requireRule(
      action.edgeId && knightMoves(next, playerId).targets.diplomat.includes(action.edgeId),
      'Choose a road with a free end.',
    );
    const owner = next.roads[action.edgeId!]!;
    removePiece(next, owner, action.edgeId!);
    if (owner === playerId && roadSites(next, playerId, false).length) {
      next.resumePhase = 'build';
      next.phase = 'free-roads';
      next.freeRoads = 1;
    }
  },
  intrigue({ next, playerId }, action) {
    requireRule(
      action.vertexId && knightMoves(next, playerId).targets.intrigue.includes(action.vertexId),
      'Choose an opponent’s knight on one of your roads.',
    );
    chaseKnight(next, action.vertexId!);
  },
  saboteur({ next, playerId }) {
    const mine = victoryPoints(next, playerId, false);
    next.pendingDiscards = {};
    for (const other of others(next, playerId)) {
      const cards = handSize(next, other);
      if (victoryPoints(next, other.id, false) >= mine && cards >= 2)
        next.pendingDiscards[other.id] = Math.floor(cards / 2);
    }
    if (Object.keys(next.pendingDiscards).length) {
      next.ck!.sabotage = true;
      next.phase = 'discard';
    }
  },
  spy({ next, playerId, random }, action) {
    requireRule(
      action.playerId && knightMoves(next, playerId).targets.spy.includes(action.playerId),
      'Choose an opponent with progress cards.',
    );
    const ck = next.ck!;
    const theirs = ck.hands[action.playerId!]!;
    const [card] = theirs.splice(Math.floor(random() * theirs.length), 1);
    if (card && ck.hands[playerId]!.length < KNIGHTS_LIMITS.hand) ck.hands[playerId]!.push(card);
    else if (card) theirs.push(card);
  },
  warlord({ next, playerId }) {
    for (const knight of Object.values(next.ck!.knights))
      if (knight.playerId === playerId && !knight.active) {
        knight.active = true;
        knight.activeTurn = next.turn;
      }
  },
  wedding({ next, playerId }) {
    const mine = victoryPoints(next, playerId, false);
    const gifts: Record<string, number> = {};
    for (const other of others(next, playerId)) {
      const cards = resourceCount(other.resources);
      if (victoryPoints(next, other.id, false) > mine && cards) gifts[other.id] = Math.min(2, cards);
    }
    next.ck!.gifts = gifts;
    if (Object.keys(gifts).length) next.phase = 'gift';
  },
};

/** Irrigation and Mining: 2 of the resource for each tile of it beside your buildings, as the bank allows. */
function harvest({ next, player, playerId }: ActionContext, resource: 'wheat' | 'ore'): void {
  const terrain = resource === 'wheat' ? 'wheat' : 'ore';
  const tiles = next.board.hexes.filter(
    h => h.terrain === terrain && h.vertexIds.some(v => next.buildings[v]?.playerId === playerId),
  ).length;
  const amount = Math.min(tiles * 2, next.bank[resource]);
  next.bank[resource] -= amount;
  addBag(player, { ...emptyBag(), [resource]: amount });
  tally(next, playerId, 'cardsIn', 'plenty', amount);
}

export const progressHandlers: Pick<Handlers, 'play-progress'> = {
  'play-progress'(ctx, action) {
    const { next, player, playerId } = ctx;
    requireRule(next.ck, 'This game is played without Cities & Knights.');
    const hand = next.ck.hands[playerId] ?? [];
    const index = hand.findIndex(c => c.id === action.cardId);
    requireRule(index >= 0, 'Choose one of your progress cards.');
    requireRule(
      knightMoves(next, playerId).playable.includes(action.cardId),
      hand[index]!.kind === 'alchemist' ? 'Play the Alchemist before you roll.' : 'That card can’t be played now.',
    );
    const [card] = hand.splice(index, 1);
    const info = PROGRESS[card!.kind];
    // The log line goes first, so it sits before what the card does (an Alchemist's roll).
    addLog(next, `${player.name} played ${info.name}.`);
    EFFECTS[card!.kind](ctx, action);
  },
};
