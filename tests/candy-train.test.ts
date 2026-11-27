import { describe, expect, it } from 'vitest';
import { buildBoard } from '../shared/maps';
import {
  candyExtensions,
  candyGraph,
  candyStepAt,
  canFlipRail,
  extendCandyRoute,
  parseCandyRoutes,
  railSideIsLand,
} from '../shared/maps/candy-train';
import { newDesign, paint } from '../shared/maps/edit';
import { designFor } from '../shared/maps/types';
import { parseDesign } from '../shared/maps/validate';
import { onRail, RAIL_OFFSET, railPath } from '../src/art/v21/christmas/rail-geometry';
import { addVersion, editVersion, showVersion } from '../src/components/editor/versions';

function design() {
  const d = newDesign('blank', 'candy-test', 'test', 'Candy test');
  d.tiles = [
    { q: 0, r: 0, kind: 'wood' },
    { q: 1, r: 0, kind: 'sheep' },
  ];
  d.candyRoutes = [{ corners: [], side: 1 }];
  return d;
}

describe('candy railway editing', () => {
  it('joins aliases of the same physical corner, rejects gaps, and trims earlier corners', () => {
    let d = design();
    const graph = candyGraph(d.tiles);
    expect(new Set(graph.values()).size).toBe(10);
    d = extendCandyRoute(d, 0, '0,0,0');
    const gap = extendCandyRoute(d, 0, '0,0,3');
    expect(gap).toBe(d);
    d = extendCandyRoute(d, 0, '0,0,1');
    d = extendCandyRoute(d, 0, '0,0,2');
    expect(d.candyRoutes![0]!.corners).toHaveLength(3);
    d = extendCandyRoute(d, 0, '0,0,1');
    expect(d.candyRoutes![0]!.corners).toEqual(['0,0,0', '0,0,1']);
  });

  it('keeps the rails on land: the first edge picks its side, later edges and flips stay dry', () => {
    let d = design();
    const graph = candyGraph(d.tiles);
    // Counterclockwise around tile 0,0 puts side 1 outside, over the sea.
    d = extendCandyRoute(d, 0, '0,0,3');
    d = extendCandyRoute(d, 0, '0,0,2');
    expect(d.candyRoutes![0]).toMatchObject({ corners: ['0,0,3', '0,0,2'], side: -1 });
    expect(railSideIsLand(d.tiles, graph.get('0,0,3')!, graph.get('0,0,2')!, 1)).toBe(false);
    expect(canFlipRail(d, 0)).toBe(false);
    // From corner 2 only the edge around tile 0,0 keeps land on the rail side.
    expect(candyExtensions(d, 0)).toEqual([graph.get('0,0,1')!.key]);
    // A route along the shared edge has land both ways and may flip.
    const shared = extendCandyRoute(extendCandyRoute(design(), 0, '0,0,5'), 0, '0,0,0');
    expect(canFlipRail(shared, 0)).toBe(true);
    // A saved route over the sea switches to its dry side, or is cut at its first wet edge.
    expect(parseCandyRoutes([{ corners: ['0,0,3', '0,0,2'], side: 1 }], d.tiles)[0]!.side).toBe(-1);
    const wet = parseCandyRoutes([{ corners: ['0,0,4', '0,0,5', '0,0,0', '1,0,1'], side: 1 }], d.tiles)[0]!;
    expect(wet).toEqual({ corners: ['0,0,4', '0,0,5', '0,0,0'], side: 1 });
  });

  it('reads a tap past an edge middle as that edge, and a tap on an earlier corner as a trim', () => {
    let d = design();
    const graph = candyGraph(d.tiles);
    const at = (key: string) => graph.get(key)!;
    expect(candyStepAt(d, 0, at('0,0,0'))).toBe('0,0,0');
    d = extendCandyRoute(d, 0, '0,0,0');
    const mid = { x: (at('0,0,0').x + at('0,0,1').x) / 2, y: (at('0,0,0').y + at('0,0,1').y) / 2 };
    expect(candyStepAt(d, 0, mid)).toBe('0,0,1');
    d = extendCandyRoute(extendCandyRoute(d, 0, '0,0,1'), 0, '0,0,2');
    expect(candyStepAt(d, 0, at('0,0,0'))).toBe('0,0,0');
    expect(candyStepAt(d, 0, { x: 9999, y: 0 })).toBeNull();
  });

  it('round-trips routes through server validation and keeps them out of game board rules', () => {
    const d = design();
    d.candyRoutes![0]!.corners = ['0,0,0', '0,0,1', '0,0,2'];
    const saved = parseDesign(JSON.parse(JSON.stringify(d)), ['test']);
    expect(saved.candyRoutes).toEqual(d.candyRoutes);
    expect(JSON.stringify(buildBoard(saved).board)).not.toContain('candyRoutes');
    for (const corners of [['0,0,0', '0,0,3'], ['0,0,0', '0,0,1', '0,0,0'], ['99,0,0'], [null]])
      expect(() => parseDesign({ ...d, candyRoutes: [{ corners, side: 1 }] }, ['test'])).toThrow();
    expect(() => parseCandyRoutes(Array(5).fill({ corners: [], side: 1 }), d.tiles)).toThrow();
    expect(() => parseCandyRoutes([{ corners: [], side: 0 }], d.tiles)).toThrow();
  });

  it('removes invalid railway after painting or erasing its land', () => {
    const d = design();
    d.candyRoutes![0]!.corners = ['0,0,1', '0,0,2', '0,0,3'];
    const cleared = paint(d, [{ q: 0, r: 0 }], 'sea');
    expect(cleared.candyRoutes![0]!.corners).toEqual([]);
    expect(d.candyRoutes![0]!.corners).toHaveLength(3);
  });

  it('preserves a shared land edge when only one adjoining tile is erased', () => {
    const d = design();
    d.candyRoutes![0]!.corners = ['0,0,5', '0,0,0'];
    const changed = paint(d, [{ q: 0, r: 0 }], 'erase');
    expect(changed.candyRoutes![0]!.corners).toEqual(['1,0,3', '1,0,2']);
    expect(() => parseDesign(changed, ['test'])).not.toThrow();
  });

  it('keeps each layout’s route edits independent, including an empty route list', () => {
    let d = design();
    d.candyRoutes![0]!.corners = ['0,0,0', '0,0,1'];
    d = addVersion(d, d);
    d = editVersion(d, 0, shown => ({ ...shown, candyRoutes: [] }));
    const saved = parseDesign(JSON.parse(JSON.stringify(d)), ['test']);
    expect(showVersion(saved, 0).candyRoutes).toEqual([]);
    expect(designFor(saved, 5).candyRoutes).toEqual([]);
    expect(saved.candyRoutes![0]!.corners).toHaveLength(2);
    delete saved.versions![0]!.candyRoutes;
    expect(showVersion(saved, 0).candyRoutes).toEqual([]);
    expect(designFor(saved, 5).candyRoutes).toEqual([]);
  });

  it('offsets both rails from road edges and keeps sampled car positions on the route', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
    ];
    const left = railPath(points, 1),
      right = railPath(points, -1);
    expect(onRail(left, 60)).toEqual({ x: 60, y: RAIL_OFFSET, angle: 0 });
    expect(onRail(right, 60).y).toBe(-RAIL_OFFSET);
    expect(onRail(left, 10000).x).toBe(120);
    expect(onRail(left, -20).x).toBe(0);
    const curve = railPath([...points, { x: 180, y: 104 }], 1);
    expect(curve.length).toBeGreaterThan(10);
    expect(curve.every((p, i) => !i || p.distance > curve[i - 1]!.distance)).toBe(true);
  });
});
