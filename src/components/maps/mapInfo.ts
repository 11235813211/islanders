import { ISLAND_ROWS, islandCells } from '../../../shared/board';
import type { BoardDesign, BoardLibrary } from '../../../shared/maps';
import { BASE_POOL, playerRanges } from '../../../shared/maps';

/** "3–4", or "3" when the range is one number. */
export const playerRange = (p: { min: number; max: number }) => (p.min === p.max ? `${p.min}` : `${p.min}–${p.max}`);

/** True when a room of `count` players is outside every range the map (or one of its versions) is made for. */
export const playersMismatch = (design: Pick<BoardDesign, 'players' | 'versions'>, count: number) =>
  !playerRanges(design).some(r => count >= r.min && count <= r.max);

/** "3–4, 5–6": every player count a map has a layout for. */
export const playersLabel = (design: Pick<BoardDesign, 'players' | 'versions'>) =>
  playerRanges(design).map(playerRange).join(', ');

/** A preview of the base game's island, as plain land (the layout is drawn at the start). */
function baseIsland(large: boolean): BoardDesign {
  return {
    id: 'base',
    name: large ? 'Large island' : 'Standard island',
    categoryId: '',
    description: '',
    players: large ? { min: 5, max: 6 } : { min: 2, max: 4 },
    victoryPoints: 10,
    tiles: islandCells(large ? ISLAND_ROWS.large : ISLAND_ROWS.standard).map(c => ({ ...c, kind: 'land' as const })),
    harbors: [],
    robber: null,
    pirate: null,
    pool: { ...BASE_POOL },
    harborExclude: [],
    expansions: [],
    updatedAt: 0,
  };
}
export const STANDARD_ISLAND = baseIsland(false);
/** The 5–6 player island. */
export const LARGE_ISLAND = baseIsland(true);

/** Move the board `id` to just before `beforeId` (or the end of `categoryId`), in that category. */
export function moveBoard(library: BoardLibrary, id: string, categoryId: string, beforeId?: string): BoardLibrary {
  const board = library.boards.find(b => b.id === id);
  if (!board || id === beforeId) return library;
  const rest = library.boards.filter(b => b.id !== id);
  const moved = { ...board, categoryId };
  let at = beforeId ? rest.findIndex(b => b.id === beforeId) : -1;
  if (at < 0) {
    const last = rest.map(b => b.categoryId).lastIndexOf(categoryId);
    at = last < 0 ? rest.length : last + 1;
  }
  return { ...library, boards: [...rest.slice(0, at), moved, ...rest.slice(at)] };
}
