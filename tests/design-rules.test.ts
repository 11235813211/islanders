import { describe, expect, it } from 'vitest';
import { applyAction, getView, normalizeGame } from '../shared/engine';
import { buildBoard, designFor, parseDesign, tileKey } from '../shared/maps';
import { pips } from '../shared/maps/balance';
import { noStartPoints, toggleNoStart } from '../shared/maps/edit';
import { setNotLinks } from '../shared/maps/fill';
import type { BoardDesign } from '../shared/maps/types';
import type { GameState } from '../shared/types';
import { makeLobby, seeded, TEST_NOW, testDesign } from './fixtures';

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
    const g = applyAction(lobby, 'p0', { type: 'start' }, seeded(), TEST_NOW);
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
    g = applyAction(g, 'p0', { type: 'start' }, seeded(), TEST_NOW);
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
    g = applyAction(g, 'p0', { type: 'start' }, seeded(), TEST_NOW);
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
  it('a richer terrain gets better numbers on average than a poorer one', () => {
    const design = testDesign([
      '~ ~ ~ ~ ~ ~ ~',
      ' ~ o o o w w ~',
      '~ o o o w w w ~',
      ' ~ o o w w w ~',
      '~ ~ ~ ~ ~ ~ ~',
    ]);
    const average = (bias: BoardDesign['numberBias'], terrain: string) => {
      let total = 0;
      let count = 0;
      for (let seed = 1; seed < 25; seed++)
        for (const h of buildBoard({ ...design, numberBias: bias }, seeded(seed)).board.hexes)
          if (h.terrain === terrain && h.number) {
            total += pips(h.number);
            count++;
          }
      return total / count;
    };
    expect(average({ ore: 2, wood: -2 }, 'ore')).toBeGreaterThan(average({ ore: 2, wood: -2 }, 'wood') + 0.5);
    expect(parseDesign({ ...design, numberBias: { ore: 2 } }, ['seafaring']).numberBias).toEqual({ ore: 2 });
    expect(tileKey(0, 0)).toBe('0,0');
  });
});
