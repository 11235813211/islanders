import { describe, expect, it } from 'vitest';
import { applyAction, getView, normalizeGame } from '../shared/engine';
import { buildBoard, designFor, parseDesign, tileKey, upgradeDesign } from '../shared/maps';
import { pips } from '../shared/maps/balance';
import { noStartPoints, toggleNoStart } from '../shared/maps/edit';
import { setNotLinks } from '../shared/maps/fill';
import { fogMixOf, setFogMix } from '../shared/maps/fog';
import { fogIslandsOf, randomTerrains, setIslandLevels } from '../shared/maps/numbers';
import type { BoardDesign } from '../shared/maps/types';
import type { GameState } from '../shared/types';
import { fogOutlooks } from '../src/components/maps/FogSummary';
import { inSeatOrder, makeLobby, seeded, TEST_NOW, testDesign, withFogMix } from './fixtures';

/** Link rules, "Not A", no-start corners, versions for other player counts, and number richness. */

/** One island of random land: three tiles linked A, B, C and three plain. */
function linked(): BoardDesign {
  const design = testDesign(['~ ~ ~ ~ ~', ' ~ L L L ~', '~ L L L ~', ' ~ ~ ~ ~ ~']);
  const land = design.tiles.filter(t => t.kind === 'land');
  ['A', 'B', 'C'].forEach((letter, i) => {
    land[i]!.link = letter;
  });
  return design;
}
const terrainOf = (board: ReturnType<typeof buildBoard>['board'], t: { q: number; r: number }) =>
  board.hexes.find(h => h.q === t.q && h.r === t.r)!.terrain;

describe('link rules', () => {
  it('"A, B, C distinct" and "B, C both in mountains or hills" hold on every draw', () => {
    const design = {
      ...linked(),
      linkRules: [
        { kind: 'distinct' as const, links: ['A', 'B', 'C'] },
        { kind: 'in' as const, links: ['B', 'C'], terrains: ['ore' as const, 'brick' as const] },
      ],
    };
    const [a, b, c] = design.tiles.filter(t => t.link);
    for (let seed = 1; seed < 40; seed++) {
      const { board } = buildBoard(design, seeded(seed));
      const kinds = [a, b, c].map(t => terrainOf(board, t!));
      expect(new Set(kinds).size).toBe(3);
      expect(['ore', 'brick']).toContain(kinds[1]);
      expect(['ore', 'brick']).toContain(kinds[2]);
    }
    expect(parseDesign(design, ['seafaring']).linkRules).toHaveLength(2);
  });

  it('"Not A" tiles never get A\'s terrain', () => {
    let design = linked();
    const plain = design.tiles.filter(t => t.kind === 'land' && !t.link);
    design = setNotLinks(design, plain, [], 'A');
    expect(design.tiles.filter(t => t.notLink === 'A')).toHaveLength(3);
    const a = design.tiles.find(t => t.link === 'A')!;
    for (let seed = 1; seed < 40; seed++) {
      const { board } = buildBoard(design, seeded(seed));
      for (const t of plain) expect(terrainOf(board, t)).not.toBe(terrainOf(board, a));
    }
  });
});

describe('no-start corners', () => {
  it('a marked corner can take no starting settlement; marking it again clears it', () => {
    let design = testDesign(['~ ~ ~ ~ ~', ' ~ w6 b5 ~ ~', '~ s9 o10 ~ ~', ' ~ ~ ~ ~ ~']);
    const tile = design.tiles.find(t => t.kind === 'wood')!;
    const [point] = noStartPoints({ ...design, noStart: [`${tile.q},${tile.r},1`] });
    design = toggleNoStart(design, point!.x, point!.y);
    expect(design.noStart).toHaveLength(1);
    expect(toggleNoStart(design, point!.x, point!.y).noStart).toBeUndefined();
    const lobby = applyAction(makeLobby(2), 'p0', { type: 'choose-map', mapId: design.id }, seeded(), TEST_NOW, {
      design,
    });
    const g = inSeatOrder(applyAction(lobby, 'p0', { type: 'start' }, seeded(), TEST_NOW));
    const hex = g.board.hexes.find(h => h.q === tile.q && h.r === tile.r)!;
    expect(getView(g, 'p0').legal.settlements).not.toContain(hex.vertexIds[1]);
    expect(parseDesign(design, ['seafaring']).noStart).toEqual(design.noStart);
  });
});

describe('versions for other player counts', () => {
  it('the version whose range fits the table is played, with its own points', () => {
    const base = testDesign(['~ ~ ~ ~', ' ~ L L ~', '~ ~ ~ ~'], { players: { min: 3, max: 4 }, victoryPoints: 12 });
    const big = testDesign(['~ ~ ~ ~ ~ ~', ' ~ L L L L ~', '~ L L L L ~', ' ~ ~ ~ ~ ~ ~']);
    const design: BoardDesign = {
      ...base,
      versions: [
        { players: { min: 5, max: 6 }, victoryPoints: 14, tiles: big.tiles, harbors: [], robber: null, pirate: null },
      ],
    };
    expect(designFor(design, 4).tiles).toBe(base.tiles);
    expect(designFor(design, 6).tiles).toBe(big.tiles);
    let g = applyAction(makeLobby(5), 'p0', { type: 'choose-map', mapId: design.id }, seeded(), TEST_NOW, { design });
    g = inSeatOrder(applyAction(g, 'p0', { type: 'start' }, seeded(), TEST_NOW));
    expect(g.board.hexes.filter(h => h.terrain !== 'sea')).toHaveLength(8);
    expect(g.settings.victoryPoints).toBe(14);
    expect(g.map).toMatchObject({
      layouts: [
        { min: 3, max: 4 },
        { min: 5, max: 6 },
      ],
      layout: null,
    });
    expect(parseDesign(design, ['seafaring']).versions).toHaveLength(1);
  });

  it('a layout the host picks is played whatever the table size, with its points', () => {
    const design = twoLayouts();
    let g = applyAction(
      makeLobby(3),
      'p0',
      { type: 'choose-map', mapId: design.id, layoutFor: 5 },
      seeded(),
      TEST_NOW,
      {
        design,
      },
    );
    expect(g.map?.layout).toEqual({ min: 5, max: 6 });
    expect(g.settings.victoryPoints).toBe(14);
    g = inSeatOrder(applyAction(g, 'p0', { type: 'start' }, seeded(), TEST_NOW));
    expect(g.board.hexes.filter(h => h.terrain !== 'sea')).toHaveLength(8);
    expect(g.settings.victoryPoints).toBe(14);
  });

  it('picking another layout of the same map changes the points; a count with no layout is refused', () => {
    const design = twoLayouts();
    const choose = (g: GameState, layoutFor?: number) =>
      applyAction(g, 'p0', { type: 'choose-map', mapId: design.id, layoutFor }, seeded(), TEST_NOW, { design });
    let g = choose(makeLobby(3), 5);
    g = choose(g, 3);
    expect(g.map?.layout).toEqual({ min: 3, max: 4 });
    expect(g.settings.victoryPoints).toBe(12);
    expect(() => choose(g, 2)).toThrow(/no layout/);
  });

  it('rooms saved with one player range for the map load with each layout listed', () => {
    const design = twoLayouts();
    const g = applyAction(makeLobby(3), 'p0', { type: 'choose-map', mapId: design.id }, seeded(), TEST_NOW, { design });
    const old = structuredClone(g) as unknown as Record<string, unknown>;
    old.map = { id: design.id, name: design.name, players: { min: 3, max: 6 } };
    old.schemaVersion = 6;
    const loaded = normalizeGame(old as unknown as GameState, TEST_NOW);
    expect(loaded.map).toEqual({
      id: design.id,
      name: design.name,
      layouts: [
        { min: 3, max: 4 },
        { min: 5, max: 6 },
      ],
      layout: null,
    });
  });
});

describe('fog in each layout', () => {
  /** Land tiles of a grid, all but the first turned to fog. */
  const fogged = (rows: string[]) =>
    testDesign(rows).tiles.map((t, i, all) =>
      t.kind === 'land' && all.findIndex(x => x.kind === 'land') !== i ? { ...t, kind: 'fog' as const } : t,
    );
  /** Two fog tiles in the main layout; four in the 5–6 player version, which has its own mix. */
  const design = (): BoardDesign => {
    const base = testDesign(['~ ~ ~ ~ ~', ' ~ L L L ~', '~ ~ ~ ~ ~'], { players: { min: 3, max: 4 } });
    return {
      ...base,
      tiles: withFogMix({ tiles: fogged(['~ ~ ~ ~ ~', ' ~ L L L ~', '~ ~ ~ ~ ~']) }, { pool: { gold: 2 }, exact: true })
        .tiles,
      versions: [
        withFogMix(
          {
            players: { min: 5, max: 6 },
            victoryPoints: 13,
            tiles: fogged(['~ ~ ~ ~ ~ ~ ~', ' ~ L L L L L ~', '~ ~ ~ ~ ~ ~ ~']),
            harbors: [],
            robber: null,
            pirate: null,
          },
          { pool: { sea: 4 } },
        ),
      ],
    };
  };

  it('a version keeps its own fog mix through saving, and the game draws from it', () => {
    const parsed = parseDesign(design(), ['seafaring']);
    expect(parsed.versions![0]!.tiles.find(t => t.kind === 'fog')!.fogMix).toEqual({ pool: { sea: 4 } });
    const small = Object.values(buildBoard(designFor(parsed, 3), seeded()).fog).map(f => f.terrain);
    const large = Object.values(buildBoard(designFor(parsed, 5), seeded()).fog).map(f => f.terrain);
    expect(small).toEqual(['gold', 'gold']);
    expect(large).toEqual(['sea', 'sea', 'sea', 'sea']);
  });

  it("boards saved with one fog mix per layout move it onto each layout's fog tiles", () => {
    const d = design();
    const strip = <T extends { tiles: BoardDesign['tiles'] }>(l: T): T => ({
      ...l,
      tiles: l.tiles.map(({ fogMix: _f, ...t }) => t),
    });
    // One version has its own (old) mix; another without one used the board's.
    const own = { ...strip(d.versions![0]!), fogPool: { sea: 4 }, fogExact: false };
    const inherits = { ...strip(d.versions![0]!), players: { min: 2, max: 2 } };
    const old = { ...strip(d), fogPool: { gold: 2 }, fogExact: true, versions: [own, inherits] };
    const upgraded = upgradeDesign(old as unknown as BoardDesign);
    const mixOf = (l: { tiles: BoardDesign['tiles'] }) => l.tiles.find(t => t.kind === 'fog')!.fogMix;
    expect('fogPool' in upgraded).toBe(false);
    expect(mixOf(upgraded)).toEqual({ pool: { gold: 2 }, exact: true });
    expect(mixOf(upgraded.versions![0]!)).toEqual({ pool: { sea: 4 } });
    expect(mixOf(upgraded.versions![1]!)).toEqual({ pool: { gold: 2 }, exact: true });
    expect('fogPool' in upgraded.versions![0]!).toBe(false);
  });

  it('the map view says "exactly" only when the counts fill that fog island', () => {
    const d = design();
    expect(fogOutlooks(designFor(d, 3))).toMatchObject([{ size: 2, certainty: 'exactly', kinds: [['gold', 2]] }]);
    // The same exact stack of 2 dealt over 4 fog tiles is only "at least 2".
    const short: BoardDesign = { ...d, versions: [withFogMix(d.versions![0]!, { pool: { gold: 2 }, exact: true })] };
    expect(fogOutlooks(designFor(short, 5))).toMatchObject([{ size: 4, certainty: 'at least' }]);
  });
});

/** A 3–4 player map (2 land tiles, 12 points) with a 5–6 player version (8 land tiles, 14 points). */
function twoLayouts(): BoardDesign {
  const base = testDesign(['~ ~ ~ ~', ' ~ L L ~', '~ ~ ~ ~'], { players: { min: 3, max: 4 }, victoryPoints: 12 });
  const big = testDesign(['~ ~ ~ ~ ~ ~', ' ~ L L L L ~', '~ L L L L ~', ' ~ ~ ~ ~ ~ ~']);
  return {
    ...base,
    versions: [
      { players: { min: 5, max: 6 }, victoryPoints: 14, tiles: big.tiles, harbors: [], robber: null, pirate: null },
    ],
  };
}

describe('number richness by terrain', () => {
  it('keeps reds apart even when terrains have different levels', () => {
    const design = testDesign([
      '~ ~ ~ ~ ~ ~ ~',
      ' ~ s w h b o ~',
      '~ o s w h b s w ~',
      ' ~ b o s w h ~',
      '~ h w s o b ~',
      '~ ~ ~ ~ ~ ~ ~',
    ]);
    const leaning = setIslandLevels(design, new Set(design.tiles.map(t => tileKey(t.q, t.r))), { sheep: 1, ore: 1 });
    for (let seed = 1; seed < 60; seed++) {
      const { board } = buildBoard(leaning, seeded(seed));
      const red = (n: number | null) => n === 6 || n === 8;
      for (const hex of board.hexes.filter(h => red(h.number)))
        for (const other of board.hexes.filter(h => h !== hex && red(h.number)))
          expect(
            hex.vertexIds.some(v => other.vertexIds.includes(v)),
            `seed ${seed}`,
          ).toBe(false);
    }
  });

  it('a richer terrain gets better numbers on average than a poorer one, and levels survive saving', () => {
    const design = testDesign([
      '~ ~ ~ ~ ~ ~ ~',
      ' ~ o o o w w ~',
      '~ o o o w w w ~',
      ' ~ o o w w w ~',
      '~ ~ ~ ~ ~ ~ ~',
    ]);
    const leaning = setIslandLevels(design, new Set(design.tiles.map(t => tileKey(t.q, t.r))), { ore: 2, wood: -2 });
    const average = (terrain: string) => {
      let total = 0;
      let count = 0;
      for (let seed = 1; seed < 25; seed++)
        for (const h of buildBoard(leaning, seeded(seed)).board.hexes)
          if (h.terrain === terrain && h.number) {
            total += pips(h.number);
            count++;
          }
      return total / count;
    };
    expect(average('ore')).toBeGreaterThan(average('wood') + 0.5);
    const saved = parseDesign(leaning, ['seafaring']);
    expect(saved.tiles.find(t => t.kind === 'ore')!.numberLevels).toEqual({ ore: 2, wood: -2 });
    expect(() =>
      parseDesign({ ...leaning, tiles: leaning.tiles.map(t => ({ ...t, numberLevels: { ore: 4 } })) }, ['seafaring']),
    ).toThrow();
  });
});

describe('number levels on fog', () => {
  /** A home island, and two fog islands of seven tiles each that hide only wheat. */
  function foggyDesign(): BoardDesign {
    const d = testDesign([
      '~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
      ' ~ w6 h8 ~ L L ~ ~ L L ~',
      '~ s9 o5 ~ L L L ~ L L L ~',
      ' ~ b4 h10 ~ L L ~ ~ L L ~',
      '~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
    ]);
    return withFogMix(
      { ...d, tiles: d.tiles.map(t => (t.kind === 'land' ? { ...t, kind: 'fog' as const } : t)) },
      { pool: { wheat: 1 } },
    );
  }
  const hidden = (design: BoardDesign, seed: number) => {
    const { board, fog } = buildBoard(design, seeded(seed));
    return board.hexes.filter(h => fog[h.id]).map(h => ({ q: h.q, number: fog[h.id]!.number! }));
  };

  it('each fog island draws its hidden numbers from its own levels, and the levels survive saving', () => {
    const design = foggyDesign();
    const [west, east] = fogIslandsOf(design);
    expect(west).toHaveLength(7);
    expect(east).toHaveLength(7);
    const keys = (island: typeof west) => new Set(island!.map(t => tileKey(t.q, t.r)));
    const leaning = setIslandLevels(setIslandLevels(design, keys(west), { wheat: 3 }), keys(east), { wheat: -3 });
    const westQ = new Set(west!.map(t => t.q));
    for (let seed = 1; seed < 20; seed++)
      for (const { q, number } of hidden(leaning, seed)) {
        if (westQ.has(q)) expect([6, 8]).toContain(number);
        else expect([2, 3, 11, 12]).toContain(number);
      }
    const saved = parseDesign(leaning, ['seafaring']);
    expect(saved.tiles.find(t => t.kind === 'fog')!.numberLevels).toBeTruthy();
    expect(randomTerrains(leaning, west!)).toEqual(['wheat']);
  });

  it('each fog island hides its own mix; copying one mix to all fog makes them alike', () => {
    const design = foggyDesign();
    const [west, east] = fogIslandsOf(design);
    const keys = (island: typeof west) => new Set(island!.map(t => tileKey(t.q, t.r)));
    const mixed = setFogMix(setFogMix(design, keys(west), { pool: { gold: 2, ore: 5 }, exact: true }), keys(east), {
      pool: { sea: 1 },
    });
    const westQ = new Set(west!.map(t => t.q));
    for (let seed = 1; seed < 10; seed++) {
      const { board, fog } = buildBoard(parseDesign(mixed, ['seafaring']), seeded(seed));
      const under = board.hexes.filter(h => fog[h.id]);
      const westKinds = under.filter(h => westQ.has(h.q)).map(h => fog[h.id]!.terrain);
      expect(westKinds.sort()).toEqual(['gold', 'gold', 'ore', 'ore', 'ore', 'ore', 'ore']);
      for (const h of under.filter(h => !westQ.has(h.q))) expect(fog[h.id]!.terrain).toBe('sea');
    }
    expect(fogOutlooks(mixed).map(o => o.certainty)).toEqual(['exactly', 'about']);
    // "Copy to other fog islands" gives every fog tile the selected island's mix.
    const all = setFogMix(
      mixed,
      new Set(design.tiles.filter(t => t.kind === 'fog').map(t => tileKey(t.q, t.r))),
      fogMixOf(west!.map(t => mixed.tiles.find(m => m.q === t.q && m.r === t.r)!)),
    );
    expect(fogOutlooks(all)).toMatchObject([{ islands: 2, size: 7, certainty: 'exactly' }]);
  });
});
