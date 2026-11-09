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
}

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
  /** 0–RICH_LEVELS: how much richer random numbers are on islands closed to setup (0 is the normal mix). */
  richIslands?: number;
  /** Expansions whose rules or pieces the board needs. Absent: Seafarers when it has sea (see boardExpansions). */
  expansions?: Expansion[];
  updatedAt: number;
}

/** Expansions a board can say it needs, in the order the picker lists them. */
export const EXPANSIONS = {
  seafarers: 'Seafarers',
  'cities-knights': 'Cities & Knights',
  'traders-barbarians': 'Traders & Barbarians',
  'explorers-pirates': 'Explorers & Pirates',
  'five-six': '5–6 Players',
} as const;
export type Expansion = keyof typeof EXPANSIONS;

/** The expansions a board needs: what its editor chose, or Seafarers for any board with sea. */
export function boardExpansions(design: Pick<BoardDesign, 'expansions' | 'tiles'>): Expansion[] {
  return design.expansions ?? (design.tiles.some(t => t.kind === 'sea') ? ['seafarers'] : []);
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
