import { ISLAND_ROWS, type IslandSize, islandCells, islandSize } from '../../../shared/board';
import type { BoardDesign, BoardLibrary } from '../../../shared/maps';
import { BASE_POOL, playerRange, playerRanges } from '../../../shared/maps';
import type { MapInfo } from '../../../shared/types';

export { playerRange };

/** True when a room of `count` players is outside every range the map (or one of its versions) is made for. */
export const playersMismatch = (design: Pick<BoardDesign, 'players' | 'versions'>, count: number) =>
  !playerRanges(design).some(r => count >= r.min && count <= r.max);

/** Ranges joined where they meet: 2–4 and 5–6 read as 2–6; a gap keeps them apart ("2, 5–6"). */
function rangesLabel(ranges: { min: number; max: number }[]): string {
  const merged: { min: number; max: number }[] = [];
  for (const r of [...ranges].sort((a, b) => a.min - b.min)) {
    const last = merged.at(-1);
    if (last && r.min <= last.max + 1) last.max = Math.max(last.max, r.max);
    else merged.push({ ...r });
  }
  return merged.map(playerRange).join(', ');
}

/** "2–6": every player count a map has a layout for. */
export const playersLabel = (design: Pick<BoardDesign, 'players' | 'versions'>) => rangesLabel(playerRanges(design));

const fits = (range: { min: number; max: number }, count: number) => count >= range.min && count <= range.max;

/** The room's chosen map's player counts: the layout the host picked, or every layout. */
export const roomMapPlayers = (map: MapInfo) => (map.layout ? playerRange(map.layout) : rangesLabel(map.layouts));

/** The lobby's warning when the chosen map (or the layout the host picked) doesn't fit the room, else null. */
export function roomMapWarning(map: MapInfo, players: number): string | null {
  if (map.layout)
    return fits(map.layout, players)
      ? null
      : `${map.name}: the ${playerRange(map.layout)} player map is chosen. This room has ${players}.`;
  return map.layouts.some(range => fits(range, players))
    ? null
    : `${map.name} is made for ${roomMapPlayers(map)} players. This room has ${players}.`;
}

const ISLAND_INFO: Record<IslandSize, { name: string; players: { min: number; max: number } }> = {
  standard: { name: 'Standard island', players: { min: 2, max: 4 } },
  large: { name: 'Large island', players: { min: 5, max: 6 } },
  huge: { name: 'Huge island', players: { min: 7, max: 8 } },
};

/** A preview of the base game's island, as plain land (the layout is drawn at the start). */
function baseIsland(size: IslandSize): BoardDesign {
  return {
    id: 'base',
    name: ISLAND_INFO[size].name,
    categoryId: '',
    description: '',
    players: ISLAND_INFO[size].players,
    victoryPoints: 10,
    tiles: islandCells(ISLAND_ROWS[size]).map(c => ({ ...c, kind: 'land' as const })),
    harbors: [],
    robber: null,
    pirate: null,
    pool: { ...BASE_POOL },
    harborExclude: [],
    expansions: [],
    updatedAt: 0,
  };
}
const BASE_ISLANDS: Record<IslandSize, BoardDesign> = {
  standard: baseIsland('standard'),
  large: baseIsland('large'),
  huge: baseIsland('huge'),
};
/** The base island a table of `players` plays, as a preview. */
export const baseIslandFor = (players: number): BoardDesign => BASE_ISLANDS[islandSize(players)];

/** The base game as a map card: the standard island, with larger ones for 5–6 and 7–8 players. Never edited. */
export const BASE_GAME: BoardDesign = {
  ...BASE_ISLANDS.standard,
  name: 'Base game',
  description: 'The usual island, drawn at random each game.',
  versions: [BASE_ISLANDS.large, BASE_ISLANDS.huge].map(island => ({
    players: island.players,
    victoryPoints: island.victoryPoints,
    tiles: island.tiles,
    harbors: [],
    robber: null,
    pirate: null,
  })),
};
/** The base game's map id in choose-map and propose-map. */
export const BASE_MAP_ID = 'base';

/** The category the base game card leads: the one named "Base", else the first. */
export const baseCategoryId = (library: BoardLibrary) =>
  (library.categories.find(c => /^base$/i.test(c.name.trim())) ?? library.categories[0])?.id;

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
