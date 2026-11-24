// Megacities: three buildings on one corner, one model per building style. Each is bigger than
// its city (a third building) and taller in the middle, so it reads as a step up at board size.
import type { Vec3 } from '../projection';
import { arch, chimney, gabledHouse, rect, type Solid } from '../solids';
import { chalet } from './chalet';
import { dark, onFront, sideWindow } from './classic';
import { palaceHall, smallHouse } from './korean';
import { platform } from './timber';

/** Move solids (and their decals) by (dx, dy, dz). */
export function moved(solids: Solid[], dx: number, dy: number, dz: number): Solid[] {
  const at = ([x, y, z]: Vec3): Vec3 => [x + dx, y + dy, z + dz];
  for (const solid of solids) {
    solid.center = at(solid.center);
    for (const f of solid.faces) {
      f.points = f.points.map(at);
      for (const d of f.decals) d.points = d.points.map(at);
    }
  }
  return solids;
}

/** A round window centered at (x, y) on a house's front, `r` across. */
const roundWindow = (house: ReturnType<typeof gabledHouse>, x: number, y: number, r: number) =>
  dark(
    onFront(
      house,
      Array.from({ length: 12 }, (_, i): [number, number] => {
        const a = (i / 12) * Math.PI * 2;
        return [x + r * Math.cos(a), y + r * Math.sin(a)];
      }),
    ),
  );

/**
 * Classic: three joined gabled buildings of one depth, a tall town hall with a round window in
 * the middle between a low house and a mid-height hall. Roofs meet without overhang at the joints.
 */
export function classicMegacity(): Solid[] {
  const depth = 11;
  const left = gabledHouse({
    x: -9,
    z: 0,
    width: 8,
    depth,
    wall: 7.5,
    rise: 4.2,
    overhang: 1,
    overhangRight: 0,
    fascia: 1.3,
  });
  const tower = gabledHouse({
    x: -1,
    z: 0,
    width: 8,
    depth,
    wall: 15.5,
    rise: 5.5,
    overhang: 1,
    overhangLeft: 0,
    overhangRight: 0,
    fascia: 1.3,
  });
  const right = gabledHouse({
    x: 7.5,
    z: 0,
    width: 9,
    depth,
    wall: 10.5,
    rise: 4.6,
    overhang: 1,
    overhangLeft: 0,
    fascia: 1.3,
  });
  const l = left.spec.x;
  left.front.decals.push(
    dark(onFront(left, rect(l - 2.8, 2.6, l - 0.8, 4.8))),
    dark(onFront(left, rect(l + 0.8, 2.6, l + 2.8, 4.8))),
  );
  const t = tower.spec.x;
  tower.front.decals.push(
    roundWindow(tower, t, tower.spec.wall + 2.2, 1.3),
    dark(onFront(tower, arch(t - 1.9, t + 1.9, 0, 6.4))),
    dark(onFront(tower, arch(t - 1, t + 1, 8.6, 11.2))),
  );
  const r = right.spec.x;
  right.front.decals.push(
    dark(onFront(right, arch(r - 1.6, r + 1.6, 0, 5.4))),
    dark(onFront(right, rect(r - 3.4, 7, r - 1.4, 9))),
    dark(onFront(right, rect(r + 1.4, 7, r + 3.4, 9))),
  );
  right.right.decals.push(sideWindow(right, -1.2, 2.8), sideWindow(right, -1.2, 7));
  return [...left.solids, ...tower.solids, ...right.solids];
}

/** Chalet: a three-storey hall between two lodges, all one depth, the hall with a chimney. */
export function chaletMegacity(): Solid[] {
  const depth = 14;
  const lodge = (x: number, width: number, wall: number, side: 'left' | 'right') =>
    gabledHouse({
      x,
      z: 0,
      width,
      depth,
      wall,
      rise: 4.2,
      overhang: 2.3,
      ...(side === 'left' ? { overhangRight: 0 } : { overhangLeft: 0 }),
      fascia: 1.8,
    });
  const west = lodge(-12.25, 10.5, 11, 'left');
  const hall = gabledHouse({
    x: -1,
    z: 0,
    width: 12,
    depth,
    wall: 22.5,
    rise: 5,
    overhang: 2.3,
    overhangLeft: 0,
    overhangRight: 0,
    fascia: 1.8,
  });
  const east = lodge(11, 12, 15, 'right');
  return [
    ...chalet(west, 1, { right: true }),
    ...chalet(hall, 3, { left: true, right: true }),
    chimney(hall, 2, -3, 2.4),
    ...chalet(east, 1, { left: true }),
  ];
}

/**
 * Korean: the city's throne hall on its terraces, flanked by two small tiled halls on a wide
 * stone base, set a little back so the palace stays in front.
 */
export function koreanMegacity(): Solid[] {
  const base = { ...platform(48, 20, 0, 1), layer: 0 };
  const wing = (dx: number) => moved(smallHouse(), dx, 1, 3).map(s => ({ ...s, layer: (s.layer ?? 0) + 0.2 }));
  const palace = moved(palaceHall(), 0, 1, -1).map(s => ({ ...s, layer: (s.layer ?? 0) + 1 }));
  return [base, ...wing(-17), ...wing(17), ...palace];
}
