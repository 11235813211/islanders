import type { Resource, Terrain } from '../types';

/**
 * A board as an editor saves it. `buildBoard` (generate.ts) turns a design into a playable
 * Board, filling anything left random with a balanced draw each time a game is set up.
 */

/** A tile in a design. `land` is filled with a random terrain from the design's pool. */
export type DesignKind = Terrain | 'land';
/** Terrains random land can become. */
export type FillKind = Exclude<Terrain, 'sea'>;

export interface DesignTile {
  q: number;
  r: number;
  kind: DesignKind;
  /** Fixed number token. Absent on a producing tile means a balanced random number. */
  number?: number;
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
  /** Relative share of each terrain when filling random land. Missing or 0 means never. */
  pool: Partial<Record<FillKind, number>>;
  /** Kinds random harbors never become (the editor shows the rest as what they can give). */
  harborExclude: (Resource | 'any')[];
  /**
   * Each game, numbers swap with their equal-odds partner (2↔12, 3↔11, 4↔10, 5↔9, 6↔8), half
   * each way, so a board with set numbers plays differently with the same odds.
   */
  swapNumbers?: boolean;
  updatedAt: number;
}

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
