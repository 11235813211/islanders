import { describe, expect, it } from 'vitest';
import { buildBoard } from '../shared/maps';
import { candyGraph, extendCandyRoute, parseCandyRoutes } from '../shared/maps/candy-train';
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
