import { describe, expect, it } from 'vitest';
import { chooseBotAction } from '../shared/bots';
import { makeAdvanced } from '../shared/bots/advanced';
import { Economy } from '../shared/bots/advanced/economy';
import { forecast } from '../shared/bots/advanced/forecast';
import { cornerPips } from '../shared/bots/advanced/geometry';
import { makeParams, TRAINED } from '../shared/bots/advanced/params';
import { forecastRank, forecastStart } from '../shared/bots/advanced/plan-forecast';
import { canStart, rankedPlans } from '../shared/bots/advanced/plan-turn';
import { setupEdge } from '../shared/bots/advanced/setup-forecast';
import { hexPips } from '../shared/bots/analysis';
import { applyAction, getActivePlayerId, getView } from '../shared/engine';
import { type GameState, RESOURCES } from '../shared/types';
import { playBotGame } from './bot-harness';
import { inSeatOrder, makeLobby, seeded, TEST_NOW } from './fixtures';

const knobs = { ...makeParams({ knobs: TRAINED.knobs }).knobs, forecastPlan: 1, roadFrom: 25 };

function buildStates(): GameState[] {
  const out: GameState[] = [];
  playBotGame(['advanced', 'advanced', 'advanced', 'advanced'], 21, 6000, undefined, g => {
    if (g.phase === 'build') out.push(structuredClone(g));
  });
  return out.filter((_, i) => i % 5 === 0);
}

describe('game forecast', () => {
  it('gives every seat a finish and chances that add up', () => {
    for (const g of buildStates()) {
      const econ = new Economy(getView(g, getActivePlayerId(g)!), knobs);
      const f = forecast(forecastStart(econ));
      expect(f.chances.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      for (const s of f.seats) expect(s.finish).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not count income the robber is blocking', () => {
    let checked = 0;
    for (const g of buildStates()) {
      const hex = g.board.hexes.find(h => h.id === g.robber)!;
      if (!hexPips(hex)) continue;
      const econ = new Economy(getView(g, getActivePlayerId(g)!), knobs);
      const corner = g.board.vertices.findIndex(v => v.hexIds.includes(hex.id));
      const income = forecastStart(econ).incomeAt!(corner);
      const counted = RESOURCES.reduce((n, r) => n + income.cards[r], income.wild);
      const perRound = g.players.length / 36;
      expect(counted).toBeCloseTo((cornerPips(econ.geo, corner) - hexPips(hex)) * perRound, 5);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('never passes up an affordable city or settlement for something else', () => {
    for (const g of buildStates()) {
      const econ = new Economy(getView(g, getActivePlayerId(g)!), knobs);
      const ranked = rankedPlans(econ);
      const top = ranked[0];
      if (!top || !canStart(econ, top) || (top.kind !== 'city' && top.kind !== 'settlement')) continue;
      const first = forecastRank(econ, ranked, p => canStart(econ, p))[0]!;
      expect(['city', 'settlement']).toContain(first.kind);
    }
  });

  it('keeps a six-player placement with the forecast within the move budget', () => {
    const random = seeded(4);
    let g = makeLobby(6);
    for (const p of g.players) p.bot = 'advanced';
    g = inSeatOrder(applyAction(g, 'p0', { type: 'start' }, random, TEST_NOW));
    const brain = makeAdvanced({ ...makeParams(TRAINED), knobs: { ...knobs, setupForecast: 0.25 } });
    let worst = 0;
    for (let step = 0; step < 24 && g.phase.startsWith('setup'); step++) {
      const id = getActivePlayerId(g)!;
      const view = getView(g, id);
      const started = performance.now();
      const action =
        g.phase === 'setup-settlement' ? brain.turn(view, {}) : chooseBotAction(view, { level: 'advanced' });
      worst = Math.max(worst, performance.now() - started);
      g = applyAction(g, id, action, random, TEST_NOW);
    }
    process.stderr.write(`six-player placement with forecast: worst ${worst.toFixed(1)} ms\n`);
    expect(worst).toBeLessThan(40);
  });

  it('scores a finished draft from its owners', () => {
    const g = makeLobby(4);
    const started = inSeatOrder(applyAction(g, 'p0', { type: 'start' }, seeded(2), TEST_NOW));
    const view = getView(started, getActivePlayerId(started)!);
    const econ = new Economy(view, knobs);
    const owners = new Int8Array(econ.geo.n).fill(-1);
    owners[0] = econ.seat;
    expect(Number.isFinite(setupEdge(view, econ.geo, owners, knobs))).toBe(true);
  });
});
