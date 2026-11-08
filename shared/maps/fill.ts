import { balancedNumbers } from './balance';
import { isLand, takesNumber, tidy } from './edit';
import { buildBoard, drawHarborKinds } from './generate';
import { autoHarbors } from './harbors';
import { type BoardDesign, type DesignTile, tileKey } from './types';

/**
 * The editor's fills and their undos. Fills make random pieces concrete with a balanced draw;
 * linked pieces stay random, since a link only means anything while the piece is random.
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

/**
 * Link tiles and harbors to `letter` (null unlinks). Linked tiles become random land and linked
 * harbors random harbors, so the link alone decides their resource.
 */
export function setLinks(
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
      const { link: _l, ...rest } = t;
      return letter ? { ...rest, kind: 'land', link: letter } : rest;
    }),
    harbors: design.harbors.map(h => {
      if (!harborKeys.has(`${h.q},${h.r},${h.side}`)) return h;
      const { link: _l, ...rest } = h;
      return letter ? { ...rest, kind: 'random', link: letter } : rest;
    }),
  });
}
