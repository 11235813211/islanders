import type { Net } from './net';
import trained from './weights.json' with { type: 'json' };

/**
 * Everything the Advanced bot can be tuned on. KNOBS lists each number with its default and the
 * range training may search (training/tune.ts). weights.json holds the trained values and the
 * setup network; anything missing there falls back to the default here.
 */
export const KNOBS = {
  // Setup
  /** Setup corners scored with the full draft lookahead (the rest by quick score only). */
  setupCandidates: [8, 4, 14],
  /** Quick corner score: weight of resource variety, gold, harbor, and expansion room. */
  quickVariety: [1.6, 0, 4],
  quickGold: [1.3, 0.5, 3],
  quickHarbor: [1.2, 0, 4],
  quickReach: [0.35, 0, 1.5],
  /** Opponents in the draft lookahead: weight of variety in their quick score. */
  draftVariety: [1.6, 0, 4],
  /** Training only: chance of a different good corner, to learn what other starts are worth. */
  setupExplore: [0, 0, 1],
  /** Training only: chance of a random move among the value network's candidates. */
  valueExplore: [0, 0, 1],
  /** 0: the planner decides whether to build and the value network what; 1: the network decides both. */
  valueRole: [0, 0, 1],

  // Expansion
  /** How much an opponent being closer to a spot cuts its value (0: ignore races). */
  racePenalty: [0.6, 0, 1],
  /** Distance discount for spots: value / (1 + distanceCost * d^1.5). */
  distanceCost: [0.35, 0.1, 1],
  /** Victory points from an island bonus, in spot-value units per point. */
  bonusValue: [6, 2, 12],
  goldSpot: [1.4, 0.8, 2.5],

  // Goals and spending
  cityValue: [2.2, 1, 4],
  settlementValue: [2.4, 1, 4],
  developmentValue: [1.3, 0.5, 3],
  /** Share of the second-best goal counted in a hand's value. */
  secondGoal: [0.3, 0, 1],
  /** Extra goal value per point toward winning when a goal gives points. */
  endgamePush: [0.6, 0, 2],
  /** Hand value a development card is worth when it isn't the goal (high: buy whenever we can). */
  spareDevelopment: [5, 0, 5],
  /** Spare roads toward a spot this close (plus 2 on sea maps) when nothing else is bought. */
  spareRoads: [2, 0, 4],
  /** Chase Longest Road when this many roads would take it. */
  longestRoadReach: [2, 0, 4],

  // Robber and pirate
  /** Opponent threat: 1 + threatPoints * (their points / target)^2 + threatLeader if they lead. */
  threatPoints: [3, 0, 8],
  threatLeader: [1, 0, 3],
  /** Value of one card stolen, against one pip blocked. */
  stealValue: [2.5, 0, 6],
  /** Pirate: value per opponent ship it blocks, scaled by threat. */
  pirateBlock: [1.5, 0, 5],
  /** Penalty per own pip under the robber (or own ship beside the pirate). */
  selfHarm: [4, 1, 10],
  /** Play a knight early (before rolling) when the robber blocks at least this many own pips. */
  knightRelief: [3, 1, 6],

  // Trading
  /** Least gain (hand value) a trade must bring. */
  tradeMargin: [0.05, -0.2, 0.5],
  /** Scale on the partner's estimated gain, times their threat, subtracted from ours. */
  partnerGain: [0.35, 0, 1.5],
  /** Never trade with someone this close to winning (points from the target). */
  tradeCutoff: [2, 0, 4],
  /** Offer 2-for-1 to bots when the 1-for-1 is turned down. */
  generousOffers: [1, 0, 1],
  /** Offers per turn at an all-bot table (capped lower with people: trade.ts PEOPLE_TABLE_OFFERS). */
  offersPerTurn: [2, 0, 3],
  /** Counter offers we'd refuse with one we'd take. */
  counters: [1, 0, 1],
  /** Ask for 2-for-1 in our favor first. */
  greedyOffers: [0, 0, 1],
} satisfies Record<string, [number, number, number]>;

export type Knob = keyof typeof KNOBS;
export type Knobs = Record<Knob, number>;

export interface AdvancedParams {
  knobs: Knobs;
  /** Scores final setup positions (training/README.md). Without it, setup uses the quick score. */
  setupNet: Net | null;
  /** Scores positions during play (value.ts). Without it, building follows the planner's order. */
  valueNet: Net | null;
}

/** What a checkpoint or weights.json holds. */
export interface StoredParams {
  knobs?: Partial<Record<string, number>>;
  setupNet?: Net | null;
  valueNet?: Net | null;
}

/** Defaults with any overrides applied (unknown knob names are ignored). */
export function makeParams(overrides: StoredParams = {}) {
  const knobs = Object.fromEntries(Object.entries(KNOBS).map(([k, [d]]) => [k, d])) as Knobs;
  for (const [k, v] of Object.entries(overrides.knobs ?? {}))
    if (k in knobs && typeof v === 'number') knobs[k as Knob] = v;
  return { knobs, setupNet: overrides.setupNet ?? null, valueNet: overrides.valueNet ?? null } satisfies AdvancedParams;
}

/** The shipped parameters: defaults plus whatever training saved in weights.json. */
export const TRAINED: AdvancedParams = makeParams(trained as StoredParams);
