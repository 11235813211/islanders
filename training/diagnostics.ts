import type { Brain } from '../shared/bots';
import { Economy } from '../shared/bots/advanced/economy';
import type { Knobs } from '../shared/bots/advanced/params';
import { boardIndex } from '../shared/seafaring';
import type { GameState } from '../shared/types';

/**
 * End-of-game habits per seat, reported beside the action counts (eval prints them as "end: …"):
 * routes that lead nowhere (pieces left after trimming every dead-end branch that has no building
 * of ours at its tip). Fog revealed is counted as it happens (sim.ts playOn).
 */
export function endDiagnostics(g: GameState): Record<string, number>[] {
  const index = boardIndex(g.board);
  return g.players.map(p => {
    const edges = Object.entries({ ...g.roads, ...g.ships })
      .filter(([, owner]) => owner === p.id)
      .map(([id]) => index.edge.get(id)!);
    const ours = (v: string) => g.buildings[v]?.playerId === p.id;
    let live = edges;
    for (let changed = true; changed; ) {
      const degree = new Map<string, number>();
      for (const e of live) for (const v of [e.a, e.b]) degree.set(v, (degree.get(v) ?? 0) + 1);
      const keep = live.filter(e => [e.a, e.b].every(v => degree.get(v)! > 1 || ours(v)));
      changed = keep.length < live.length;
      live = keep;
    }
    return { 'end: dead routes': edges.length - live.length, 'end: routes': edges.length };
  });
}

/**
 * Wrap a brain to log every road or ship it builds with the target it was heading for, so a
 * replay can show whether that target was ever settled, and by whom (cli `routes`).
 */
export function traceRoutes(brain: Brain, knobs: Knobs, out: RouteLog[]): Brain {
  return {
    ...brain,
    turn(view, options) {
      const action = brain.turn(view, options);
      if ((action.type === 'build-road' || action.type === 'build-ship') && view.phase !== 'setup-road') {
        const econ = new Economy(view, knobs);
        const t = econ.target;
        const why = t?.firstEdge === action.edgeId ? 'target' : 'other';
        out.push({
          turn: view.turn,
          edge: action.edgeId,
          why,
          target: t?.vertexId ?? null,
          distance: t?.distance ?? null,
        });
      }
      return action;
    },
  };
}

export interface RouteLog {
  turn: number;
  edge: string;
  /** 'target': the first piece toward the expansion target; 'other': anything else (Longest Road, a card). */
  why: 'target' | 'other';
  target: string | null;
  distance: number | null;
}
