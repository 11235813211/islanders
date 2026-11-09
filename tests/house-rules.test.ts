import { describe, expect, it } from 'vitest';
import { applyAction, emptyBag, getView } from '../shared/engine';
import { buildBoard, tileKey } from '../shared/maps';
import { pips } from '../shared/maps/balance';
import { fillNumbers } from '../shared/maps/fill';
import type { DiscoveryRule, GameAction, GameState, Terrain } from '../shared/types';
import { grant, makeLobby, seaLobby, seeded, settled, TEST_NOW, testDesign } from './fixtures';

/**
 * Room rules beyond the base game (discoveries, volcano and iceberg rules, bank counts, trade
 * answers) and the map generator's options (dot limits, richer closed islands, random harbors,
 * icebergs on the sea, linked groups).
 */

const act = (g: GameState, id: string, action: GameAction, random = seeded()) =>
  applyAction(g, id, action, random, TEST_NOW);
/** Random source returning these values in turn (dice use floor(v * 6) + 1). */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};
const hexOf = (g: GameState, terrain: Terrain) => g.board.hexes.find(h => h.terrain === terrain)!;

const ISLE = testDesign([
  '~ ~ ~ ~ ~ ~ ~',
  ' ~ w6 b5 ~ ~ h3*! ~',
  '~ s9 o10 i5 ~ h3 ~',
  ' ~ g8 v4 j11 ~@ ~ ~',
  '~ ~ ~ ~ ~ ~ ~',
]);

/** A started two-player game on ISLE in the build phase, with p0 to move. */
function building(discoveries: DiscoveryRule = 'kept', setup: (g: GameState) => void = () => {}): GameState {
  let g = seaLobby(ISLE, 2);
  g = act(g, 'p0', { type: 'configure', settings: { ...g.settings, discoveries } });
  g = act(g, 'p0', { type: 'start' });
  Object.assign(g, { phase: 'build', turn: 3, turnIndex: 0, setupIndex: 4, rollDeadline: null });
  setup(g);
  return g;
}

describe('discovery rules', () => {
  it('kept: never stolen, discarded, or traded', () => {
    const g = building('kept', g => {
      g.players[1]!.discoveries = 3;
      g.buildings[hexOf(g, 'wood').vertexIds[0]!] = { playerId: 'p1', kind: 'settlement' };
      g.phase = 'robber';
    });
    const moved = act(g, 'p0', { type: 'move-robber', hexId: hexOf(g, 'wood').id });
    expect(moved.players[1]!.discoveries).toBe(3);
    expect(() =>
      act(
        building('kept', g => (g.players[0]!.discoveries = 1)),
        'p0',
        {
          type: 'offer-trade',
          give: { ...emptyBag(), discovery: 1 },
          want: { ...emptyBag(), ore: 1 },
        },
      ),
    ).toThrow(/cannot be traded/);
  });

  it('tradable: counted toward discards and traded, but never stolen', () => {
    let g = building('tradable', g => {
      g.players[0]!.discoveries = 6;
      grant(g, 'p0', { wood: 2 });
      g.phase = 'roll';
    });
    g = act(g, 'p0', { type: 'roll' }, sequence(0.5, 0.4));
    expect(g.pendingDiscards.p0).toBe(4);
    g = act(g, 'p0', { type: 'discard', resources: { ...emptyBag(), wood: 1, discovery: 3 } });
    expect(g.players[0]!.discoveries).toBe(3);
    g.phase = 'build';
    grant(g, 'p1', { ore: 1 });
    g = act(g, 'p0', {
      type: 'offer-trade',
      give: { ...emptyBag(), discovery: 2 },
      want: { ...emptyBag(), ore: 1 },
    });
    g = act(g, 'p1', { type: 'accept-trade', offerId: g.tradeOffer!.id });
    g = act(g, 'p0', { type: 'confirm-trade', offerId: g.tradeOffer!.id, playerId: 'p1' });
    expect(g.players[1]!.discoveries).toBe(2);
    expect(g.players[0]!.resources.ore).toBe(1);
  });

  it('like a card: stolen and taken by Monopoly and Year of Plenty', () => {
    const g = building('card', g => {
      g.players[1]!.discoveries = 2;
      g.buildings[hexOf(g, 'wood').vertexIds[0]!] = { playerId: 'p1', kind: 'settlement' };
      g.phase = 'robber';
    });
    const moved = act(g, 'p0', { type: 'move-robber', hexId: hexOf(g, 'wood').id });
    expect(moved.players[0]!.discoveries).toBe(1);
    const cards = building('card', g => {
      g.players[1]!.discoveries = 4;
      g.players[0]!.development = [
        { id: 'm', kind: 'monopoly', boughtTurn: 0 },
        { id: 'y', kind: 'year-of-plenty', boughtTurn: 0 },
      ];
    });
    const monopoly = act(cards, 'p0', { type: 'play-monopoly', cardId: 'm', resource: 'discovery' });
    expect(monopoly.players[0]!.discoveries).toBe(4);
    const plenty = act(cards, 'p0', {
      type: 'play-plenty',
      cardId: 'y',
      resources: { ...emptyBag(), ore: 1, discovery: 1 },
    });
    expect(plenty.players[0]!.discoveries).toBe(1);
    expect(() =>
      act(
        building('kept', g => (g.players[0]!.development = [{ id: 'm', kind: 'monopoly', boughtTurn: 0 }])),
        'p0',
        {
          type: 'play-monopoly',
          cardId: 'm',
          resource: 'discovery',
        },
      ),
    ).toThrow(/cannot take/);
  });
});

describe('volcanoes and icebergs', () => {
  it('no setup settlement may touch a volcano', () => {
    const g = act(seaLobby(ISLE, 2), 'p0', { type: 'start' });
    const volcano = hexOf(g, 'volcano');
    expect(getView(g, 'p0').legal.settlements.some(id => volcano.vertexIds.includes(id))).toBe(false);
  });

  it('without the gold variant a volcano pays nothing; a city with no settlement left is lost', () => {
    let g = seaLobby(ISLE, 2);
    g = act(g, 'p0', { type: 'configure', settings: { ...g.settings, volcanoGold: false } });
    g = act(g, 'p0', { type: 'start' });
    Object.assign(g, { phase: 'roll', turn: 3, turnIndex: 0, setupIndex: 4, rollDeadline: null });
    const volcano = hexOf(g, 'volcano');
    // Die face 2 names corner ERUPTION_CORNER[1] (5). p1 has all five settlements on the board already.
    g.buildings[volcano.vertexIds[5]!] = { playerId: 'p1', kind: 'city' };
    for (let i = 0; i < 5; i++) g.buildings[`far-${i}`] = { playerId: 'p1', kind: 'settlement' };
    const rolled = act(g, 'p0', { type: 'roll' }, sequence(0.2, 0.2, 0.2));
    expect(rolled.dice).toEqual([2, 2]);
    expect(rolled.pendingGold).toEqual({});
    expect(rolled.buildings[volcano.vertexIds[5]!]).toBeUndefined();
  });

  it('an iceberg showing the roll drifts and sinks a ship on the side the die names', () => {
    let g = building();
    const iceberg = hexOf(g, 'iceberg');
    expect(iceberg.number).toBe(5);
    // Die face 1 is the upper-right side: corners 4 and 5.
    const [a, b] = [iceberg.vertexIds[4]!, iceberg.vertexIds[5]!];
    const edge = g.board.edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a))!.id;
    g.ships[edge] = 'p1';
    Object.assign(g, { phase: 'roll' });
    g = act(g, 'p0', { type: 'roll' }, sequence(0.2, 0.4, 0.0));
    expect(g.dice).toEqual([2, 3]);
    expect(g.ships[edge]).toBeUndefined();
    expect(g.log.some(e => e.event?.kind === 'iceberg' && e.event.playerId === 'p1')).toBe(true);
  });
});

describe('room options', () => {
  it('shows bank counts only when the room asks', () => {
    const g = settled(3);
    expect(getView(g, 'p0').bankCounts).toBeNull();
    g.settings.showBank = true;
    expect(getView(g, 'p0').bankCounts).toEqual(g.bank);
  });

  it('trades several bank rounds at once', () => {
    const g = settled(3);
    g.phase = 'build';
    grant(g, 'p0', { wood: 8 });
    const before = g.players[0]!.resources.wheat;
    const traded = act(g, 'p0', { type: 'trade', give: 'wood', receive: 'wheat', count: 2 });
    expect(traded.players[0]!.resources.wheat).toBe(before + 2);
    expect(traded.players[0]!.resources.wood).toBe(g.players[0]!.resources.wood - 8);
  });

  it('offers reach all five others in a six-player game and close after the room’s time', () => {
    let g = applyAction(makeLobby(6), 'p0', { type: 'start' }, seeded(), TEST_NOW);
    g.phase = 'build';
    g.settings.tradeSeconds = 60;
    grant(g, 'p0', { wood: 1 });
    g = act(g, 'p0', {
      type: 'offer-trade',
      give: { ...emptyBag(), wood: 1 },
      want: { ...emptyBag(), ore: 1 },
      to: ['p1', 'p2', 'p3', 'p4', 'p5'],
    });
    expect(g.tradeOffer!.to).toHaveLength(5);
    expect(g.tradeOffer!.expiresAt - g.tradeOffer!.createdAt).toBe(60_000);
  });
});

describe('map options', () => {
  const ROWS = [
    '~ ~ ~ ~ ~ ~ ~',
    ' ~ L L L ~ ~ ~',
    '~ L L L L ~ ~',
    ' ~ L L L ~ L! ~',
    '~ ~ ~ ~ ~ L ~',
    ' ~ ~ ~ ~ ~ ~ ~',
  ];

  it('random numbers keep to a tile’s dot limit', () => {
    const d = testDesign(ROWS);
    d.tiles = d.tiles.map(t => (t.kind === 'land' ? { ...t, pips: [1, 2] } : t));
    for (let seed = 1; seed < 8; seed++) {
      const { board } = buildBoard(d, seeded(seed));
      for (const hex of board.hexes)
        if (hex.number && hex.terrain !== 'iceberg') expect(pips(hex.number)).toBeLessThan(3);
    }
  });

  it('richer closed islands get 6s and 8s without taking them from the rest', () => {
    const rich = testDesign(ROWS, { richIslands: 4, pool: { wood: 1 } });
    const reds = (n: number | null) => n === 6 || n === 8;
    for (let seed = 1; seed < 6; seed++) {
      const { board } = buildBoard(rich, seeded(seed));
      const closed = board.hexes.filter(h => h.noSetup && h.number);
      const open = board.hexes.filter(h => !h.noSetup && h.number);
      expect(closed.every(h => reds(h.number))).toBe(true);
      // Ten open tiles keep about their share (4 of 18) of reds.
      expect(open.filter(h => reds(h.number)).length).toBeGreaterThanOrEqual(2);
    }
    const filled = fillNumbers(rich, seeded(2));
    expect(filled.tiles.filter(t => t.noSetup).every(t => reds(t.number ?? null))).toBe(true);
  });

  it('a board without harbors gets them at random spots each game', () => {
    const d = testDesign(ROWS);
    const spots = new Set<string>();
    for (let seed = 1; seed < 6; seed++) {
      const { board } = buildBoard(d, seeded(seed));
      expect(board.harbors.length).toBeGreaterThanOrEqual(3);
      spots.add(board.harbors.map(h => h.edgeId).join());
    }
    expect(spots.size).toBeGreaterThan(1);
  });

  it('icebergs cover a percent of the sea, never the land', () => {
    const d = testDesign(ROWS, { pool: { wood: 1, iceberg: 20 } });
    const sea = d.tiles.filter(t => t.kind === 'sea').length;
    const { board } = buildBoard(d, seeded(4));
    const ice = board.hexes.filter(h => h.terrain === 'iceberg');
    expect(ice).toHaveLength(Math.round(sea * 0.2));
    expect(ice.every(h => h.number !== null)).toBe(true);
    expect(board.hexes.filter(h => h.terrain === 'wood')).toHaveLength(d.tiles.filter(t => t.kind === 'land').length);
  });

  it('linked groups draw every kind over many games, not the same one', () => {
    const d = testDesign(ROWS);
    d.tiles = d.tiles.map(t => (t.kind === 'land' && t.r === -1 ? { ...t, link: 'A' } : t));
    const linked = d.tiles.filter(t => t.link).map(t => tileKey(t.q, t.r));
    const kinds = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const { board } = buildBoard(d, seeded(seed));
      const terrains = new Set(board.hexes.filter(h => linked.includes(tileKey(h.q, h.r))).map(h => h.terrain));
      expect(terrains.size).toBe(1);
      kinds.add([...terrains][0]!);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });
});
