import { ISLAND_ROWS, islandCells } from '../../../shared/board';
import type { BoardDesign, BoardLibrary } from '../../../shared/maps';
import { BASE_POOL } from '../../../shared/maps';
import { closedTiles } from '../../../shared/maps/edit';

/** "3–4", or "3" when the range is one number. */
export const playerRange = (p: { min: number; max: number }) => (p.min === p.max ? `${p.min}` : `${p.min}–${p.max}`);

/** True when a room of `count` players is outside the map's intended range. */
export const playersMismatch = (design: { players: BoardDesign['players'] }, count: number) =>
  count < design.players.min || count > design.players.max;

/** Plain-language rules for the special tiles and markers a map uses. */
export function mapRules(design: BoardDesign): string[] {
  const kinds = new Set(design.tiles.map(t => t.kind));
  const pool = (kind: keyof BoardDesign['pool']) => kinds.has(kind) || (kinds.has('land') && !!design.pool[kind]);
  const rules: string[] = [];
  if (kinds.has('sea')) rules.push('Ships cost lumber and wool. Move one ship from the open end of a line each turn.');
  if (pool('gold')) rules.push('Gold fields pay any resource you choose.');
  if (pool('volcano'))
    rules.push(
      'Volcanoes pay like gold. When one is rolled, a die names a corner: a city there drops to a settlement, a settlement is lost.',
    );
  if (pool('jungle')) rules.push('Jungles give discoveries. Each pays one resource of a development card.');
  if (pool('iceberg')) rules.push('Ships cannot sail beside icebergs.');
  if (design.tiles.some(t => t.bonus))
    rules.push('The first settlement each player builds on a marked island earns its bonus points.');
  if (closedTiles(design).size) rules.push('Starting settlements go only on islands outlined in yellow.');
  return rules;
}

/** The standard island as a design, for its thumbnail. */
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
