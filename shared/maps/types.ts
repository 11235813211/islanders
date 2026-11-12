import type { Resource, Terrain } from '../types';

/**
 * A board as an editor saves it. `buildBoard` (generate.ts) turns a design into a playable
 * Board, filling anything left random with a balanced draw each time a game is set up.
 */

/** A tile in a design. `land` is filled with a random terrain from the design's pool. */
export type DesignKind = Terrain | 'land';
/** Terrains random land can become. */
export type FillKind = Exclude<Terrain, 'sea' | 'fog'>;
/** What a fog tile may turn out to be. */
export type FogKind = Exclude<FillKind, 'iceberg'> | 'sea';
export type Pool = Partial<Record<FillKind, number>>;

export interface DesignTile {
  q: number;
  r: number;
  kind: DesignKind;
  /** Fixed number token. Absent on a producing tile means a balanced random number. */
  number?: number;
  /** Dot counts (1–5) a random number here may have; absent means any. */
  pips?: number[];
  /** Tiles and harbors sharing a letter get the same resource. Only random land is linked. */
  link?: string;
  /** "Not A": any resource but the one the tiles and harbors linked to this letter get. Random only. */
  notLink?: string;
  /** No setup settlement may touch this tile's island. */
  noSetup?: boolean;
  /** Victory points for each player who first settles this tile's island. */
  bonus?: number;
}

/** A harbor on side `side` (0–5, see SIDE_DIRECTIONS) of land tile (q, r). */
export interface DesignHarbor {
  q: number;
  r: number;
  side: number;
  kind: Resource | 'any' | 'random';
  /** Same resource as the tiles with this letter. Only random harbors are linked. */
  link?: string;
  /** Any resource but the one linked to this letter. */
  notLink?: string;
}

/**
 * A rule over link letters: `in` keeps every listed letter to the given terrains ("B, C both in
 * mountains or hills"); `distinct` gives the listed letters different terrains ("A, B, C distinct").
 */
export type LinkRule = { kind: 'in'; links: string[]; terrains: FillKind[] } | { kind: 'distinct'; links: string[] };

/** One corner of a tile, as the editor stores it: tile `q,r` and corner 0–5 (see Hex.vertexIds). */
export type CornerKey = string;

/** What a board's version for some player counts replaces; everything else is shared. */
export const VERSION_FIELDS = [
  'players',
  'victoryPoints',
  'tiles',
  'harbors',
  'robber',
  'pirate',
  'noStart',
  // Each layout has its own fog tiles, so its own mix (versions saved before this share the board's).
  'fogPool',
  'fogExact',
] as const;
export type BoardVersion = Pick<BoardDesign, (typeof VERSION_FIELDS)[number]>;

export interface BoardDesign {
  id: string;
  name: string;
  categoryId: string;
  /** One line shown under the name in the map picker. */
  description: string;
  players: { min: number; max: number };
  victoryPoints: number;
  tiles: DesignTile[];
  harbors: DesignHarbor[];
  /** Starting tiles. Robber defaults to a desert; the pirate starts off the board when unset. */
  robber: { q: number; r: number } | null;
  pirate: { q: number; r: number } | null;
  /**
   * Relative share of each terrain when filling random land. Missing or 0 means never.
   * `iceberg` is different: the percent of sea tiles that become icebergs.
   */
  pool: Partial<Record<FillKind, number>>;
  /** Kinds random harbors never become (the editor shows the rest as what they can give). */
  harborExclude: (Resource | 'any')[];
  /**
   * Each game, numbers swap with their equal-odds partner (2↔12, 3↔11, 4↔10, 5↔9, 6↔8), half
   * each way, so a board with set numbers plays differently with the same odds.
   */
  swapNumbers?: boolean;
  /** Own random-land mixes for some islands, keyed by one of the island's tiles (`q,r`). */
  islandPools?: Record<string, Pool>;
  /** What fog tiles may turn out to be, as shares (default FOG_POOL). */
  fogPool?: Partial<Record<FogKind, number>>;
  /** The fog mix is exact counts (e.g. exactly 2 gold), not shares. False is kept, so a version can turn it off. */
  fogExact?: boolean;
  /** 0–RICH_LEVELS: how much richer random numbers are on islands closed to setup (0 is the normal mix). */
  richIslands?: number;
  /** Expansions whose rules or pieces the board needs. Absent: Seafarers when it has sea (see boardExpansions). */
  expansions?: Expansion[];
  /** Rules between link letters (all must hold when random land is drawn). */
  linkRules?: LinkRule[];
  /** Corners where no starting settlement may go, beyond closed islands. */
  noStart?: CornerKey[];
  /** -2 (poorer) to 2 (richer): how good random numbers are on each terrain, board-wide. */
  numberBias?: Partial<Record<FillKind, number>>;
  /** Other layouts of this board for other player counts (the first whose range fits is played). */
  versions?: BoardVersion[];
  updatedAt: number;
}

/** The layout to play with `players` seated: the first version made for that count, or the board itself. */
export function designFor(design: BoardDesign, players: number): BoardDesign {
  const version = design.versions?.find(v => players >= v.players.min && players <= v.players.max);
  return version ? { ...design, ...version } : design;
}

/** "3–4", or "3" when the range is one number. */
export const playerRange = (p: { min: number; max: number }): string =>
  p.min === p.max ? `${p.min}` : `${p.min}–${p.max}`;

/** Every player count the board (or one of its versions) is made for, fewest players first. */
export function playerRanges(design: Pick<BoardDesign, 'players' | 'versions'>): { min: number; max: number }[] {
  return [design.players, ...(design.versions ?? []).map(v => v.players)].sort((a, b) => a.min - b.min);
}

/** The board and each of its versions as a whole design to show or play, fewest players first. */
export function layoutsOf(design: BoardDesign): BoardDesign[] {
  const versions = (design.versions ?? []).map(version => ({ ...design, ...version }));
  return [design, ...versions].sort((a, b) => a.players.min - b.players.min);
}

/** Expansions a board can say it needs, in the order the picker lists them. */
export const EXPANSIONS = {
  seafarers: 'Seafarers',
  'cities-knights': 'Cities & Knights',
  'traders-barbarians': 'Traders & Barbarians',
  'explorers-pirates': 'Explorers & Pirates',
} as const;
export type Expansion = keyof typeof EXPANSIONS;

/** The expansions a board needs: what its editor chose, or Seafarers when ships are needed to play it. */
export function boardExpansions(design: Pick<BoardDesign, 'expansions' | 'tiles'>): Expansion[] {
  return design.expansions ?? (needsShips(design.tiles) ? ['seafarers'] : []);
}

/**
 * Ships (and so the pirate) are needed only when some land is out of reach by road: the land is
 * split into more than one island, or fog hides tiles to explore. One island ringed by sea isn't.
 */
function needsShips(tiles: Pick<DesignTile, 'q' | 'r' | 'kind'>[]): boolean {
  if (!tiles.some(t => t.kind === 'sea')) return false;
  if (tiles.some(t => t.kind === 'fog')) return true;
  const land = new Set(tiles.filter(t => t.kind !== 'sea').map(t => tileKey(t.q, t.r)));
  const [first] = land;
  if (!first) return false;
  const reached = new Set([first]);
  const queue = [first];
  while (queue.length) {
    const [q, r] = queue.pop()!.split(',').map(Number) as [number, number];
    for (const [dq, dr] of SIDE_DIRECTIONS) {
      const key = tileKey(q + dq, r + dr);
      if (land.has(key) && !reached.has(key)) {
        reached.add(key);
        queue.push(key);
      }
    }
  }
  return reached.size < land.size;
}

/** The Fog Islands stack: two sea, two gold, and eight land tiles. */
export const FOG_POOL: Partial<Record<FogKind, number>> = {
  sea: 2,
  gold: 2,
  wheat: 2,
  brick: 2,
  ore: 2,
  sheep: 1,
  wood: 1,
};

/** Random-land presets for the editor: shares per terrain (iceberg is a percent of sea). */
export const POOL_PRESETS: Record<'base' | 'tropic' | 'polar' | 'all', Partial<Record<FillKind, number>>> = {
  base: { wood: 4, sheep: 4, wheat: 4, brick: 3, ore: 3, desert: 1 },
  tropic: { wood: 4, sheep: 3, wheat: 4, brick: 3, ore: 3, gold: 1, jungle: 2, volcano: 1 },
  polar: { wood: 4, sheep: 4, wheat: 4, brick: 3, ore: 3, desert: 1, iceberg: 10 },
  all: { wood: 4, sheep: 3, wheat: 4, brick: 3, ore: 3, desert: 1, gold: 1, jungle: 2, volcano: 1, iceberg: 8 },
};

export interface BoardCategory {
  id: string;
  name: string;
  /** Hex color used for the category's label and card edges. */
  color: string;
}

/** Everything the map picker and editor show. Boards are listed in array order. */
export interface BoardLibrary {
  categories: BoardCategory[];
  boards: BoardDesign[];
}

/** The base game's terrain mix (19 tiles). Random land uses it unless a design changes it. */
export const BASE_POOL: Partial<Record<FillKind, number>> = {
  wood: 4,
  sheep: 4,
  wheat: 4,
  brick: 3,
  ore: 3,
  desert: 1,
};

/** Axial neighbor across side k of a hex (side k joins corners k and k+1). */
export const SIDE_DIRECTIONS: readonly [number, number][] = [
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
  [1, 0],
];

export const tileKey = (q: number, r: number) => `${q},${r}`;
