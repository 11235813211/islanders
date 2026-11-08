import { VICTORY_POINT_RANGE } from '../settings';
import { RESOURCES, type Resource, SEA_TERRAINS, type Terrain } from '../types';
import type { BoardCategory, BoardDesign, DesignHarbor, DesignKind, DesignTile, FillKind } from './types';

/** Limits that keep a board small enough to send and to play within the server's CPU budget. */
export const DESIGN_LIMITS = { tiles: 260, harbors: 60, coordinate: 24, categories: 24, boards: 120 } as const;
export const DESIGN_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const LINK_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const KINDS: DesignKind[] = [...RESOURCES, 'desert', ...SEA_TERRAINS, 'land'];
const FILL_KINDS: FillKind[] = [...RESOURCES, 'desert', 'gold', 'jungle', 'volcano', 'iceberg'];

export class DesignError extends Error {}
const fail = (message: string): never => {
  throw new DesignError(message);
};
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, min: number, max: number) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const text = (v: unknown, max: number, label: string) => {
  if (typeof v !== 'string' || v.trim().length > max || /[\p{Cc}<>]/u.test(v))
    fail(`${label} must be at most ${max} characters.`);
  return (v as string).trim();
};
const link = (v: unknown) => {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || v.length !== 1 || !LINK_LETTERS.includes(v)) fail('Links are single letters A–Z.');
  return v as string;
};
const cell = (v: unknown, label: string) => {
  if (v === null || v === undefined) return null;
  const c = DESIGN_LIMITS.coordinate;
  if (!record(v) || !int(v.q, -c, c) || !int(v.r, -c, c)) fail(`${label} is not a tile.`);
  return { q: (v as { q: number }).q, r: (v as { r: number }).r };
};

function parseTile(v: unknown): DesignTile {
  const c = DESIGN_LIMITS.coordinate;
  if (!record(v) || !int(v.q, -c, c) || !int(v.r, -c, c)) fail('A tile is outside the editing area.');
  const t = v as Record<string, unknown>;
  if (!KINDS.includes(t.kind as DesignKind)) fail('A tile has an unknown terrain.');
  const tile: DesignTile = { q: t.q as number, r: t.r as number, kind: t.kind as DesignKind };
  if (t.number !== undefined) {
    if (!int(t.number, 2, 12) || t.number === 7) fail('Numbers run from 2 to 12, without 7.');
    tile.number = t.number as number;
  }
  const l = link(t.link);
  if (l) tile.link = l;
  if (t.noSetup === true) tile.noSetup = true;
  if (t.bonus !== undefined) {
    if (!int(t.bonus, 1, 3)) fail('Island bonuses are 1 to 3 points.');
    tile.bonus = t.bonus as number;
  }
  return tile;
}

function parseHarbor(v: unknown): DesignHarbor {
  const c = DESIGN_LIMITS.coordinate;
  if (!record(v) || !int(v.q, -c, c) || !int(v.r, -c, c) || !int(v.side, 0, 5)) fail('A harbor is not on a tile edge.');
  const h = v as Record<string, unknown>;
  if (h.kind !== 'any' && h.kind !== 'random' && !RESOURCES.includes(h.kind as Resource))
    fail('A harbor has an unknown kind.');
  const harbor: DesignHarbor = {
    q: h.q as number,
    r: h.r as number,
    side: h.side as number,
    kind: h.kind as DesignHarbor['kind'],
  };
  const l = link(h.link);
  if (l) harbor.link = l;
  return harbor;
}

/** Check an untrusted design (from the editor) and return a clean copy, or throw DesignError. */
export function parseDesign(value: unknown, categoryIds: string[]): BoardDesign {
  if (!record(value)) return fail('Invalid board.');
  if (typeof value.id !== 'string' || !DESIGN_ID.test(value.id)) fail('Invalid board id.');
  const name = text(value.name, 40, 'Name');
  if (!name) fail('Give the board a name.');
  if (typeof value.categoryId !== 'string' || !categoryIds.includes(value.categoryId)) fail('Choose a category.');
  const players = value.players as Record<string, unknown>;
  if (
    !record(players) ||
    !int(players.min, 2, 4) ||
    !int(players.max, 2, 4) ||
    (players.min as number) > (players.max as number)
  )
    fail('Players must be a range within 2–4.');
  if (!int(value.victoryPoints, VICTORY_POINT_RANGE.min, VICTORY_POINT_RANGE.max))
    fail(`Points to win must be ${VICTORY_POINT_RANGE.min}–${VICTORY_POINT_RANGE.max}.`);
  if (!Array.isArray(value.tiles) || value.tiles.length < 1 || value.tiles.length > DESIGN_LIMITS.tiles)
    fail(`Use 1–${DESIGN_LIMITS.tiles} tiles.`);
  if (!Array.isArray(value.harbors) || value.harbors.length > DESIGN_LIMITS.harbors)
    fail(`Use at most ${DESIGN_LIMITS.harbors} harbors.`);
  const pool: BoardDesign['pool'] = {};
  if (!record(value.pool)) fail('Invalid terrain mix.');
  for (const [kind, weight] of Object.entries(value.pool as Record<string, unknown>)) {
    if (!FILL_KINDS.includes(kind as FillKind) || !int(weight, 0, 20)) fail('Terrain mix values are 0–20.');
    if ((weight as number) > 0) pool[kind as FillKind] = weight as number;
  }
  const exclude = value.harborExclude;
  if (!Array.isArray(exclude) || !exclude.every(r => RESOURCES.includes(r))) fail('Invalid harbor exclusions.');
  return {
    id: value.id as string,
    name,
    categoryId: value.categoryId as string,
    description: text(value.description ?? '', 120, 'Description'),
    players: { min: players.min as number, max: players.max as number },
    victoryPoints: value.victoryPoints as number,
    tiles: (value.tiles as unknown[]).map(parseTile),
    harbors: (value.harbors as unknown[]).map(parseHarbor),
    robber: cell(value.robber, 'Robber start'),
    pirate: cell(value.pirate, 'Pirate start'),
    pool,
    harborExclude: [...new Set(exclude as Resource[])],
    updatedAt: 0,
  };
}

/** Check an untrusted category list, or throw DesignError. */
export function parseCategories(value: unknown): BoardCategory[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > DESIGN_LIMITS.categories)
    fail(`Use 1–${DESIGN_LIMITS.categories} categories.`);
  const ids = new Set<string>();
  return (value as unknown[]).map(item => {
    if (!record(item) || typeof item.id !== 'string' || !DESIGN_ID.test(item.id) || ids.has(item.id))
      return fail('Invalid category id.');
    ids.add(item.id);
    const name = text(item.name, 32, 'Category name');
    if (!name) fail('Name every category.');
    if (typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.color)) fail('Category colors are #rrggbb.');
    return { id: item.id, name, color: (item.color as string).toLowerCase() };
  });
}

/** Terrains a tile can be set to in the editor (`land` = random). */
export const EDITOR_KINDS: DesignKind[] = KINDS;
export const POOL_KINDS: FillKind[] = FILL_KINDS;
export const isTerrain = (kind: DesignKind): kind is Terrain => kind !== 'land';
