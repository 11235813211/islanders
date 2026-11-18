import { describe, expect, it } from 'vitest';
import { Economy } from '../shared/bots/advanced/economy';
import { makeParams, TRAINED } from '../shared/bots/advanced/params';
import { graphOf, worldOf } from '../shared/bots/advanced/road-graph';
import { routeEdges } from '../shared/bots/advanced/road-links';
import { roadRace } from '../shared/bots/advanced/road-race';
import { getActivePlayerId, getView } from '../shared/engine';
import { emptyBag } from '../shared/engine/core';
import type { GameState } from '../shared/types';
import { playBotGame } from './bot-harness';

const knobs = { ...makeParams({ knobs: TRAINED.knobs }).knobs, roadRace: 1, roadFrom: 25 };

/** Build-phase states of a real game, for whoever is to act. */
function buildStates(players = 3): GameState[] {
  const out: GameState[] = [];
  playBotGame(Array(players).fill('advanced'), 11, 6000, undefined, g => {
    if (g.phase === 'build') out.push(structuredClone(g));
  });
  return out.filter((_, i) => i % 6 === 0);
}

const actor = (g: GameState) => getActivePlayerId(g)!;

/** A copy of `g` where `id` has this much wood and brick and no other cards. */
function withRoadCards(g: GameState, id: string, cards: number): GameState {
  const next = structuredClone(g);
  const p = next.players.find(x => x.id === id)!;
  p.resources = { ...emptyBag(), wood: cards, brick: cards };
  return next;
}

describe('Longest Road race', () => {
  it('stays out of the plans unless its knob is on', () => {
    const g = buildStates()[4]!;
    const econ = new Economy(getView(g, actor(g)), makeParams({ knobs: TRAINED.knobs }).knobs);
    expect(econ.plans.filter(p => p.kind === 'road').every(p => p.edge === undefined)).toBe(true);
  });

  it('offers only legal-looking plans with positive worth', () => {
    let seen = 0;
    for (const g of buildStates()) {
      const econ = new Economy(getView(g, actor(g)), knobs);
      for (const plan of roadRace(econ).plans) {
        seen++;
        expect(plan.spare).toBe(econ.self.points + 2 < econ.victoryTarget);
        expect(plan.payoff).toBeGreaterThan(0);
        expect(g.board.edges.some(e => e.id === plan.edge)).toBe(true);
        expect(g.roads[plan.edge]).toBeUndefined();
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('expects to reach the award more often when it can pay for the roads', () => {
    let richer = 0;
    let compared = 0;
    for (const g of buildStates()) {
      const id = actor(g);
      const best = (cards: number) =>
        Math.max(
          0,
          ...roadRace(new Economy(getView(withRoadCards(g, id, cards), id), knobs))
            .summary()
            .options.map(o => o.arrive),
        );
      const [poor, rich] = [best(0), best(6)];
      if (!poor && !rich) continue;
      compared++;
      expect(rich).toBeGreaterThanOrEqual(poor - 1e-9);
      if (rich > poor) richer++;
    }
    expect(compared).toBeGreaterThan(0);
    expect(richer).toBeGreaterThan(0);
  });

  it('pays only for what committing adds to the chance it would have anyway', () => {
    for (const g of buildStates()) {
      const race = roadRace(new Economy(getView(g, actor(g)), knobs));
      const { base, left, options } = race.summary();
      const worthwhile = options.filter(o => o.chance > base);
      if (left <= knobs.roadFrom) expect(race.plans.length).toBeGreaterThanOrEqual(worthwhile.length);
      else expect(race.plans).toHaveLength(0);
      for (const o of options) expect(o.chance).toBeLessThanOrEqual(1);
      if (!worthwhile.length) expect(base).toBeGreaterThanOrEqual(Math.max(0, ...options.map(o => o.chance)));
    }
  });

  it('leaves the early game alone', () => {
    const early = { ...knobs, roadFrom: 5 };
    for (const g of buildStates()) {
      const race = roadRace(new Economy(getView(g, actor(g)), early));
      if (race.summary().left > 5) expect(race.plans).toHaveLength(0);
    }
  });

  it('follows a settlement route exactly: its first piece, then free or own edges to the spot', () => {
    let routes = 0;
    for (const g of buildStates()) {
      const econ = new Economy(getView(g, actor(g)), knobs);
      const graph = graphOf(econ.view, econ.geo.indexOf);
      const world = worldOf(econ.view, graph, econ.geo.indexOf);
      for (const plan of econ.plans.filter(p => p.kind === 'route')) {
        const { firstEdge, distance } = plan.path!;
        const corner = econ.geo.indexOf.get(plan.vertexId!)!;
        const route = routeEdges(graph, world, econ.seat, firstEdge, corner, distance);
        if (!route) continue;
        routes++;
        expect(graph.ids[route[0]!]).toBe(firstEdge);
        expect(route.length).toBeLessThanOrEqual(distance);
        for (const edge of route) expect(world.edges[edge]).toBe(-1);
      }
    }
    expect(routes).toBeGreaterThan(0);
  });

  it('credits routes only for what they add to the road', () => {
    const linked = { ...knobs, roadRoute: 1 };
    let credited = 0;
    for (const g of buildStates()) {
      const payoffs = (k: typeof knobs) =>
        new Map(
          new Economy(getView(g, actor(g)), k).plans.filter(p => p.kind === 'route').map(p => [p.vertexId, p.payoff]),
        );
      const [plain, withCredit] = [payoffs(knobs), payoffs(linked)];
      for (const [id, payoff] of withCredit) {
        expect(payoff).toBeGreaterThanOrEqual(plain.get(id)! - 1e-9);
        if (payoff > plain.get(id)! + 1e-9) credited++;
      }
    }
    expect(credited).toBeGreaterThan(0);
  });

  it('lets what a road opens up change its worth, not how far the road can go', () => {
    const opening = { ...knobs, roadOpens: 1 };
    let raised = 0;
    for (const g of buildStates()) {
      const view = getView(g, actor(g));
      const [plain, open] = [roadRace(new Economy(view, knobs)), roadRace(new Economy(view, opening))];
      expect(open.summary().options.map(o => o.length)).toEqual(plain.summary().options.map(o => o.length));
      expect(open.plans.every(p => p.payoff > 0)).toBe(true);
      const total = (race: typeof plain) => race.plans.reduce((n, p) => n + p.payoff, 0);
      if (total(open) > total(plain) + 1e-9) raised++;
    }
    expect(raised).toBeGreaterThan(0);
  });
});
