import { autoHarbors } from './harbors';
import { BASE_POOL, type BoardCategory, type BoardDesign, type DesignKind, type DesignTile } from './types';

/**
 * Boards that ship with the game. Editors can change or hide them; their edits are stored
 * in the board library and take precedence (see mergeLibrary).
 *
 * Each map is drawn as rows of tokens in "odd rows shifted right" layout:
 *   ~ sea   L random land   w b s h o  wood brick sheep wheat ore   d desert
 *   g gold  j jungle        v volcano  i iceberg      .  no tile
 * Suffixes: a number token (h6), * island bonus 2, + island bonus 1, ! no setup settlements
 * on this island, @ robber start (on land) or pirate start (on sea).
 */

const LETTERS: Record<string, DesignKind> = {
  '~': 'sea',
  L: 'land',
  w: 'wood',
  b: 'brick',
  s: 'sheep',
  h: 'wheat',
  o: 'ore',
  d: 'desert',
  g: 'gold',
  j: 'jungle',
  v: 'volcano',
  i: 'iceberg',
};

/** Parse a token grid into tiles plus robber and pirate starts. Exported for tests. */
export function parseGrid(rows: string[]): Pick<BoardDesign, 'tiles' | 'robber' | 'pirate'> {
  const tiles: DesignTile[] = [];
  let robber: BoardDesign['robber'] = null;
  let pirate: BoardDesign['pirate'] = null;
  rows.forEach((line, row) => {
    line
      .trim()
      .split(/\s+/)
      .forEach((token, col) => {
        if (token === '.') return;
        const match = /^([~LwbshodgjvLi])(\d{1,2})?([*+!@]*)$/.exec(token);
        if (!match) throw new Error(`Bad map token "${token}"`);
        const tile: DesignTile = { q: col - Math.floor(row / 2), r: row, kind: LETTERS[match[1]!]! };
        if (match[2]) tile.number = Number(match[2]);
        const flags = match[3] ?? '';
        if (flags.includes('*')) tile.bonus = 2;
        if (flags.includes('+')) tile.bonus = 1;
        if (flags.includes('!')) tile.noSetup = true;
        if (flags.includes('@')) {
          if (tile.kind === 'sea') pirate = { q: tile.q, r: tile.r };
          else robber = { q: tile.q, r: tile.r };
        }
        tiles.push(tile);
      });
  });
  // Center the map on the origin so it opens centered in the editor.
  const dq = Math.round(tiles.reduce((n, t) => n + t.q + t.r / 2, 0) / tiles.length);
  const dr = Math.round(tiles.reduce((n, t) => n + t.r, 0) / tiles.length);
  const shift = <T extends { q: number; r: number }>(t: T): T => ({
    ...t,
    q: t.q - dq + Math.round(dr / 2),
    r: t.r - dr,
  });
  return {
    tiles: tiles.map(shift),
    robber: robber ? shift(robber) : null,
    pirate: pirate ? shift(pirate) : null,
  };
}

function map(
  id: string,
  name: string,
  description: string,
  options: {
    categoryId: string;
    players: [number, number];
    victoryPoints?: number;
    harbors: number;
    pool?: BoardDesign['pool'];
  },
  rows: string[],
): BoardDesign {
  const grid = parseGrid(rows);
  return {
    id,
    name,
    description,
    categoryId: options.categoryId,
    players: { min: options.players[0], max: options.players[1] },
    victoryPoints: options.victoryPoints ?? 13,
    ...grid,
    harbors: autoHarbors(grid.tiles, options.harbors),
    pool: options.pool ?? { ...BASE_POOL },
    harborExclude: [],
    expansions: ['seafarers', ...(options.players[1] >= 5 ? (['five-six'] as const) : [])],
    updatedAt: 0,
  };
}

export const BUILTIN_CATEGORIES: BoardCategory[] = [
  { id: 'seafaring', name: 'Seafaring', color: '#1f7fa6' },
  { id: 'fire-and-jungle', name: 'Fire and jungle', color: '#c4572b' },
];

export const BUILTIN_BOARDS: BoardDesign[] = [
  map(
    'outer-isles',
    'Outer Isles',
    'Start on the big island, then sail out to three small isles for gold and 2 bonus points each.',
    { categoryId: 'seafaring', players: [3, 4], harbors: 9 },
    [
      '~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
      ' ~ L L L ~ ~ L*! L ~ ~',
      '~ L L L L ~ ~ g ~ ~',
      ' ~ L L L L ~ ~@ ~ L*! ~',
      '~ L L L L ~ L*! ~ L ~',
      ' ~ L L L ~ ~ L ~ g ~',
      '~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
    ],
  ),
  map(
    'four-isles',
    'Four Isles',
    'Four islands of six. Start on any; each other island you settle is worth 2 points.',
    { categoryId: 'seafaring', players: [3, 4], harbors: 10 },
    [
      '~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
      ' ~ L* L ~ ~ ~ ~ L* L ~',
      '~ L L L ~ ~ L L L ~',
      ' ~ ~ L ~ ~ ~ ~ L ~ ~',
      '~ ~ ~ ~ g*! ~@ ~ ~ ~ ~',
      ' ~ ~ L ~ ~ ~ ~ L ~ ~',
      '~ L L L ~ ~ L L L ~',
      ' ~ L* L ~ ~ ~ ~ L* L ~',
      '~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
    ],
  ),
  map(
    'archipelago',
    'Archipelago',
    'A classic-sized home island ringed by small isles and two lone gold fields.',
    { categoryId: 'seafaring', players: [3, 4], harbors: 10 },
    [
      '~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
      ' ~ L*! L ~ ~ ~ ~ ~ L*! L ~',
      '~ L ~ ~ L L L ~ ~ L ~',
      ' ~ ~ ~ L L L L ~ ~ ~ ~',
      '~ g+! ~ L L L L L ~ g+! ~',
      ' ~ ~ ~ L L L L ~@ ~ ~ ~',
      '~ L ~ ~ L L L ~ ~ L ~',
      ' ~ L*! L ~ ~ ~ ~ ~ L*! L ~',
      '~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
    ],
  ),
  map(
    'the-strait',
    'The Strait',
    'Two large islands across a strait, with a gold field in the middle. Start on either.',
    { categoryId: 'seafaring', players: [3, 4], harbors: 10 },
    [
      '~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
      ' ~ L* L L ~ ~ ~ ~ L* L L ~',
      '~ L L L L ~ ~ L L L L ~',
      ' ~ L L L ~ g+! ~@ ~ L L L ~',
      '~ L L L L ~ ~ L L L L ~',
      ' ~ L L L ~ ~ ~ ~ L L L ~',
      '~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
    ],
  ),
  map(
    'wide-sea',
    'Wide Sea',
    'For five or six: a long home island, and four isles across the water worth 2 points each.',
    { categoryId: 'seafaring', players: [5, 6], victoryPoints: 13, harbors: 12 },
    [
      '~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
      ' ~ L L L L ~ ~ ~ L*! L ~ ~ ~',
      '~ L L L L L ~ ~ ~ g ~ ~ ~',
      ' ~ L L L L L ~ ~ ~ ~ L*! L ~',
      '~ L L L L L L ~@ ~ ~ ~ L ~',
      ' ~ L L L L L ~ ~ ~ ~ L*! L ~',
      '~ L L L L L ~ ~ ~ g ~ ~ ~',
      ' ~ L L L L ~ ~ ~ L*! L ~ ~ ~',
      '~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
    ],
  ),
  map(
    'small-isles',
    'Small Isles',
    'A compact map for two or three: one home island and a far isle with gold.',
    { categoryId: 'seafaring', players: [2, 3], victoryPoints: 12, harbors: 7 },
    [
      '~ ~ ~ ~ ~ ~ ~ ~ ~',
      ' ~ L L L ~ ~ ~ ~ ~',
      '~ L L L L ~ ~ L*! ~',
      ' ~ L L L ~ ~@ L L ~',
      '~ L L L L ~ ~ g ~',
      ' ~ L L L ~ ~ L ~ ~',
      '~ ~ ~ ~ ~ ~ ~ ~ ~',
    ],
  ),
  map(
    'fire-and-ice',
    'Fire and Ice',
    'A volcano on the home island and another beyond the icebergs. Eruptions damage the corner the die names.',
    { categoryId: 'fire-and-jungle', players: [3, 4], harbors: 9 },
    [
      '~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
      ' ~ i ~ L L L ~ ~ i ~ ~',
      '~ ~ L L L L ~ ~ L*! L ~',
      ' ~ ~ L L v L L ~@ ~ g ~',
      '~ ~ L L L L ~ i ~ L ~',
      ' ~ i ~ L L L ~ ~ L L ~',
      '~ ~ ~ ~ i ~ ~ ~ v ~ ~',
      ' ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
    ],
  ),
  map(
    'jungle-coast',
    'Jungle Coast',
    'Jungles yield discoveries that pay for development cards. Two jungle isles lie offshore.',
    { categoryId: 'fire-and-jungle', players: [3, 4], harbors: 9, pool: { ...BASE_POOL, jungle: 2 } },
    [
      '~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
      ' ~ ~ L L L ~ ~ ~ j*! ~ ~',
      '~ L L L L ~ ~ j L ~ ~',
      ' ~ L L L L L ~@ ~ ~ ~ ~',
      '~ L L L L ~ ~ L j*! ~ ~',
      ' ~ ~ L L L ~ ~ ~ L ~ ~',
      '~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~',
    ],
  ),
];
