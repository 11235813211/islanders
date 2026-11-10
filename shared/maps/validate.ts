import { VICTORY_POINT_RANGE } from '../settings';
import { RESOURCES, type Resource, SEA_TERRAINS, type Terrain } from '../types';
import { RICH_LEVELS } from './balance';
import {
  type BoardCategory,
  type BoardDesign,
  type BoardVersion,
  type DesignHarbor,
  type DesignKind,
  type DesignTile,
  EXPANSIONS,
  type Expansion,
  type FillKind,
  type FogKind,
  type LinkRule,
  type Pool,
} from './types';

/** Limits that keep a board small enough to send and to play within the server's CPU budget. */
export const DESIGN_LIMITS = { tiles: 260, harbors: 60, coordinate: 24, categories: 24, boards: 120 } as const;
/** Most of the sea that random icebergs may cover. */
export const ICEBERG_MAX_PERCENT = 50;
export const DESIGN_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const LINK_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const KINDS: DesignKind[] = [...RESOURCES, 'desert', ...SEA_TERRAINS, 'land'];
const FILL_KINDS: FillKind[] = [...RESOURCES, 'desert', 'gold', 'jungle', 'volcano', 'iceberg'];
const FOG_KINDS: FogKind[] = ['sea', ...RESOURCES, 'desert', 'gold', 'jungle', 'volcano'];
/** Fog contents in the order the editor lists them. */
export const FOG_POOL_KINDS = FOG_KINDS;

/** A terrain mix: shares 0–20 in steps of 0.1 (icebergs: a whole percent of the sea). */
function parsePool(value: unknown, kinds: readonly string[]): Record<string, number> {
  if (!record(value)) return fail('Invalid terrain mix.');
  const pool: Record<string, number> = {};
  for (const [kind, weight] of Object.entries(value)) {
    // Shares may use one decimal place (the editor steps by 0.1).
    const tenths = typeof weight === 'number' ? weight * 10 : Number.NaN;
    if (kind === 'iceberg') {
      if (!int(weight, 0, ICEBERG_MAX_PERCENT)) fail(`Icebergs cover 0–${ICEBERG_MAX_PERCENT}% of the sea.`);
    } else if (!kinds.includes(kind) || !(tenths >= 0 && tenths <= 200) || Math.abs(tenths - Math.round(tenths)) > 1e-6)
      fail('Terrain mix values are 0–20, in steps of 0.1.');
    if ((weight as number) > 0) pool[kind] = weight as number;
  }
  return pool;
}

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
  if (t.pips !== undefined) {
    if (!Array.isArray(t.pips) || !t.pips.every(p => int(p, 1, 5))) fail('Number limits are 1 to 5 dots.');
    const pips = [...new Set(t.pips as number[])].sort();
    if (pips.length && pips.length < 5) tile.pips = pips;
  }
  const l = link(t.link);
  const notL = link(t.notLink);
  if (l && tile.kind !== 'sea' && tile.kind !== 'iceberg') tile.link = l;
  else if (notL && tile.kind === 'land') tile.notLink = notL;
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
  const notL = link(h.notLink);
  if (l && harbor.kind !== 'any') harbor.link = l;
  else if (notL && harbor.kind === 'random') harbor.notLink = notL;
  return harbor;
}

/** Check an untrusted design (from the editor) and return a clean copy, or throw DesignError. */
export function parseDesign(value: unknown, categoryIds: string[]): BoardDesign {
  if (!record(value)) return fail('Invalid board.');
  if (typeof value.id !== 'string' || !DESIGN_ID.test(value.id)) fail('Invalid board id.');
  const name = text(value.name, 40, 'Name');
  if (!name) fail('Give the board a name.');
  if (typeof value.categoryId !== 'string' || !categoryIds.includes(value.categoryId)) fail('Choose a category.');
  const layout = parseLayout(value);
  const pool = parsePool(value.pool, FILL_KINDS) as Pool;
  const islandPools: Record<string, Pool> = {};
  if (value.islandPools !== undefined) {
    if (!record(value.islandPools) || Object.keys(value.islandPools).length > 40) fail('Invalid island mixes.');
    for (const [key, mix] of Object.entries(value.islandPools as Record<string, unknown>)) {
      if (!/^-?\d{1,2},-?\d{1,2}$/.test(key)) fail('Invalid island mixes.');
      islandPools[key] = parsePool(mix, FILL_KINDS) as Pool;
    }
  }
  const exclude = value.harborExclude;
  if (!Array.isArray(exclude) || !exclude.every(r => r === 'any' || RESOURCES.includes(r)))
    fail('Invalid harbor exclusions.');
  if (value.swapNumbers !== undefined && typeof value.swapNumbers !== 'boolean') fail('Invalid number swap setting.');
  if (value.richIslands !== undefined && !int(value.richIslands, 0, RICH_LEVELS))
    fail('Invalid closed-island numbers.');
  // "5–6 players" was once an expansion; the player count now decides it.
  const expansions = Array.isArray(value.expansions)
    ? value.expansions.filter(e => e !== 'five-six')
    : value.expansions;
  if (
    expansions !== undefined &&
    (!Array.isArray(expansions) || !expansions.every(e => Object.hasOwn(EXPANSIONS, e as string)))
  )
    fail('Unknown expansion.');
  const linkRules = value.linkRules === undefined ? [] : parseLinkRules(value.linkRules);
  const numberBias: BoardDesign['numberBias'] = {};
  if (value.numberBias !== undefined) {
    if (!record(value.numberBias)) fail('Invalid number richness.');
    for (const [kind, level] of Object.entries(value.numberBias as Record<string, unknown>)) {
      if (!FILL_KINDS.includes(kind as FillKind) || !int(level, -2, 2)) fail('Number richness runs from -2 to 2.');
      if (level) numberBias[kind as FillKind] = level as number;
    }
  }
  if (value.versions !== undefined && (!Array.isArray(value.versions) || value.versions.length > 4))
    fail('A board has at most four versions.');
  const versions = ((value.versions as unknown[] | undefined) ?? []).map(v => parseLayout(record(v) ? v : {}));
  return {
    id: value.id as string,
    name,
    categoryId: value.categoryId as string,
    description: text(value.description ?? '', 120, 'Description'),
    ...layout,
    pool,
    ...(Object.keys(islandPools).length ? { islandPools } : {}),
    harborExclude: [...new Set(exclude as BoardDesign['harborExclude'])],
    ...(value.swapNumbers ? { swapNumbers: true } : {}),
    ...(value.richIslands ? { richIslands: value.richIslands as number } : {}),
    ...(expansions ? { expansions: [...new Set(expansions as Expansion[])] } : {}),
    ...(linkRules.length ? { linkRules } : {}),
    ...(Object.keys(numberBias).length ? { numberBias } : {}),
    ...(versions.length ? { versions } : {}),
    updatedAt: 0,
  };
}

/** The parts a version for other player counts can change: players, points, tiles, harbors, starts. */
function parseLayout(value: Record<string, unknown>): BoardVersion {
  const players = value.players as Record<string, unknown>;
  if (
    !record(players) ||
    !int(players.min, 2, 6) ||
    !int(players.max, 2, 6) ||
    (players.min as number) > (players.max as number)
  )
    fail('Players must be a range within 2–6.');
  if (!int(value.victoryPoints, VICTORY_POINT_RANGE.min, VICTORY_POINT_RANGE.max))
    fail(`Points to win must be ${VICTORY_POINT_RANGE.min}–${VICTORY_POINT_RANGE.max}.`);
  if (!Array.isArray(value.tiles) || value.tiles.length < 1 || value.tiles.length > DESIGN_LIMITS.tiles)
    fail(`Use 1–${DESIGN_LIMITS.tiles} tiles.`);
  if (!Array.isArray(value.harbors) || value.harbors.length > DESIGN_LIMITS.harbors)
    fail(`Use at most ${DESIGN_LIMITS.harbors} harbors.`);
  const noStart = value.noStart ?? [];
  if (!Array.isArray(noStart) || noStart.length > 200 || !noStart.every(k => typeof k === 'string' && CORNER.test(k)))
    fail('Invalid no-start corners.');
  return {
    players: { min: players.min as number, max: players.max as number },
    victoryPoints: value.victoryPoints as number,
    tiles: (value.tiles as unknown[]).map(parseTile),
    harbors: (value.harbors as unknown[]).map(parseHarbor),
    robber: cell(value.robber, 'Robber start'),
    pirate: cell(value.pirate, 'Pirate start'),
    ...((noStart as string[]).length ? { noStart: [...new Set(noStart as string[])] } : {}),
    ...(value.fogPool === undefined ? {} : { fogPool: parsePool(value.fogPool, FOG_KINDS) }),
    ...(typeof value.fogExact === 'boolean' ? { fogExact: value.fogExact } : {}),
  };
}

const CORNER = /^-?\d{1,2},-?\d{1,2},[0-5]$/;

/** Rules between link letters: letters A–Z, terrains from the land mix, at most 20 rules. */
function parseLinkRules(value: unknown): LinkRule[] {
  if (!Array.isArray(value) || value.length > 20) return fail('Invalid link rules.');
  return value.map(rule => {
    if (!record(rule) || !Array.isArray(rule.links) || rule.links.length < 1 || rule.links.length > 26)
      return fail('Invalid link rule.');
    const links = [...new Set(rule.links.map(l => link(l)!))];
    if (rule.kind === 'distinct') return { kind: 'distinct', links };
    if (rule.kind !== 'in' || !Array.isArray(rule.terrains) || !rule.terrains.length) return fail('Invalid link rule.');
    if (!rule.terrains.every(t => FILL_KINDS.includes(t as FillKind) && t !== 'iceberg')) fail('Invalid link rule.');
    return { kind: 'in', links, terrains: [...new Set(rule.terrains as FillKind[])] };
  });
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
