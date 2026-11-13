import { describe, expect, it } from 'vitest';
import { chooseBotAction } from '../shared/bots';
import { advanceTime, applyAction, botDueAt, getActivePlayerId, getView } from '../shared/engine';
import { pendingBotActor } from '../shared/engine/time';
import type { GameState, Terrain } from '../shared/types';
import { grant, makeLobby, seaLobby, seeded, TEST_NOW, testDesign } from './fixtures';

/**
 * Targeted checks of the Advanced bot's choices, on a small sea map: home island on the left,
 * a two-tile wheat isle on the right with sea between (see tests/sea-rules.test.ts).
 */
const DESIGN = testDesign([
  '~ ~ ~ ~ ~ ~ ~',
  ' ~ w6 b5 ~ ~ h3*! ~',
  '~ s9 o10 ~ ~ h3 ~',
  ' ~ g8 v4 j11 ~@ ~ ~',
  '~ ~ ~ ~ ~ ~ ~',
]);

const grantBag = () => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, lodestone: 0 });
const hexOf = (g: GameState, terrain: Terrain) => g.board.hexes.find(h => h.terrain === terrain)!;

/** p0 is about to move the robber or pirate; the setup callback places pieces directly. */
function robberTurn(setup: (g: GameState) => void): GameState {
  const g = applyAction(seaLobby(DESIGN, 3), 'p0', { type: 'start' }, seeded(), TEST_NOW);
  Object.assign(g, { phase: 'robber', turn: 12, turnIndex: 0, setupIndex: 6, rollDeadline: null });
  g.pirate = null;
  g.buildings[hexOf(g, 'wood').vertexIds[2]!] = { playerId: 'p0', kind: 'settlement' };
  setup(g);
  return g;
}

/** Sea hexes touching a corner, and the ship edges of a sea hex that touch that corner. */
function seaBeside(g: GameState, vertexId: string) {
  const sea = g.board.hexes.find(h => h.terrain === 'sea' && h.vertexIds.includes(vertexId))!;
  const edges = g.board.edges.filter(e => sea.vertexIds.includes(e.a) && sea.vertexIds.includes(e.b));
  return { sea, edges };
}

describe('advanced robber and pirate', () => {
  it('sends the pirate after the leader racing by ship, not the robber onto a poor tile', () => {
    let target = '';
    const g = robberTurn(g => {
      // p1 leads, has one settlement on the poor wheat isle, and two ships beside it.
      const corner = hexOf(g, 'wheat').vertexIds[3]!;
      g.buildings[corner] = { playerId: 'p1', kind: 'settlement' };
      const { sea, edges } = seaBeside(g, corner);
      for (const e of edges.slice(0, 2)) g.ships[e.id] = 'p1';
      target = sea.id;
      g.bonusPoints.p1 = 4;
      grant(g, 'p1', { wood: 2, ore: 2 });
    });
    expect(chooseBotAction(getView(g, 'p0'), { level: 'advanced' })).toEqual({ type: 'move-robber', hexId: target });
  });

  it('puts the robber on the leader’s city on a good number rather than chasing a lone ship', () => {
    const g = robberTurn(g => {
      const ore = hexOf(g, 'ore');
      g.buildings[ore.vertexIds[0]!] = { playerId: 'p1', kind: 'city' };
      g.bonusPoints.p1 = 4;
      grant(g, 'p1', { wheat: 3 });
      // p2, far behind, has one ship out at sea.
      const corner = hexOf(g, 'wheat').vertexIds[3]!;
      g.ships[seaBeside(g, corner).edges[0]!.id] = 'p2';
      grant(g, 'p2', { wood: 1 });
    });
    expect(chooseBotAction(getView(g, 'p0'), { level: 'advanced' })).toEqual({
      type: 'move-robber',
      hexId: hexOf(g, 'ore').id,
    });
  });

  it('never blocks its own tile when another choice hurts an opponent', () => {
    const g = robberTurn(g => {
      g.buildings[hexOf(g, 'brick').vertexIds[0]!] = { playerId: 'p2', kind: 'settlement' };
      grant(g, 'p2', { sheep: 1 });
    });
    const action = chooseBotAction(getView(g, 'p0'), { level: 'advanced' });
    expect(action.type).toBe('move-robber');
    expect(action).not.toEqual({ type: 'move-robber', hexId: hexOf(g, 'wood').id });
  });
});

describe('advanced trading with people at the table', () => {
  it('does not counter the same person again within two rounds', () => {
    const random = seeded(5);
    let g = makeLobby(4);
    for (const p of g.players.slice(1)) p.bot = 'advanced';
    g = applyAction(g, 'p0', { type: 'start' }, random, TEST_NOW);
    let now = TEST_NOW;
    const counters = new Map<number, (typeof g.log)[number]>();
    let offeredTurn = -1;
    for (let step = 0; step < 6000 && g.phase !== 'finished' && g.turn < 150; step++) {
      for (const e of g.log) if (e.event?.kind === 'counter') counters.set(e.id, e);
      const bot = pendingBotActor(g);
      if (bot) {
        now = Math.max(now, botDueAt(g)!);
        g = advanceTime(g, now, random);
        continue;
      }
      // The person asks everyone for one of each card they lack, every turn, and never accepts.
      const me = g.players[0]!;
      const spare = (['wood', 'brick', 'sheep', 'wheat', 'ore'] as const).find(r => me.resources[r] > 0);
      const lack = (['ore', 'wheat', 'sheep', 'brick', 'wood'] as const).find(r => r !== spare);
      let action: Parameters<typeof applyAction>[2];
      if (g.tradeOffer?.fromId === 'p0') action = { type: 'cancel-trade', offerId: g.tradeOffer.id };
      else if (g.phase === 'build' && getActivePlayerId(g) === 'p0' && spare && lack && offeredTurn !== g.turn) {
        offeredTurn = g.turn;
        action = { type: 'offer-trade', give: { ...grantBag(), [spare]: 1 }, want: { ...grantBag(), [lack]: 1 } };
      } else action = chooseBotAction(getView(g, getActivePlayerId(g) ?? 'p0'), { level: 'beginner' });
      try {
        g = applyAction(g, getActivePlayerId(g) ?? 'p0', action, random, now);
      } catch {
        now += 200_000;
        g = advanceTime(g, now, random);
      }
    }
    const toPerson = [...counters.values()].filter(e => e.event?.kind === 'counter' && e.event.toId === 'p0');
    expect(toPerson.length).toBeGreaterThan(0);
    const last = new Map<string, number>();
    for (const e of toPerson.sort((a, b) => a.id - b.id)) {
      const from = (e.event as { playerId: string }).playerId;
      const before = last.get(from);
      if (before !== undefined) expect(e.turn! - before).toBeGreaterThanOrEqual(2 * 4);
      last.set(from, e.turn!);
    }
  });

  it('offers at most once per turn, and asks a person at most every third round', () => {
    const random = seeded(11);
    let g = makeLobby(4);
    for (const p of g.players.slice(1)) p.bot = 'advanced';
    g = applyAction(g, 'p0', { type: 'start' }, random, TEST_NOW);
    let now = TEST_NOW;
    // The log keeps only its last lines, so gather offers as they happen.
    const seen = new Map<number, (typeof g.log)[number]>();
    for (let step = 0; step < 4000 && g.phase !== 'finished' && g.turn < 120; step++) {
      for (const e of g.log) if (e.event?.kind === 'offer') seen.set(e.id, e);
      const bot = pendingBotActor(g);
      if (bot) {
        now = Math.max(now, botDueAt(g)!);
        g = advanceTime(g, now, random);
        continue;
      }
      // The person: plays simply, and turns down every offer.
      const offer = g.tradeOffer;
      const id = offer && offer.to.includes('p0') ? 'p0' : (getActivePlayerId(g) ?? 'p0');
      const action = offer?.to.includes('p0')
        ? { type: 'decline-trade' as const, offerId: offer.id }
        : chooseBotAction(getView(g, id), { level: 'beginner' });
      try {
        g = applyAction(g, id, action, random, now);
      } catch {
        now += 200_000;
        g = advanceTime(g, now, random);
      }
    }
    const offers = [...seen.values()];
    expect(offers.length).toBeGreaterThan(0);
    const byTurn = new Map<string, number>();
    for (const e of offers) {
      const key = `${e.turn}:${(e.event as { playerId: string }).playerId}`;
      byTurn.set(key, (byTurn.get(key) ?? 0) + 1);
    }
    expect(Math.max(0, ...byTurn.values())).toBeLessThanOrEqual(1);
    // Asked: offers that include the person, per bot, at least 3 rounds (12 turns) apart.
    for (const bot of ['p1', 'p2', 'p3']) {
      const turns = offers
        .filter(e => {
          const ev = e.event as { playerId: string; to?: string[] };
          return ev.playerId === bot && ev.to?.includes('p0');
        })
        .map(e => e.turn!);
      for (let i = 1; i < turns.length; i++) expect(turns[i]! - turns[i - 1]!).toBeGreaterThanOrEqual(12);
    }
  }, 60_000);
});
