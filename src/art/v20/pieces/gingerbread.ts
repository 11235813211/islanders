// The gingerbread piece style (Christmas): cookie walls, a candy roof in the seat color, white
// icing along every edge, glowing sugar windows, and gumdrops on the ridge.
// Colors and sizes to tweak are in GINGER at the top.
import type { Vec3 } from '../projection';
import {
  arch,
  box,
  type Decal,
  gabledHouse,
  type House,
  type Palette,
  paintFaces,
  rect,
  type Solid,
  tone,
} from '../solids';
import type { PieceDesign } from './design';

/** Every color and size of the style in one place. */
export const GINGER = {
  cookie: '#b8733a',
  icing: '#fffaf2',
  /** Sugar-glass panes: a soft cool blue that reads as glass on the cookie, not a bright blob. */
  window: '#9cc3d8',
  /** Icing around windows: thin, so the pane shows. */
  windowLine: 0.32,
  door: '#5b2f17',
  peppermint: '#e2333b',
  /** Gumdrops on the ridge, in this mix of the seat color and white. */
  gumdropLight: 0.35,
  /** Scallops along each gable edge. */
  scallops: 5,
  /** How far each icing scallop hangs below the roof edge. */
  drip: 1.6,
  /** Share of the roof slope the eave icing covers at its deepest, and the ridge cap. */
  eaveIcing: 0.3,
  ridgeIcing: 0.12,
  /** Outline widths: finer than other styles so the icing reads. */
  roofLine: 0.75,
  wallLine: 0.85,
  /** Gumdrop size. */
  gumdrop: 0.95,
  /** Sprinkles, gumdrops, shutters, and peppermints draw from these candy colors. */
  candy: ['#ff5f6d', '#ffd23f', '#5fd38d', '#62c2ff', '#ff9ad5'],
  /** Candy sprinkles scattered on the roof facing the camera. */
  sprinkles: 7,
} as const;

/** Seat-colored candy roof over cookie walls. */
const palette = (seat: string): Palette => ({
  seat,
  cookie: GINGER.cookie,
  icing: GINGER.icing,
  window: GINGER.window,
  door: GINGER.door,
  gumdrop: tone(seat, GINGER.gumdropLight),
  peppermint: GINGER.peppermint,
  ...Object.fromEntries(GINGER.candy.map((c, i) => [`candy${i}`, c])),
});
const candy = (i: number) => `candy${i % GINGER.candy.length}`;

const onFront = (house: House, points: [number, number][]) => points.map(([x, y]) => house.onFront(x, y));
const onRight = (house: House, points: [number, number][]) => points.map(([z, y]) => house.onRight(z, y));

/** A ring of `n` points around (x, y), for round decals. */
const ring = (x: number, y: number, r: number, n = 10): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [x + r * Math.cos(a), y + r * Math.sin(a)];
  });

/** Icing hanging under one gable edge, from (ax, ay) to (bx, by): a band with scalloped drips. */
function icingEdge(house: House, ax: number, ay: number, bx: number, by: number): Decal {
  const n = GINGER.scallops;
  const steps = n * 6;
  const at = (t: number): [number, number] => [ax + (bx - ax) * t, ay + (by - ay) * t];
  const top = Array.from({ length: steps + 1 }, (_, i) => at(i / steps));
  // Rounded drips: each scallop hangs as a half circle below the edge.
  const bottom = top
    .map(([x, y], i): [number, number] => [
      x,
      y - 0.3 - GINGER.drip * Math.sin(Math.PI * ((i * n) / steps - Math.floor((i * n) / steps))),
    ])
    .reverse();
  return { points: onFront(house, [...top, ...bottom]), fill: 'icing', stroke: 'icing', width: 0.3 };
}

/** A sugar window: a glass pane with a round top, an icing frame, and a bar down the middle. */
function sugarWindow(house: House, x: number, y: number, width: number): Decal[] {
  const h = width / 2;
  return [
    {
      points: onFront(house, arch(x - h, x + h, y, y + width * 1.15)),
      fill: 'window',
      stroke: 'icing',
      width: GINGER.windowLine,
    },
    {
      points: onFront(house, [
        [x, y],
        [x, y + width * 1.15],
      ]),
      open: true,
      stroke: 'icing',
      width: 0.25,
    },
  ];
}

/** Icing and candy on one gabled house: gable drips, a door, windows, and a side window. */
function decorate(house: House, windows: [number, number][], door = true): void {
  const { x0, x1, spec } = house;
  const front = house.front.decals;
  front.push(icingEdge(house, x0, spec.wall, spec.x, house.peak), icingEdge(house, spec.x, house.peak, x1, spec.wall));
  if (door) {
    front.push({
      points: onFront(house, arch(spec.x - 1.7, spec.x + 1.7, 0, 5.2)),
      fill: 'door',
      stroke: 'icing',
      width: 0.6,
    });
    front.push({
      points: onFront(house, ring(spec.x + 0.8, 2.6, 0.32, 6)),
      fill: 'icing',
      stroke: 'icing',
      width: 0.1,
    });
  }
  for (const [x, y] of windows) front.push(...sugarWindow(house, x, y, 2.2));
  // Candy-cane corners up both sides of the front.
  for (const edge of [x0, x1 - 0.9]) {
    front.push({
      points: onFront(house, rect(edge, 0, edge + 0.9, spec.wall)),
      fill: 'icing',
      stroke: 'icing',
      width: 0.1,
    });
    for (let y = 0.4; y < spec.wall - 0.6; y += 1.4)
      front.push({
        points: onFront(house, [
          [edge, y],
          [edge + 0.9, y + 0.55],
          [edge + 0.9, y + 1.1],
          [edge, y + 0.55],
        ]),
        fill: 'peppermint',
        stroke: 'peppermint',
        width: 0.05,
      });
  }
  // A row of icing dots along the base.
  for (let x = x0 + 1; x < x1 - 0.5; x += 1.6)
    front.push({ points: onFront(house, ring(x, 0.6, 0.28, 6)), fill: 'icing', stroke: 'icing', width: 0.1 });
  house.right.decals.push(
    {
      points: onRight(house, rect(spec.z - 1.4, 3, spec.z + 1.2, 5.4)),
      fill: 'window',
      stroke: 'icing',
      width: GINGER.windowLine,
    },
    {
      points: onRight(house, rect(house.z0, spec.wall - 0.6, house.z1, spec.wall)),
      fill: 'icing',
      stroke: 'icing',
      width: 0.2,
    },
  );
}

/** A peppermint candy on the front at (x, y): a white disc with red pinwheel wedges. */
function peppermint(house: House, x: number, y: number, r: number): Decal[] {
  const wedges = Array.from({ length: 4 }, (_, i): Decal => {
    const a = (i / 4) * Math.PI * 2;
    const b = a + Math.PI / 4;
    return {
      points: onFront(house, [
        [x, y],
        [x + r * Math.cos(a), y + r * Math.sin(a)],
        [x + r * Math.cos((a + b) / 2) * 1.02, y + r * Math.sin((a + b) / 2) * 1.02],
        [x + r * Math.cos(b), y + r * Math.sin(b)],
      ]),
      fill: 'peppermint',
      stroke: 'peppermint',
      width: 0.05,
    };
  });
  return [{ points: onFront(house, ring(x, y, r, 14)), fill: 'icing', stroke: 'line', width: 0.3 }, ...wedges];
}

/** Cookie walls, seat-colored roof slopes, and icing on the roof's thickness. */
function materials(house: House, drops = 4): Solid[] {
  const [walls, roof] = house.solids as [Solid, Solid];
  paintFaces(walls, 'cookie');
  roof.faces.forEach((f, i) => {
    if (i >= 2) f.material = 'icing';
  });
  roofIcing(roof.faces[0]!);
  gumdrops(house, drops);
  roof.edge = GINGER.roofLine;
  walls.edge = GINGER.wallLine;
  return [walls, roof];
}

/**
 * Icing on the slope facing the camera: a scalloped band along the eave and a cap along the
 * ridge. `slope` runs ridge-front, ridge-back, eave-back, eave-front (see gabledHouse).
 */
function roofIcing(slope: { points: Vec3[]; decals: Decal[] }): void {
  const [ridgeFront, ridgeBack, eaveBack, eaveFront] = slope.points as [Vec3, Vec3, Vec3, Vec3];
  // A point `u` of the way up from the eave (0) to the ridge (1), `v` of the way front (0) to back (1).
  const at = (u: number, v: number): Vec3 => {
    const eave = eaveFront.map((c, i) => c + (eaveBack[i]! - c) * v);
    const ridge = ridgeFront.map((c, i) => c + (ridgeBack[i]! - c) * v);
    return eave.map((c, i) => c + (ridge[i]! - c) * u + (i === 1 ? 0.04 : 0)) as unknown as Vec3;
  };
  // Candy sprinkles between the eave icing and the ridge cap.
  for (let i = 0; i < GINGER.sprinkles; i++) {
    const u = 0.42 + 0.4 * ((i * 0.61803) % 1);
    const v = (i + 0.5) / GINGER.sprinkles;
    const [cx, cy, cz] = at(u, v);
    const dot: Vec3[] = ring(0, 0, 0.42, 6).map(([a, b]) => [cx + a * 0.5, cy + b * 0.5 + 0.03, cz + a]);
    slope.decals.push({ points: dot, fill: candy(i), stroke: candy(i), width: 0.1 });
  }
  const n = GINGER.scallops * 2;
  // A smooth wave of rounded drips, not a zigzag.
  const scallop = Array.from({ length: n * 4 + 1 }, (_, i) =>
    at(GINGER.eaveIcing * (0.45 + 0.55 * Math.abs(Math.sin((Math.PI * i) / 8))), i / (n * 4)),
  );
  slope.decals.push(
    { points: [at(0, 0), ...scallop, at(0, 1)], fill: 'icing', stroke: 'icing', width: 0.2 },
    {
      points: [at(1, 0), at(1, 1), at(1 - GINGER.ridgeIcing, 1), at(1 - GINGER.ridgeIcing, 0)],
      fill: 'icing',
      stroke: 'icing',
      width: 0.2,
    },
  );
}

/** Gumdrops in a row just below the ridge, on the slope facing the camera, each with a sugar sparkle. */
function gumdrops(house: House, count: number): void {
  const slope = house.solids[1]!.faces[0]!;
  const [ridgeFront, ridgeBack, eaveBack, eaveFront] = slope.points as [Vec3, Vec3, Vec3, Vec3];
  const at = (u: number, v: number): Vec3 =>
    [0, 1, 2].map(k => {
      const eave = eaveFront[k]! + (eaveBack[k]! - eaveFront[k]!) * v;
      const ridge = ridgeFront[k]! + (ridgeBack[k]! - ridgeFront[k]!) * v;
      return eave + (ridge - eave) * u + (k === 1 ? 0.06 : 0);
    }) as unknown as Vec3;
  const g = GINGER.gumdrop;
  for (let i = 0; i < count; i++) {
    const [cx, cy, cz] = at(0.78, (i + 0.5) / count);
    const drop: Vec3[] = ring(0, 0, g, 10).map(([a, b]) => [cx + b * 0.45, cy + b * 0.75, cz + a]);
    const sparkle: Vec3[] = ring(0, 0, g * 0.28, 6).map(([a, b]) => [
      cx + 0.2,
      cy + g * 0.35 + b * 0.5,
      cz - g * 0.35 + a,
    ]);
    slope.decals.push(
      { points: drop, fill: i % 2 ? 'gumdrop' : candy(i), stroke: 'line', width: 0.3 },
      { points: sparkle, fill: 'icing', stroke: 'icing', width: 0.05 },
    );
  }
}

/** A peppermint-striped candy cane post standing at (x, z), `height` tall. */
function candyCane(x: number, z: number, height: number): Solid {
  const post = box(x - 0.45, x + 0.45, 0, height, z - 0.45, z + 0.45);
  const stripes = (f: { decals: Decal[] }, along: (y: number) => Vec3[]) => {
    for (let y = 0.6; y < height - 0.3; y += 1.3)
      f.decals.push({ points: along(y), fill: 'peppermint', stroke: 'peppermint', width: 0.1 });
  };
  stripes(post.front, y => [
    [x - 0.45, y, z - 0.47],
    [x + 0.45, y + 0.5, z - 0.47],
    [x + 0.45, y + 0.95, z - 0.47],
    [x - 0.45, y + 0.45, z - 0.47],
  ]);
  stripes(post.right, y => [
    [x + 0.47, y + 0.5, z - 0.45],
    [x + 0.47, y + 0.95, z + 0.45],
    [x + 0.47, y + 1.4, z + 0.45],
    [x + 0.47, y + 0.95, z - 0.45],
  ]);
  return { ...paintFaces(post.solid, 'icing'), edge: 0.5 };
}

/** A gingerbread cottage: one gabled house with a candy cane by the door. */
function cottage(): Solid[] {
  // Short walls under a tall roof read as cute at board size.
  const house = gabledHouse({ x: 0, z: 0, width: 12, depth: 11, wall: 7.4, rise: 7.6, overhang: 1.4, fascia: 1.5 });
  // Door and peppermint on the front; the window is on the side, so nothing overlaps.
  decorate(house, []);
  house.front.decals.push(...peppermint(house, 0, 10, 1.5));
  return [...materials(house), candyCane(-4.8, -6.6, 4.4)];
}

/** A gingerbread city: a tall hall with a round sugar window joined to a lower wing, same depth. */
function hall(): Solid[] {
  const depth = 11;
  const tall = gabledHouse({
    x: -5,
    z: 0,
    width: 9,
    depth,
    wall: 12,
    rise: 6,
    overhang: 1,
    overhangRight: 0,
    fascia: 1.4,
  });
  const wing = gabledHouse({
    x: 4.5,
    z: 0,
    width: 10,
    depth,
    wall: 7.5,
    rise: 4.2,
    overhang: 1,
    overhangLeft: 0,
    fascia: 1.4,
  });
  decorate(tall, []);
  tall.front.decals.push(...peppermint(tall, tall.spec.x, 9.4, 1.6));
  decorate(
    wing,
    [
      [wing.spec.x - 2.4, 2.6],
      [wing.spec.x + 2.4, 2.6],
    ],
    false,
  );
  return [...materials(tall), ...materials(wing), candyCane(10.4, -6.4, 4.6)];
}

/** A gingerbread megacity: a low cottage, a tall clock hall, and a mid hall, joined. */
function megacity(): Solid[] {
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
    fascia: 1.4,
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
    fascia: 1.4,
  });
  const right = gabledHouse({
    x: 7,
    z: 0,
    width: 8,
    depth,
    wall: 10.5,
    rise: 4.6,
    overhang: 1,
    overhangLeft: 0,
    fascia: 1.4,
  });
  decorate(left, [[left.spec.x, 2.4]], false);
  decorate(tower, []);
  tower.front.decals.push(...peppermint(tower, tower.spec.x, 12.4, 1.8));
  decorate(right, [[right.spec.x, 5.6]], false);
  return [...materials(left, 3), ...materials(tower, 3), ...materials(right, 3), candyCane(12.4, -6.4, 4.6)];
}

/** The gingerbread style. Drawn the same size as classic pieces. */
export const GINGERBREAD_DESIGN: PieceDesign = {
  build: city => (city ? hall() : cottage()),
  settlementScale: 1.15 * 1.1,
  cityScale: 1.32 * 1.1,
  megacity,
  megacityScale: 1.32 * 1.1,
  palette,
};
