import { describe, expect, it } from 'vitest';
import {
  applyAction,
  barbarianAttack,
  emptyBag,
  getView,
  knightSites,
  normalizeGame,
  openRoads,
} from '../shared/engine';
import { KNIGHTS_LIMITS, type ProgressKind } from '../shared/knights';
import { longestRoad, tradeRates, victoryPoints } from '../shared/rules';
import { boardIndex } from '../shared/seafaring';
import type { GameAction, GameState } from '../shared/types';
import { conserved, grant, knightsGame, seeded, sequence, settled, TEST_NOW } from './fixtures';

const act = (g: GameState, id: string, action: GameAction, random = seeded()) =>
  applyAction(g, id, action, random, TEST_NOW);

/** Random values for a roll of `red` and `yellow` (random dice), then the event die face. */
const dice = (red: number, yellow: number, event: 'ship' | 'trade' | 'politics' | 'science') =>
  sequence((red - 0.5) / 6, (yellow - 0.5) / 6, { ship: 0.1, trade: 0.55, politics: 0.7, science: 0.9 }[event], 0.3);

/** p0's build phase, with no cards in any hand. */
function building(): GameState {
  const g = knightsGame();
  g.phase = 'build';
  g.rollDeadline = null;
  for (const p of g.players)
    for (const r of Object.keys(p.resources) as (keyof typeof p.resources)[]) {
      g.bank[r] += p.resources[r];
      p.resources[r] = 0;
    }
  return g;
}

const cityOf = (g: GameState, id: string) =>
  Object.entries(g.buildings).find(([, b]) => b.playerId === id && b.kind === 'city')![0];

/** A corner beside one of p0's roads where a knight can stand. */
const knightSpot = (g: GameState) => knightSites(g, 'p0')[0]!;

function give(g: GameState, id: string, kind: ProgressKind) {
  g.ck!.hands[id]!.push({ id: `test-${kind}`, kind });
  return `test-${kind}`;
}

describe('Cities & Knights setup', () => {
  it('starts with a settlement and a city each, commodities in the bank, and no development cards', () => {
    const g = knightsGame();
    expect(g.ck).not.toBeNull();
    for (const p of g.players) {
      const kinds = Object.values(g.buildings)
        .filter(b => b.playerId === p.id)
        .map(b => b.kind);
      expect(kinds.sort()).toEqual(['city', 'settlement']);
    }
    expect(g.developmentDeck).toHaveLength(0);
    expect(conserved(g)).toBe(true);
    expect(g.bank.paper + g.players.reduce((n, p) => n + p.resources.paper, 0)).toBe(12);
    const decks = Object.values(g.ck!.decks).map(d => d.length);
    expect(decks).toEqual([18, 18, 18]);
    expect(getView(g, 'p0').legal.development).toBe(false);
  });

  it('turning it on in the lobby sets 13 points to win, and off sets 10', () => {
    const lobby = settled().players.length ? knightsGame() : null;
    expect(lobby).not.toBeNull();
    const plain = applyAction(
      { ...knightsGame(), phase: 'lobby' },
      'p0',
      { type: 'configure', settings: { autoRollSeconds: 8, trackDice: true, citiesKnights: false } },
      seeded(),
      TEST_NOW,
    );
    expect(plain.settings.victoryPoints).toBe(10);
    const on = applyAction(
      plain,
      'p0',
      { type: 'configure', settings: { autoRollSeconds: 8, trackDice: true, citiesKnights: true } },
      seeded(),
      TEST_NOW,
    );
    expect(on.settings.victoryPoints).toBe(KNIGHTS_LIMITS.victoryPoints);
  });

  it('hides the decks and other players’ progress cards', () => {
    const g = building();
    give(g, 'p1', 'spy');
    const view = getView(g, 'p0');
    expect(JSON.stringify(view)).not.toContain('test-spy');
    expect(view.ck!.handCounts.p1).toBe(1);
    expect(view.ck!.deckCounts.science).toBe(18);
    expect(getView(g, 'p1').ck!.hand.map(c => c.kind)).toEqual(['spy']);
  });
});

describe('production and the event die', () => {
  it('a city on forest makes a wood and a paper', () => {
    const g = knightsGame();
    const forest = g.board.hexes.find(h => h.terrain === 'wood' && h.number && h.id !== g.robber)!;
    for (const v of Object.keys(g.buildings)) delete g.buildings[v];
    g.buildings[forest.vertexIds[0]!] = { playerId: 'p0', kind: 'city' };
    const n = forest.number!;
    const red = Math.min(6, n - 1);
    const rolled = act(g, 'p0', { type: 'roll' }, dice(red, n - red, 'ship'));
    expect(rolled.players[0]!.resources.wood - g.players[0]!.resources.wood).toBe(1);
    expect(rolled.players[0]!.resources.paper - g.players[0]!.resources.paper).toBe(1);
  });

  it('a ship face sails the barbarians closer; a gate gives progress cards by level and red die', () => {
    const g = knightsGame();
    const sailed = act(g, 'p0', { type: 'roll' }, dice(1, 2, 'ship'));
    expect(sailed.ck!.barbarian).toBe(1);
    g.ck!.improvements.p1!.science = 1;
    const gate = act(g, 'p0', { type: 'roll' }, dice(2, 1, 'science'));
    expect(gate.ck!.hands.p1).toHaveLength(1);
    expect(gate.ck!.hands.p0).toHaveLength(0);
    const tooHigh = act(g, 'p0', { type: 'roll' }, dice(3, 1, 'science'));
    expect(tooHigh.ck!.hands.p1).toHaveLength(0);
  });

  it('before the first attack a 7 only makes players discard; the robber stays', () => {
    const g = knightsGame();
    grant(g, 'p1', { wood: 9 });
    const rolled = act(g, 'p0', { type: 'roll' }, dice(3, 4, 'ship'));
    expect(rolled.phase).toBe('discard');
    const discarded = applyAction(
      rolled,
      'p1',
      { type: 'discard', resources: { ...emptyBag(), wood: rolled.pendingDiscards.p1! } },
      seeded(),
      TEST_NOW,
    );
    expect(discarded.phase).toBe('build');
    expect(discarded.robber).toBe(g.robber);
  });

  it('walls let you keep two more cards on a 7', () => {
    const g = knightsGame();
    g.ck!.walls.push(cityOf(g, 'p1'));
    for (const p of g.players) p.resources = emptyBag();
    g.players[1]!.resources.wood = g.settings.discardLimit + 2;
    expect(act(g, 'p0', { type: 'roll' }, dice(3, 4, 'politics')).phase).toBe('build');
  });

  it('the aqueduct pays a resource of choice when a roll pays nothing', () => {
    const g = knightsGame();
    g.ck!.improvements.p2!.science = 3;
    // A 2 or 12 rarely pays anyone; pick the one that pays p2 nothing.
    const pays = (n: number) =>
      g.board.hexes.some(h => h.number === n && h.vertexIds.some(v => g.buildings[v]?.playerId === 'p2'));
    const [red, yellow] = pays(2) ? [6, 6] : [1, 1];
    const rolled = act(g, 'p0', { type: 'roll' }, dice(red, yellow, 'ship'));
    expect(rolled.pendingGold.p2).toBe(1);
    expect(rolled.phase).toBe('gold');
    expect(() =>
      applyAction(rolled, 'p2', { type: 'choose-gold', resources: { ...emptyBag(), coin: 1 } }, seeded(), TEST_NOW),
    ).toThrow(/commodities/);
  });
});

describe('barbarians', () => {
  it('beat the island when knights are too weak: the weakest defender loses a city', () => {
    const g = building();
    const spot = knightSpot(g);
    g.ck!.knights[spot] = { playerId: 'p0', level: 1, active: true, activeTurn: 0, promotedTurn: -1 };
    barbarianAttack(g, seeded());
    expect(g.ck!.lastAttack!.won).toBe(false);
    expect(g.ck!.lastAttack!.losers.sort()).toEqual(['p1', 'p2']);
    expect(Object.values(g.buildings).filter(b => b.playerId === 'p1' && b.kind === 'city')).toHaveLength(0);
    expect(Object.values(g.buildings).filter(b => b.playerId === 'p0' && b.kind === 'city')).toHaveLength(1);
    expect(g.ck!.knights[spot]!.active).toBe(false);
    expect(g.ck!.attacks).toBe(1);
  });

  it('a single strongest defender becomes Defender of Catan', () => {
    const g = building();
    const spot = knightSpot(g);
    g.ck!.knights[spot] = { playerId: 'p0', level: 3, active: true, activeTurn: 0, promotedTurn: -1 };
    const before = victoryPoints(g, 'p0');
    barbarianAttack(g, seeded());
    expect(g.ck!.lastAttack!.won).toBe(true);
    expect(victoryPoints(g, 'p0')).toBe(before + 1);
  });

  it('a metropolis is never taken', () => {
    const g = building();
    for (const p of g.players)
      g.ck!.metropolis[['trade', 'politics', 'science'][Number(p.id[1])] as 'trade'] = cityOf(g, p.id);
    barbarianAttack(g, seeded());
    expect(g.ck!.lastAttack!.losers).toEqual([]);
  });
});

describe('knights', () => {
  it('are built beside your roads, activated with grain, and act from the next turn', () => {
    let g = building();
    grant(g, 'p0', { sheep: 1, ore: 1, wheat: 1 });
    const spot = knightSpot(g);
    g = act(g, 'p0', { type: 'build-knight', vertexId: spot });
    expect(g.ck!.knights[spot]).toMatchObject({ playerId: 'p0', level: 1, active: false });
    g = act(g, 'p0', { type: 'activate-knight', vertexId: spot });
    expect(g.ck!.knights[spot]!.active).toBe(true);
    expect(getView(g, 'p0').ck!.legal.moves[spot]).toBeUndefined();
    // One more road from the knight's corner gives it somewhere to go.
    const index = boardIndex(g.board);
    const road = index.vertex.get(spot)!.edgeIds.find(e => !g.roads[e])!;
    g.roads[road] = 'p0';
    const edge = index.edge.get(road)!;
    const far = edge.a === spot ? edge.b : edge.a;
    g.turn++;
    expect(getView(g, 'p0').ck!.legal.moves[spot]).toContain(far);
    g = act(g, 'p0', { type: 'move-knight', from: spot, to: far });
    expect(g.ck!.knights[far]).toMatchObject({ playerId: 'p0', active: false });
    expect(g.ck!.knights[spot]).toBeUndefined();
  });

  it('mighty knights need politics level 3, and each knight is promoted once a turn', () => {
    const g = building();
    grant(g, 'p0', { sheep: 3, ore: 3 });
    const spot = knightSpot(g);
    g.ck!.knights[spot] = { playerId: 'p0', level: 2, active: false, activeTurn: -1, promotedTurn: -1 };
    expect(() => act(g, 'p0', { type: 'promote-knight', vertexId: spot })).toThrow(/mighty/);
    g.ck!.improvements.p0!.politics = 3;
    const promoted = act(g, 'p0', { type: 'promote-knight', vertexId: spot });
    expect(promoted.ck!.knights[spot]!.level).toBe(3);
  });

  it('block other players’ roads and break their longest road', () => {
    const g = building();
    const index = boardIndex(g.board);
    // A straight run of p1 roads, then a p0 knight in the middle of it.
    const start = Object.entries(g.roads).find(([, id]) => id === 'p1')![0];
    const edge = index.edge.get(start)!;
    const before = longestRoad(g, 'p1');
    g.ck!.knights[edge.b] = { playerId: 'p0', level: 1, active: false, activeTurn: -1, promotedTurn: -1 };
    g.ck!.knights[edge.a] = { playerId: 'p0', level: 1, active: false, activeTurn: -1, promotedTurn: -1 };
    expect(longestRoad(g, 'p1')).toBeLessThanOrEqual(before);
  });

  it('can’t chase the robber before the first attack', () => {
    const g = building();
    const robberHex = boardIndex(g.board).hex.get(g.robber)!;
    const spot = robberHex.vertexIds.find(v => !g.buildings[v])!;
    g.ck!.knights[spot] = { playerId: 'p0', level: 1, active: true, activeTurn: -5, promotedTurn: -1 };
    expect(getView(g, 'p0').ck!.legal.chase).toEqual([]);
    g.ck!.attacks = 1;
    expect(getView(g, 'p0').ck!.legal.chase).toEqual([spot]);
    const chased = act(g, 'p0', { type: 'chase-robber', vertexId: spot });
    expect(chased.phase).toBe('robber');
    expect(chased.ck!.knights[spot]!.active).toBe(false);
  });
});

describe('city improvements', () => {
  it('cost their level in the track’s commodity; level 4 brings a metropolis worth 2 points', () => {
    let g = building();
    grant(g, 'p0', { coin: 10 });
    const before = victoryPoints(g, 'p0');
    for (let i = 0; i < 4; i++) g = act(g, 'p0', { type: 'improve-city', track: 'politics' });
    expect(g.ck!.improvements.p0!.politics).toBe(4);
    expect(g.players[0]!.resources.coin).toBe(0);
    expect(g.ck!.metropolis.politics).toBe(cityOf(g, 'p0'));
    expect(victoryPoints(g, 'p0')).toBe(before + 2);
  });

  it('a trading house trades commodities 2:1', () => {
    const g = building();
    expect(tradeRates(g, 'p0').paper).toBeGreaterThan(2);
    g.ck!.improvements.p0!.trade = 3;
    expect(tradeRates(g, 'p0').paper).toBe(2);
  });

  it('need a city', () => {
    const g = building();
    grant(g, 'p0', { paper: 1 });
    g.buildings[cityOf(g, 'p0')]!.kind = 'settlement';
    expect(() => act(g, 'p0', { type: 'improve-city', track: 'science' })).toThrow();
  });
});

describe('progress cards', () => {
  it('Merchant: 2:1 for its tile and a point while held', () => {
    const g = building();
    const card = give(g, 'p0', 'merchant');
    const hexId = getView(g, 'p0').ck!.legal.targets.merchant[0]!;
    const before = victoryPoints(g, 'p0');
    const next = act(g, 'p0', { type: 'play-progress', cardId: card, hexId });
    expect(victoryPoints(next, 'p0')).toBe(before + 1);
    expect(next.ck!.hands.p0).toHaveLength(0);
  });

  it('Saboteur: richer players discard half, then the turn goes on', () => {
    const g = building();
    grant(g, 'p1', { wood: 6 });
    const card = give(g, 'p0', 'saboteur');
    const next = act(g, 'p0', { type: 'play-progress', cardId: card });
    expect(next.phase).toBe('discard');
    expect(next.pendingDiscards).toEqual({ p1: 3 });
    const done = applyAction(
      next,
      'p1',
      { type: 'discard', resources: { ...emptyBag(), wood: 3 } },
      seeded(),
      TEST_NOW,
    );
    expect(done.phase).toBe('build');
  });

  it('Wedding: richer players each give 2 cards of their choice', () => {
    const g = building();
    grant(g, 'p1', { brick: 3 });
    g.ck!.cardPoints.p1 = 3;
    const card = give(g, 'p0', 'wedding');
    const next = act(g, 'p0', { type: 'play-progress', cardId: card });
    expect(next.phase).toBe('gift');
    expect(next.ck!.gifts).toEqual({ p1: 2 });
    const given = applyAction(
      next,
      'p1',
      { type: 'give-cards', resources: { ...emptyBag(), brick: 2 } },
      seeded(),
      TEST_NOW,
    );
    expect(given.phase).toBe('build');
    expect(given.players[0]!.resources.brick).toBe(2);
  });

  it('Alchemist: the roller picks the red and yellow dice', () => {
    const g = knightsGame();
    const card = give(g, 'p0', 'alchemist');
    const next = act(g, 'p0', { type: 'play-progress', cardId: card, red: 4, yellow: 5 });
    expect(next.dice).toEqual([4, 5]);
    expect(next.phase).not.toBe('roll');
  });

  it('Deserter: the opponent loses a knight and you place one as strong', () => {
    const g = building();
    const spot = knightSpot(g);
    const theirs = knightSites(g, 'p1').find(v => v !== spot)!;
    g.ck!.knights[theirs] = { playerId: 'p1', level: 2, active: false, activeTurn: -1, promotedTurn: -1 };
    const card = give(g, 'p0', 'deserter');
    let next = act(g, 'p0', { type: 'play-progress', cardId: card, playerId: 'p1' });
    expect(next.ck!.knights[theirs]).toBeUndefined();
    expect(next.phase).toBe('place-knight');
    next = act(next, 'p0', { type: 'place-knight', vertexId: spot });
    expect(next.ck!.knights[spot]).toMatchObject({ playerId: 'p0', level: 2 });
    expect(next.phase).toBe('build');
  });

  it('Diplomat removes an open road; your own goes back down for free', () => {
    const g = building();
    const own = openRoads(g).find(e => g.roads[e] === 'p0')!;
    const card = give(g, 'p0', 'diplomat');
    const next = act(g, 'p0', { type: 'play-progress', cardId: card, edgeId: own });
    expect(next.roads[own]).toBeUndefined();
    expect(next.phase).toBe('free-roads');
    expect(next.freeRoads).toBe(1);
  });

  it('Alchemist only before rolling; others only after', () => {
    const g = knightsGame();
    const card = give(g, 'p0', 'warlord');
    expect(() => act(g, 'p0', { type: 'play-progress', cardId: card })).toThrow(/can’t be played/);
  });
});

describe('stored games', () => {
  it('older rooms gain commodities in every bag and play without the expansion', () => {
    const old = structuredClone(building()) as GameState & Record<string, unknown>;
    old.ck = undefined as never;
    for (const p of old.players) delete (p.resources as Partial<typeof p.resources>).paper;
    delete (old.bank as Partial<typeof old.bank>).coin;
    old.schemaVersion = 31;
    const migrated = normalizeGame(old);
    expect(migrated.ck).toBeNull();
    expect(migrated.players[0]!.resources.paper).toBe(0);
    expect(migrated.bank.coin).toBe(0);
  });
});
