import type { Net } from './net';
import type { Selector } from './selector';
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

  // Strategy (strategy.ts): which whole-game plan to lean toward; 0 is the shipped bot. Not tuned.
  strategy: [0, 0, 5],
  /** Selector: least predicted advantage over the shipped play before leaning to a strategy (selector.ts). */
  selectorMargin: [0.02, 0, 0.2],
  /** Setup: weight of the strategy's preferred starting resources and reach (strategy.ts). */
  setupLean: [5, 0, 15],

  // Plans (plans.ts)
  /** 0: the fixed-order planner; 1: plans weighed by payoff per turn. */
  planner: [0, 0, 1],
  /** Points one resource card is worth (a settlement is four cards and a point, plus production). */
  pointPerCard: [0.22, 0.1, 0.4],
  /** Share of a later city's return counted in a settlement's (what the settlement makes possible). */
  cityOption: [0, 0, 1],
  /** Share of the best spot a settlement opens beyond it (two or three pieces on) counted in its return. */
  frontierOption: [0, 0, 1],
  /** Scale on exploring fog's estimated return (planner 1). */
  exploreValue: [1, 0, 2],
  /** Rounds the game lasts per point the leader still needs. */
  roundsPerPoint: [2.2, 1, 4],

  // Forecast (forecast.ts)
  /** 1: the planner's best plans are compared by a forecast of the game (plan-forecast.ts). */
  forecastPlan: [0, 0, 1],
  /** How much better (chance to win) another plan must forecast to replace the planner's pick. */
  forecastMargin: [0.01, 0, 0.1],
  /** Uncertainty in a seat's forecast finish, per square root of the rounds left. */
  forecastSpread: [5, 0.3, 8],
  /** Setup: weight of the forecast against the setup network (setup-forecast.ts); 0 is off. */
  setupForecast: [0, 0, 2],

  // Expansion
  /** How much an opponent being closer to a spot cuts its value (0: ignore races). */
  racePenalty: [0.6, 0, 1],
  /** Distance discount for spots: value / (1 + distanceCost * d^1.5). */
  distanceCost: [0.35, 0.1, 1],
  /** Victory points from an island bonus, in spot-value units per point. */
  bonusValue: [6, 2, 12],
  goldSpot: [1.4, 0.8, 2.5],

  /** 0: races judged by who is closer (racePenalty); 1: by predicted rival targets and arrival (rivals.ts). */
  raceModel: [0, 0, 1],

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
  /** Scale on Longest Road valued as a race (road-race.ts); 0 keeps the fixed road goal. */
  roadRace: [0, 0, 2],
  /** Road race: share of a rival's income we expect on roads when they lead nowhere it wants. */
  roadShare: [0.4, 0.1, 1],
  /** Road race: starts once the game has about this many rounds left (early cards should compound). */
  roadFrom: [15, 5, 25],
  /** Road race: how much it may also change which routes and settlements we pick (0: spare roads only). */
  roadRoute: [0, 0, 1],
  /** Road race: share of our income we would really put into roads when going for the award. */
  roadCommit: [0.7, 0.3, 1],

  // Cartographers
  /** A survey ship as a goal (a point that also charts tiles), like cityValue. */
  surveyValue: [2.6, 1, 5],
  /** Worth of a lodestone pip at a new settlement, against a scarce pip of another resource. */
  lodestoneSpot: [1.2, 0, 3],
  /** Setup: score per lodestone pip at a seat's starting corners (outside the setup network). */
  setupLodestone: [1, 0, 4],
  /** Charts and splits: a rival's card counts against ours at this rate (charting.ts TileTuning). */
  chartRivalShare: [1, 0, 3],
  /** Charts and splits: weight of rivals likely to settle a tile's open corners later, or build cities there. */
  chartFutureRivals: [1, 0, 2],
  /** Chart gain on a lodestone tile is multiplied by this. */
  chartLodestoneTile: [1, 0.5, 3],
  /** 1: split into the resource it earns none of, trading for the card first. */
  splitTrade: [1, 0, 1],

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
  /** Picks a strategy from the position (selector.ts). Without it, the bot plays its `strategy` knob. */
  selector: Selector | null;
}

/** What a checkpoint or weights.json holds. */
export interface StoredParams {
  knobs?: Partial<Record<string, number>>;
  setupNet?: Net | null;
  valueNet?: Net | null;
  selector?: Selector | null;
}

/** Defaults with any overrides applied (unknown knob names are ignored). */
export function makeParams(overrides: StoredParams = {}) {
  const knobs = Object.fromEntries(Object.entries(KNOBS).map(([k, [d]]) => [k, d])) as Knobs;
  for (const [k, v] of Object.entries(overrides.knobs ?? {}))
    if (k in knobs && typeof v === 'number') knobs[k as Knob] = v;
  return {
    knobs,
    setupNet: overrides.setupNet ?? null,
    valueNet: overrides.valueNet ?? null,
    selector: overrides.selector ?? null,
  } satisfies AdvancedParams;
}

/** The shipped parameters: defaults plus whatever training saved in weights.json. */
export const TRAINED: AdvancedParams = makeParams(trained as StoredParams);
