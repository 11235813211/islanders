import type { Brain } from '../shared/bots';
import { Economy } from '../shared/bots/advanced/economy';
import type { Knobs } from '../shared/bots/advanced/params';
import { getView } from '../shared/engine';
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
    const out: Record<string, number> = {
      'end: dead routes': edges.length - live.length,
      'end: routes': edges.length,
      'award: road at end': g.longestRoadId === p.id ? 1 : 0,
      'award: army at end': g.largestArmyId === p.id ? 1 : 0,
      'award: road length': getView(g, p.id).players.find(q => q.id === p.id)!.longestRoad,
      'award: knights': p.knights,
      'award: won with road': g.winnerId === p.id && g.longestRoadId === p.id ? 1 : 0,
      'award: won with army': g.winnerId === p.id && g.largestArmyId === p.id ? 1 : 0,
    };
    if (g.bank.lodestone || g.surveys.length || g.stats[p.id]?.produced.lodestone) {
      // Cartographers: lodestone earned, and survey ships at the end (a point each).
      out['end: lodestone produced'] = g.stats[p.id]?.produced.lodestone ?? 0;
      out['end: survey ships'] = g.surveys.filter(id => g.ships[id] === p.id).length;
      out['end: won with survey ships'] = g.winnerId === p.id ? out['end: survey ships'] : 0;
    }
    return out;
  });
}

/**
 * Longest Road and Largest Army changing hands in one step, counted per seat (p{i} is seat i):
 * how often each seat takes an award and loses one (training/PLAN.md, the awards item).
 */
export function countAwards(before: GameState, after: GameState, actions: Record<string, number>[]): void {
  const award = (from: string | null, to: string | null, name: string) => {
    if (from === to) return;
    const add = (id: string | null, what: string) => {
      if (!id) return;
      const counts = actions[Number(id.slice(1))]!;
      counts[what] = (counts[what] ?? 0) + 1;
    };
    add(to, `award: ${name} taken`);
    add(from, `award: ${name} lost`);
  };
  award(before.longestRoadId, after.longestRoadId, 'road');
  award(before.largestArmyId, after.largestArmyId, 'army');
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
