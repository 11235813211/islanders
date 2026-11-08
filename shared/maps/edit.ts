import { HEX_RADIUS } from '../board';
import { isProducing } from '../seafaring';
import { RESOURCES, type Resource, type Terrain } from '../types';
import { balancedNumbers, neighborKeys } from './balance';
import { buildBoard, drawHarborKinds } from './generate';
import { autoHarbors } from './harbors';
import {
  BASE_POOL,
  type BoardDesign,
  type DesignHarbor,
  type DesignKind,
  type DesignTile,
  SIDE_DIRECTIONS,
  tileKey,
} from './types';
import { DESIGN_LIMITS, LINK_LETTERS } from './validate';

/**
 * Edits the board editor makes. Each returns a new design and never mutates its input, so the
 * editor can keep an undo history of plain snapshots.
 */

const isLand = (kind: DesignKind) => kind !== 'sea' && kind !== 'iceberg';
/** `land` will become a producing terrain most of the time, so it carries a number like one. */
export const takesNumber = (kind: DesignKind) => kind === 'land' || isProducing(kind as Terrain);

/** The axial cell under a board point (pixel → hex, rounded to the nearest cell). */
export function cellAt(x: number, y: number): { q: number; r: number } {
  const fq = ((Math.sqrt(3) / 3) * x - y / 3) / HEX_RADIUS;
  const fr = ((2 / 3) * y) / HEX_RADIUS;
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q + 0, r: r + 0 };
}

/** The side (0–5) of cell (q, r) nearest a board point. */
export function sideAt(q: number, r: number, x: number, y: number): number {
  const cx = Math.sqrt(3) * HEX_RADIUS * (q + r / 2);
  const cy = 1.5 * HEX_RADIUS * r;
  const angle = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
  // Side k faces 60 + 60k degrees.
  return (((Math.round((angle - 60) / 60) % 6) + 6) % 6) as number;
}

/** Fresh designs: one sea tile, or the standard island's 19 land tiles ringed by sea with nine harbors. */
export function newDesign(kind: 'blank' | 'base', id: string, categoryId: string, name: string): BoardDesign {
  const tiles: DesignTile[] = [];
  if (kind === 'blank') tiles.push({ q: 0, r: 0, kind: 'sea' });
  else
    for (let r = -3; r <= 3; r++)
      for (let q = Math.max(-3, -r - 3); q <= Math.min(3, -r + 3); q++)
        tiles.push({ q, r, kind: Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) === 3 ? 'sea' : 'land' });
  return {
    id,
    name,
    categoryId,
    description: '',
    players: { min: 3, max: 4 },
    victoryPoints: 13,
    tiles,
    harbors: kind === 'base' ? autoHarbors(tiles, 9) : [],
    robber: null,
    pirate: null,
    pool: { ...BASE_POOL },
    harborExclude: [],
    updatedAt: 0,
  };
}

/** Drop harbors, starts, and links that no longer fit the tiles. */
function tidy(design: BoardDesign): BoardDesign {
  const byKey = new Map(design.tiles.map(t => [tileKey(t.q, t.r), t]));
  const harbors = design.harbors.filter(h => {
    const land = byKey.get(tileKey(h.q, h.r));
    const [dq, dr] = SIDE_DIRECTIONS[h.side]!;
    const across = byKey.get(tileKey(h.q + dq, h.r + dr));
    return !!land && isLand(land.kind) && (!across || !isLand(across.kind));
  });
  const robber = design.robber && isLand(byKey.get(tileKey(design.robber.q, design.robber.r))?.kind ?? 'sea');
  const pirate = design.pirate && byKey.get(tileKey(design.pirate.q, design.pirate.r))?.kind === 'sea';
  return {
    ...design,
    tiles: design.tiles.map(t => {
      if (isLand(t.kind)) return t;
      const { number: _n, link: _l, noSetup: _s, bonus: _b, ...rest } = t;
      return rest;
    }),
    harbors,
    robber: robber ? design.robber : null,
    pirate: pirate ? design.pirate : null,
  };
}

/**
 * Paint cells: a terrain sets (or adds) each tile, `erase` removes it, and `sea-new` adds sea
 * only where there is no tile yet (dragging out from the board grows it with sea).
 */
export function paint(design: BoardDesign, cells: { q: number; r: number }[], brush: DesignKind | 'erase' | 'sea-new') {
  const byKey = new Map(design.tiles.map(t => [tileKey(t.q, t.r), t]));
  for (const { q, r } of cells) {
    const key = tileKey(q, r);
    const lim = DESIGN_LIMITS.coordinate;
    if (Math.abs(q) > lim || Math.abs(r) > lim) continue;
    const tile = byKey.get(key);
    if (brush === 'erase') byKey.delete(key);
    else if (brush === 'sea-new') {
      if (!tile && byKey.size < DESIGN_LIMITS.tiles) byKey.set(key, { q, r, kind: 'sea' });
    } else if (tile) {
      if (tile.kind !== brush) {
        const kept = takesNumber(brush) ? tile : { q, r, link: tile.link };
        byKey.set(key, { ...kept, q, r, kind: brush });
      }
    } else if (byKey.size < DESIGN_LIMITS.tiles) byKey.set(key, { q, r, kind: brush });
  }
  return tidy({ ...design, tiles: [...byKey.values()] });
}

/** Change one tile's fields (kind, number, link, flags). */
export function updateTile(design: BoardDesign, q: number, r: number, patch: Partial<DesignTile>): BoardDesign {
  return tidy({
    ...design,
    tiles: design.tiles.map(t => {
      if (t.q !== q || t.r !== r) return t;
      const next: DesignTile = { ...t, ...patch, q, r };
      for (const key of Object.keys(patch) as (keyof DesignTile)[]) if (patch[key] === undefined) delete next[key];
      if (!takesNumber(next.kind)) delete next.number;
      return next;
    }),
  });
}

/** Number tokens in click order; undefined means "random". */
const NUMBER_CYCLE: (number | undefined)[] = [undefined, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12];

/** The next (or previous) number for a token: random → 2 → … → 12 → random. */
export function stepNumber(current: number | undefined, delta: 1 | -1): number | undefined {
  const at = Math.max(0, NUMBER_CYCLE.indexOf(current));
  return NUMBER_CYCLE[(at + delta + NUMBER_CYCLE.length) % NUMBER_CYCLE.length];
}

/** The land tiles connected to (q, r), including it. Empty for water. */
export function islandOf(design: BoardDesign, q: number, r: number): DesignTile[] {
  const byKey = new Map(design.tiles.filter(t => isLand(t.kind)).map(t => [tileKey(t.q, t.r), t]));
  const start = byKey.get(tileKey(q, r));
  if (!start) return [];
  const found = new Map([[tileKey(q, r), start]]);
  const queue = [start];
  while (queue.length) {
    const tile = queue.pop()!;
    for (const key of neighborKeys(tile)) {
      const next = byKey.get(key);
      if (next && !found.has(key)) {
        found.set(key, next);
        queue.push(next);
      }
    }
  }
  return [...found.values()];
}

/** Keys of every land tile on an island closed to setup settlements (one flagged tile closes its island). */
export function closedTiles(design: BoardDesign): Set<string> {
  const closed = new Set<string>();
  for (const tile of design.tiles)
    if (tile.noSetup && !closed.has(tileKey(tile.q, tile.r)))
      for (const member of islandOf(design, tile.q, tile.r)) closed.add(tileKey(member.q, member.r));
  return closed;
}

/** Open or close a whole island to setup settlements. */
export function setIslandClosed(design: BoardDesign, q: number, r: number, closed: boolean): BoardDesign {
  const members = new Set(islandOf(design, q, r).map(t => tileKey(t.q, t.r)));
  return {
    ...design,
    tiles: design.tiles.map(t => {
      if (!members.has(tileKey(t.q, t.r))) return t;
      const { noSetup: _old, ...rest } = t;
      return closed ? { ...rest, noSetup: true } : rest;
    }),
  };
}

/** Set an island's bonus chip (0 removes it). The chip sits on this tile; others on the island lose theirs. */
export function setIslandBonus(design: BoardDesign, q: number, r: number, bonus: number): BoardDesign {
  const members = new Set(islandOf(design, q, r).map(t => tileKey(t.q, t.r)));
  return {
    ...design,
    tiles: design.tiles.map(t => {
      if (!members.has(tileKey(t.q, t.r))) return t;
      const { bonus: _old, ...rest } = t;
      return t.q === q && t.r === r && bonus > 0 ? { ...rest, bonus } : rest;
    }),
  };
}

/** The harbor on the edge between (q, r) and its neighbor across `side`, written from the land side. */
export function harborEdge(
  design: BoardDesign,
  q: number,
  r: number,
  side: number,
): { q: number; r: number; side: number } | null {
  const byKey = new Map(design.tiles.map(t => [tileKey(t.q, t.r), t]));
  const [dq, dr] = SIDE_DIRECTIONS[side]!;
  const here = byKey.get(tileKey(q, r));
  const there = byKey.get(tileKey(q + dq, r + dr));
  if (here && isLand(here.kind) && (!there || !isLand(there.kind))) return { q, r, side };
  if (there && isLand(there.kind) && (!here || !isLand(here.kind)))
    return { q: q + dq, r: r + dr, side: (side + 3) % 6 };
  return null;
}

const sameEdge = (a: { q: number; r: number; side: number }, b: { q: number; r: number; side: number }) =>
  a.q === b.q && a.r === b.r && a.side === b.side;

/** Add a random harbor on a coast edge, or remove the one already there. */
export function toggleHarbor(design: BoardDesign, q: number, r: number, side: number): BoardDesign {
  const edge = harborEdge(design, q, r, side);
  if (!edge) return design;
  const existing = design.harbors.find(h => sameEdge(h, edge));
  if (existing) return { ...design, harbors: design.harbors.filter(h => h !== existing) };
  if (design.harbors.length >= DESIGN_LIMITS.harbors) return design;
  return { ...design, harbors: [...design.harbors, { ...edge, kind: 'random' }] };
}

export function updateHarbor(design: BoardDesign, harbor: DesignHarbor, patch: Partial<DesignHarbor>): BoardDesign {
  return {
    ...design,
    harbors: design.harbors.map(h => {
      if (!sameEdge(h, harbor)) return h;
      const next = { ...h, ...patch };
      if (patch.link === undefined && 'link' in patch) delete next.link;
      return next;
    }),
  };
}

/** The first link letter no tile or harbor uses yet. */
export function nextLink(design: BoardDesign): string {
  const used = new Set([...design.tiles, ...design.harbors].map(t => t.link).filter(Boolean));
  return [...LINK_LETTERS].find(l => !used.has(l)) ?? 'Z';
}

/** Turn every random land tile into the terrain a balanced draw gives it. Linked groups stay matched. */
export function fillLand(design: BoardDesign, random: () => number = Math.random): BoardDesign {
  const { board } = buildBoard(design, random);
  const drawn = new Map(board.hexes.map(h => [tileKey(h.q, h.r), h.terrain]));
  return tidy({
    ...design,
    tiles: design.tiles.map(t => (t.kind === 'land' ? { ...t, kind: drawn.get(tileKey(t.q, t.r)) ?? 'land' } : t)),
  });
}

/** Give every numbered tile without a number a balanced one (keeping the numbers already set). */
export function fillNumbers(design: BoardDesign, random: () => number = Math.random): BoardDesign {
  const producing = design.tiles.filter(t => takesNumber(t.kind)).map(t => ({ q: t.q, r: t.r, terrain: t.kind }));
  const fixed = new Map(
    design.tiles.filter(t => t.number !== undefined && takesNumber(t.kind)).map(t => [tileKey(t.q, t.r), t.number!]),
  );
  const numbers = balancedNumbers(producing, fixed, random);
  return {
    ...design,
    tiles: design.tiles.map(t => (takesNumber(t.kind) ? { ...t, number: numbers.get(tileKey(t.q, t.r)) } : t)),
  };
}

/** About one harbor per two land tiles, like the base game's 9 for 19. */
export const harborTarget = (design: BoardDesign) =>
  Math.max(3, Math.round(design.tiles.filter(t => isLand(t.kind)).length / 2.1));

/** Add harbors spread around the coasts until the board has about its share (a new spread each call). */
export function placeHarbors(design: BoardDesign, random: () => number = Math.random): BoardDesign {
  const extra = autoHarbors(design.tiles, harborTarget(design) - design.harbors.length, design.harbors, random);
  return { ...design, harbors: [...design.harbors, ...extra] };
}

/** Give every random harbor a kind from a balanced draw (fixed and excluded kinds respected). */
export function fillHarbors(design: BoardDesign, random: () => number = Math.random): BoardDesign {
  const kinds = drawHarborKinds(design, random);
  return {
    ...design,
    harbors: design.harbors.map(h =>
      h.kind === 'random' ? { ...h, kind: kinds.get(`${h.q},${h.r},${h.side}`) ?? 'random' } : h,
    ),
  };
}

/** Make every number random again. */
export function clearNumbers(design: BoardDesign): BoardDesign {
  return {
    ...design,
    tiles: design.tiles.map(t => {
      const { number: _n, ...rest } = t;
      return rest;
    }),
  };
}

/** Problems worth fixing before a board is played. Empty when the board looks playable. */
export function designWarnings(design: BoardDesign): string[] {
  const warnings: string[] = [];
  const land = design.tiles.filter(t => isLand(t.kind));
  if (!land.length) warnings.push('Add some land (Shift + drag).');
  if (land.length && !design.tiles.some(t => t.kind === 'sea'))
    warnings.push('There is no sea, so ships and the pirate are not in play.');
  const open = land.filter(t => !t.noSetup && t.kind !== 'desert');
  if (land.length && open.length < design.players.max * 2)
    warnings.push(
      `Only ${open.length} land tiles allow starting settlements; ${design.players.max} players need room for ${design.players.max * 2}.`,
    );
  const linked = new Map<string, Set<string>>();
  for (const t of design.tiles)
    if (t.link && t.kind !== 'land') linked.set(t.link, new Set([...(linked.get(t.link) ?? []), t.kind]));
  for (const [letter, kinds] of linked)
    if (kinds.size > 1) warnings.push(`Link ${letter} joins tiles set to different terrains; the first one wins.`);
  const harborLinks = design.harbors.filter(h => h.link).map(h => h.link!);
  for (const letter of harborLinks) {
    const fixed = design.tiles.find(t => t.link === letter && t.kind !== 'land');
    if (fixed && !RESOURCES.includes(fixed.kind as Resource))
      warnings.push(`Harbor link ${letter} follows a ${fixed.kind} tile, so it becomes a random harbor.`);
  }
  return [...new Set(warnings)];
}
