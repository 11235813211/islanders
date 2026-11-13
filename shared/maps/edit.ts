import { HEX_RADIUS, hexCenter, hexCorner } from '../board';
import { takesToken } from '../seafaring';
import type { Terrain } from '../types';
import { neighborKeys } from './balance';
import { autoHarbors } from './harbors';
import {
  BASE_POOL,
  type BoardDesign,
  type DesignHarbor,
  type DesignKind,
  type DesignTile,
  FOG_POOL,
  SIDE_DIRECTIONS,
  tileKey,
} from './types';
import { DESIGN_LIMITS, LINK_LETTERS } from './validate';

/**
 * Edits the board editor makes. Each returns a new design and never mutates its input, so the
 * editor can keep an undo history of plain snapshots.
 */

/** Land in the design: anything but water and unexplored fog. */
export const isLand = (kind: DesignKind) => kind !== 'sea' && kind !== 'iceberg' && kind !== 'fog';
/** `land` will become a producing terrain most of the time, so it carries a number like one. */
export const takesNumber = (kind: DesignKind) => kind === 'land' || takesToken(kind as Terrain);

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

/** Drop harbors, starts, and links that no longer fit the tiles. Links stay on land and on non-3:1 harbors. */
export function tidy(design: BoardDesign): BoardDesign {
  const byKey = new Map(design.tiles.map(t => [tileKey(t.q, t.r), t]));
  const harborLand = holdsHarbor(design);
  const harbors = design.harbors.filter(h => {
    const land = byKey.get(tileKey(h.q, h.r));
    const [dq, dr] = SIDE_DIRECTIONS[h.side]!;
    return !!land && harborLand(land.kind) && faces(byKey.get(tileKey(h.q + dq, h.r + dr)));
  });
  const robber = design.robber && isLand(byKey.get(tileKey(design.robber.q, design.robber.r))?.kind ?? 'sea');
  const pirate = design.pirate && byKey.get(tileKey(design.pirate.q, design.pirate.r))?.kind === 'sea';
  return {
    ...design,
    tiles: design.tiles.map(t => {
      if (isLand(t.kind)) {
        // "Not A" only means something on random land without a link of its own.
        if (!t.notLink || (t.kind === 'land' && !t.link)) return t;
        const { notLink: _n, ...kept } = t;
        return kept;
      }
      const { link: _l, notLink: _x, number: _n, noSetup: _s, bonus: _b, pips: _p, ...rest } = t;
      return t.kind === 'iceberg' && t.number ? { ...rest, number: t.number } : rest;
    }),
    harbors: harbors.map(h => {
      let next = h;
      if (h.kind === 'any' && h.link) {
        const { link: _l, ...rest } = next;
        next = rest;
      }
      if (next.notLink && (next.kind !== 'random' || next.link)) {
        const { notLink: _n, ...rest } = next;
        next = rest;
      }
      return next;
    }),
    ...noStartOn(design, byKey),
    robber: robber ? design.robber : null,
    pirate: pirate ? design.pirate : null,
    ...islandPoolsOn(design, byKey),
  };
}

/** No-start corners whose tile is still land. */
function noStartOn(design: BoardDesign, byKey: Map<string, DesignTile>): Pick<BoardDesign, 'noStart'> {
  if (!design.noStart) return {};
  const kept = design.noStart.filter(k => {
    const tile = byKey.get(k.split(',').slice(0, 2).join(','));
    return !!tile && isLand(tile.kind);
  });
  return { noStart: kept.length ? kept : undefined };
}

/** Island mixes whose tile is still land (anything else drops them). */
function islandPoolsOn(design: BoardDesign, byKey: Map<string, DesignTile>): Pick<BoardDesign, 'islandPools'> {
  if (!design.islandPools) return {};
  const kept = Object.entries(design.islandPools).filter(([k]) => {
    const tile = byKey.get(k);
    return !!tile && isLand(tile.kind);
  });
  return { islandPools: kept.length ? Object.fromEntries(kept) : undefined };
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
        // Painting a set terrain takes a tile out of its link group; painting random land keeps it in.
        const { link, ...unlinked } = tile;
        const kept = takesNumber(brush) ? unlinked : { q, r };
        byKey.set(key, { ...kept, q, r, kind: brush, ...(brush === 'land' && link ? { link } : {}) });
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
      if (!takesNumber(next.kind) || next.kind === 'iceberg') delete next.pips;
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
  const harborLand = holdsHarbor(design);
  if (here && harborLand(here.kind) && faces(there)) return { q, r, side };
  if (there && harborLand(there.kind) && faces(here)) return { q: q + dq, r: r + dr, side: (side + 3) % 6 };
  return null;
}

/** A harbor faces open water or the map's edge (never fog, which may turn out to be land). */
const faces = (tile: DesignTile | undefined) => !tile || tile.kind === 'sea' || tile.kind === 'iceberg';

/** Fog that may turn out to be sea. */
export const fogMayBeSea = (design: BoardDesign) =>
  design.tiles.some(t => t.kind === 'fog') && ((design.fogPool ?? FOG_POOL).sea ?? 0) > 0;

/**
 * Tiles a harbor may sit on: land, and fog only when the fog can't turn out to be sea (placed by
 * hand; random harbors never go on fog).
 */
export const holdsHarbor = (design: BoardDesign) => {
  const fog = !fogMayBeSea(design);
  return (kind: DesignKind) => isLand(kind) || (fog && kind === 'fog');
};

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

/** Change one harbor's kind or link (a set kind drops its link). */
export function updateHarbor(design: BoardDesign, harbor: DesignHarbor, patch: Partial<DesignHarbor>): BoardDesign {
  return tidy({
    ...design,
    harbors: design.harbors.map(h => {
      if (!sameEdge(h, harbor)) return h;
      const next = { ...h, ...patch };
      if (patch.link === undefined && 'link' in patch) delete next.link;
      return next;
    }),
  });
}

/** The first link letter no tile or harbor uses yet. */
export function nextLink(design: BoardDesign): string {
  const used = new Set([...design.tiles, ...design.harbors].map(t => t.link).filter(Boolean));
  return [...LINK_LETTERS].find(l => !used.has(l)) ?? 'Z';
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
  const fog = design.tiles.filter(t => t.kind === 'fog').length;
  if (fog && design.fogExact) {
    const listed = Object.values(design.fogPool ?? FOG_POOL).reduce((n, c) => n + Math.round(c ?? 0), 0);
    if (listed !== fog)
      warnings.push(
        `The fog counts list ${listed} tiles but the board has ${fog} fog; ${listed > fog ? 'some are left out' : 'the rest are drawn from the mix'}.`,
      );
  }
  return [...new Set(warnings)];
}

/** The keys (`q,r,c`) naming the corner at board point (x, y) from every tile in the design that has it. */
function cornerKeysAt(design: BoardDesign, x: number, y: number): string[] {
  const keys: string[] = [];
  for (const t of design.tiles) {
    const center = hexCenter(t.q, t.r);
    for (let c = 0; c < 6; c++) {
      const p = hexCorner(center.x, center.y, c);
      if (Math.hypot(p.x - x, p.y - y) < 1) keys.push(`${t.q},${t.r},${c}`);
    }
  }
  return keys;
}

/** The corner of a land tile nearest a board point, or null when no land tile has a corner close by. */
export function cornerAt(design: BoardDesign, x: number, y: number): { x: number; y: number } | null {
  let best: { x: number; y: number; d: number } | null = null;
  for (const t of design.tiles) {
    if (!isLand(t.kind)) continue;
    const center = hexCenter(t.q, t.r);
    for (let c = 0; c < 6; c++) {
      const p = hexCorner(center.x, center.y, c);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < 30 && (!best || d < best.d)) best = { ...p, d };
    }
  }
  return best && { x: best.x, y: best.y };
}

/** Mark the corner at (x, y) as no place for a starting settlement, or clear it. */
export function toggleNoStart(design: BoardDesign, x: number, y: number): BoardDesign {
  const corner = cornerAt(design, x, y);
  if (!corner) return design;
  const keys = cornerKeysAt(design, corner.x, corner.y);
  const marked = (design.noStart ?? []).filter(k => keys.includes(k));
  const rest = (design.noStart ?? []).filter(k => !keys.includes(k));
  const land = keys.find(k =>
    isLand(design.tiles.find(t => tileKey(t.q, t.r) === k.split(',').slice(0, 2).join(','))!.kind),
  );
  const noStart = marked.length || !land ? rest : [...rest, land];
  const { noStart: _old, ...base } = design;
  return noStart.length ? { ...base, noStart } : base;
}

/** Board points of the design's no-start corners, for drawing them. */
export function noStartPoints(design: BoardDesign): { key: string; x: number; y: number }[] {
  return (design.noStart ?? []).map(key => {
    const [q, r, c] = key.split(',').map(Number) as [number, number, number];
    const center = hexCenter(q, r);
    return { key, ...hexCorner(center.x, center.y, c) };
  });
}
