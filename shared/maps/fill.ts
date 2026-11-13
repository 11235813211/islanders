import { RESOURCES, type Resource } from '../types';
import { balancedNumbers, randomNumber } from './balance';
import { isLand, takesNumber, tidy } from './edit';
import { buildBoard, drawHarborKinds } from './generate';
import { autoHarbors, harborTarget } from './harbors';
import { numberLeanings } from './numbers';
import { type BoardDesign, type DesignTile, tileKey } from './types';

/**
 * The editor's fills and their undos, and link groups. Fills make random pieces concrete with a
 * balanced draw and leave linked pieces alone: a link group is either random together or set to
 * one resource together (see setGroupKind).
 */

/** Turn every unlinked random land tile into the terrain a balanced draw gives it. */
export function fillLand(design: BoardDesign, random: () => number = Math.random): BoardDesign {
  const { board } = buildBoard(design, random);
  const drawn = new Map(board.hexes.map(h => [tileKey(h.q, h.r), h.terrain]));
  return tidy({
    ...design,
    tiles: design.tiles.map(t =>
      t.kind === 'land' && !t.link ? { ...t, kind: drawn.get(tileKey(t.q, t.r)) ?? 'land' } : t,
    ),
  });
}

/** Give every numbered tile without a number a balanced one (keeping the numbers already set). */
export function fillNumbers(design: BoardDesign, random: () => number = Math.random): BoardDesign {
  const lean = numberLeanings(design);
  const numbered = design.tiles.filter(t => takesNumber(t.kind) && t.kind !== 'iceberg');
  const producing = numbered.map(t => ({
    q: t.q,
    r: t.r,
    terrain: t.kind,
    pips: t.pips,
    ...lean(t.q, t.r, t.kind),
  }));
  const fixed = new Map(numbered.filter(t => t.number !== undefined).map(t => [tileKey(t.q, t.r), t.number!]));
  const numbers = balancedNumbers(producing, fixed, random, { noTwoTwelve: design.noTwoTwelve });
  const iceberg = () => randomNumber(random, design.noTwoTwelve);
  return {
    ...design,
    tiles: design.tiles.map(t => {
      if (t.kind === 'iceberg') return { ...t, number: t.number ?? iceberg() };
      return takesNumber(t.kind) ? { ...t, number: numbers.get(tileKey(t.q, t.r)) } : t;
    }),
  };
}

/** Add harbors spread around the coasts until the board has about its share (a new spread each call). */
export function placeHarbors(design: BoardDesign, random: () => number = Math.random): BoardDesign {
  const extra = autoHarbors(design.tiles, harborTarget(design) - design.harbors.length, design.harbors, random);
  return { ...design, harbors: [...design.harbors, ...extra] };
}

/** Give every unlinked random harbor a kind from a balanced draw (fixed and excluded kinds respected). */
export function fillHarbors(design: BoardDesign, random: () => number = Math.random): BoardDesign {
  const kinds = drawHarborKinds(design, random);
  return {
    ...design,
    harbors: design.harbors.map(h =>
      h.kind === 'random' && !h.link ? { ...h, kind: kinds.get(`${h.q},${h.r},${h.side}`) ?? 'random' } : h,
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

/** Make every land tile with a set terrain random land again (numbers and island flags stay). */
export function unfillLand(design: BoardDesign): BoardDesign {
  return {
    ...design,
    tiles: design.tiles.map((t): DesignTile => (isLand(t.kind) ? { ...t, kind: 'land' } : t)),
  };
}

/** Make every harbor's kind random again (positions stay). */
export function unfillHarbors(design: BoardDesign): BoardDesign {
  return { ...design, harbors: design.harbors.map(h => ({ ...h, kind: 'random' as const })) };
}

/** Remove every harbor. */
export const clearHarbors = (design: BoardDesign): BoardDesign => ({ ...design, harbors: [] });

/** The resource a link group is set to, or null while it is random. */
export function groupKind(design: BoardDesign, letter: string): Resource | null {
  const tile = design.tiles.find(t => t.link === letter && RESOURCES.includes(t.kind as Resource));
  if (tile) return tile.kind as Resource;
  const harbor = design.harbors.find(h => h.link === letter && RESOURCES.includes(h.kind as Resource));
  return harbor ? (harbor.kind as Resource) : null;
}

/** Set a whole link group to one resource (tiles get its terrain, harbors trade it 2:1), or make it random (null). */
export function setGroupKind(design: BoardDesign, letter: string, resource: Resource | null): BoardDesign {
  return tidy({
    ...design,
    tiles: design.tiles.map(t => (t.link === letter ? { ...t, kind: resource ?? 'land' } : t)),
    harbors: design.harbors.map(h => (h.link === letter ? { ...h, kind: resource ?? 'random' } : h)),
  });
}

/**
 * Link tiles and harbors to `letter` (null unlinks). Linked pieces take the group's resource: the
 * one it is set to, or random until the game draws one for the whole group.
 */
export function setLinks(
  design: BoardDesign,
  tiles: { q: number; r: number }[],
  harbors: { q: number; r: number; side: number }[],
  letter: string | null,
): BoardDesign {
  const tileKeys = new Set(tiles.map(t => tileKey(t.q, t.r)));
  const harborKeys = new Set(harbors.map(h => `${h.q},${h.r},${h.side}`));
  const kind = letter ? groupKind(design, letter) : null;
  const linked = tidy({
    ...design,
    tiles: design.tiles.map(t => {
      if (!tileKeys.has(tileKey(t.q, t.r)) || !isLand(t.kind)) return t;
      const { link: _l, notLink: _n, ...rest } = t;
      return letter ? { ...rest, kind: 'land', link: letter } : rest;
    }),
    harbors: design.harbors.map(h => {
      if (!harborKeys.has(`${h.q},${h.r},${h.side}`)) return h;
      const { link: _l, notLink: _n, ...rest } = h;
      return letter ? { ...rest, kind: 'random', link: letter } : rest;
    }),
  });
  return letter && kind ? setGroupKind(linked, letter, kind) : linked;
}

/**
 * Mark tiles and harbors "Not `letter`" (null clears it): they stay random and never get the
 * resource that letter gets. It replaces any link they had.
 */
export function setNotLinks(
  design: BoardDesign,
  tiles: { q: number; r: number }[],
  harbors: { q: number; r: number; side: number }[],
  letter: string | null,
): BoardDesign {
  const tileKeys = new Set(tiles.map(t => tileKey(t.q, t.r)));
  const harborKeys = new Set(harbors.map(h => `${h.q},${h.r},${h.side}`));
  return tidy({
    ...design,
    tiles: design.tiles.map(t => {
      if (!tileKeys.has(tileKey(t.q, t.r)) || !isLand(t.kind)) return t;
      const { link: _l, notLink: _n, ...rest } = t;
      return letter ? { ...rest, kind: 'land', notLink: letter } : rest;
    }),
    harbors: design.harbors.map(h => {
      if (!harborKeys.has(`${h.q},${h.r},${h.side}`)) return h;
      const { link: _l, notLink: _n, ...rest } = h;
      return letter ? { ...rest, kind: 'random', notLink: letter } : rest;
    }),
  });
}
