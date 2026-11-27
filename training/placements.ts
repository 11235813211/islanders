import { geometry } from '../shared/bots/advanced/geometry';
import { getView } from '../shared/engine';
import { pendingBotActor } from '../shared/engine/time';
import type { GameState } from '../shared/types';
import { brainFor, type SeatSpec } from './jobs';
import { drawScenario, type ScenarioFilter } from './scenarios';
import { playGame } from './sim';

/**
 * Starting placements of one bot in every seat, pick by pick: how the chosen corner's dice odds
 * rank among the legal corners, and each seat's resulting start. Used to spot setup mistakes on a
 * map (`placements --maps new-base-board-16 --games 200`) without playing whole games.
 */

const NAMES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

interface Pick {
  round: number;
  chosen: number;
  best: number;
  rank: number;
  kinds: number;
}

/** Corner totals and resource kinds from the board's geometry. */
function corner(g: GameState, playerId: string, id: string) {
  const geo = geometry(getView(g, playerId), 0);
  const c = geo.indexOf.get(id)!;
  const byResource = NAMES.map((_, r) => geo.pips[c * 5 + r]!);
  return { total: byResource.reduce((a, b) => a + b, 0) + geo.gold[c]!, byResource };
}

/** Setup of one game: every pick's stats, and the seats' starting production by resource. */
export function setupPicks(seed: number, spec: SeatSpec, filter?: ScenarioFilter) {
  const scenario = drawScenario(seed, filter);
  const brain = brainFor(spec);
  const states: GameState[] = [];
  let final: GameState | null = null;
  playGame(
    scenario,
    Array(scenario.players).fill(brain),
    seed,
    {
      beforeMove: g => {
        if (g.phase === 'setup-settlement') states.push(g);
      },
      end: g => {
        final = g;
      },
    },
    4 * scenario.players * 3,
  );
  const picks: Pick[] = [];
  const end = final as GameState | null;
  if (!end) return { picks, starts: [] as number[][] };
  states.forEach((g, i) => {
    const view = getView(g, pendingBotActor(g)!);
    const after = states[i + 1] ?? end;
    const id = Object.keys(after.buildings).find(v => !g.buildings[v] && after.buildings[v]!.playerId === view.selfId);
    if (!id) return;
    const totals = view.legal.settlements.map(v => corner(g, view.selfId, v).total).sort((a, b) => b - a);
    const chosen = corner(g, view.selfId, id);
    picks.push({
      round: i < scenario.players ? 1 : 2,
      chosen: chosen.total,
      best: totals[0] ?? 0,
      rank: totals.filter(t => t > chosen.total).length + 1,
      kinds: chosen.byResource.filter(p => p > 0).length,
    });
  });
  const starts = end.players.map(p => {
    const sum = [0, 0, 0, 0, 0];
    for (const [v, b] of Object.entries(end.buildings))
      if (b.playerId === p.id)
        corner(end, p.id, v).byResource.forEach((x, r) => {
          sum[r]! += x;
        });
    return sum;
  });
  return { picks, starts };
}

/** Print averages over many games' setups. */
export function reportPlacements(games: number, firstSeed: number, spec: SeatSpec, filter?: ScenarioFilter): void {
  const rounds = [1, 2].map(() => ({ n: 0, chosen: 0, best: 0, rank: 0, top: 0, kinds: 0 }));
  const kinds = [0, 0, 0, 0, 0, 0];
  let seats = 0;
  const total = [0, 0, 0, 0, 0];
  for (let i = 0; i < games; i++) {
    const { picks, starts } = setupPicks(firstSeed + i, spec, filter);
    for (const p of picks) {
      const r = rounds[p.round - 1]!;
      r.n++;
      r.chosen += p.chosen;
      r.best += p.best;
      r.rank += p.rank;
      r.top += p.rank <= 3 ? 1 : 0;
      r.kinds += p.kinds;
    }
    for (const s of starts) {
      seats++;
      kinds[s.filter(x => x > 0).length]!++;
      s.forEach((x, r) => {
        total[r]! += x;
      });
    }
  }
  for (const [i, r] of rounds.entries())
    console.log(
      `pick ${i + 1}: pips ${(r.chosen / r.n).toFixed(2)} (best legal ${(r.best / r.n).toFixed(2)}), ` +
        `rank ${(r.rank / r.n).toFixed(1)}, top-3 ${((100 * r.top) / r.n).toFixed(0)}%, kinds ${(r.kinds / r.n).toFixed(2)}`,
    );
  console.log(`start pips by resource: ${NAMES.map((n, r) => `${n} ${(total[r]! / seats).toFixed(2)}`).join(', ')}`);
  console.log(`resource kinds at start: ${kinds.map((k, n) => `${n}: ${((100 * k) / seats).toFixed(0)}%`).join(', ')}`);
}
