import type { Economy } from './economy';
import { type FirstGoal, type ForecastSeat, type ForecastStart, forecast } from './forecast';
import { paceFrom } from './goals';
import type { Plan } from './plans';
import { type BoardChange, roadCurves } from './road-race';
import { harborRates } from './value';

/**
 * The build planner's lookahead (forecast.ts): the plans ranked best by payoff for the wait are
 * each tried as our next goal, and the one giving the best chance to win goes first. This is where
 * a road, a city and a settlement compete on equal terms: a road is worth it only if the whole
 * forecast, including what its cards could have bought instead, comes out ahead.
 */

/** Plans tried per decision. */
const TRIED = 5;
/** Longest Road counts only once someone's road could matter. */
const ROAD_MATTERS = 3;

const starts = new WeakMap<Economy, ForecastStart>();

/** The forecast's starting point for this decision, from what the view shows. */
export function forecastStart(econ: Economy): ForecastStart {
  let start = starts.get(econ);
  if (start) return start;
  const { view, geo, knobs } = econ;
  const curves = roadCurves(view, geo);
  const occupied = new Uint8Array(geo.n);
  for (const id of Object.keys(view.buildings)) occupied[geo.indexOf.get(id)!] = 1;
  const seats = view.players.map((p, i): ForecastSeat => {
    const { production, choice } = econ.productionOf(p.id);
    return {
      pace: paceFrom(econ, production, choice, harborRates(econ, p.id)),
      hand: { ...econ.handOf(p.id) },
      points: p.id === view.selfId ? p.points : p.publicPoints,
      settlements: Object.entries(view.buildings)
        .filter(([, b]) => b.playerId === p.id && b.kind === 'settlement')
        .map(([id]) => geo.indexOf.get(id)!),
      frontier: econ.frontiers[i]!,
      settlementsLeft: p.settlementsLeft,
      citiesLeft: p.citiesLeft,
      piecesLeft: p.roadsLeft + (view.seafaring ? p.shipsLeft : 0),
      road: curves[i]!,
    };
  });
  start = {
    geo,
    seats,
    me: econ.seat,
    target: view.settings.victoryPoints,
    occupied,
    holder: view.players.findIndex(p => p.id === view.longestRoadId),
    deck: view.developmentRemaining,
    reach: view.seafaring ? 7 : 5,
    pointPerCard: knobs.pointPerCard,
    roundsPerPoint: knobs.roundsPerPoint,
    spread: knobs.forecastSpread,
  };
  starts.set(econ, start);
  return start;
}

/** The forecast's version of a plan, or null for kinds it doesn't model (fog, survey ships). */
function goalOf(plan: Plan, econ: Economy): FirstGoal | null {
  const corner = plan.vertexId === undefined ? -1 : econ.geo.indexOf.get(plan.vertexId)!;
  if (plan.kind === 'city') return { kind: 'city', corner };
  if (plan.kind === 'settlement' || plan.kind === 'route') return { kind: 'settlement', corner };
  if (plan.kind === 'development') return { kind: 'development' };
  if (plan.kind === 'road') return { kind: 'road', pieces: Math.max(1, plan.cost.wood) };
  return null;
}

/** What the plan's first piece changes on the board for rivals' roads. */
function changeOf(plan: Plan, goal: FirstGoal, econ: Economy): BoardChange | null {
  if (goal.kind === 'settlement') return { corner: goal.corner, seat: econ.seat };
  if (plan.kind === 'road' && plan.edge) return { edge: plan.edge, seat: econ.seat };
  return null;
}

/** Our chance to win if we start with this plan: rivals' roads are re-measured around what it blocks. */
function chanceWith(econ: Economy, start: ForecastStart, plan: Plan, goal: FirstGoal): number {
  const change = changeOf(plan, goal, econ);
  const roadsMatter = start.seats.some(s => s.road[0]! >= ROAD_MATTERS);
  let from = start;
  if (change && roadsMatter) {
    const curves = roadCurves(econ.view, econ.geo, change);
    from = {
      ...start,
      seats: start.seats.map((s, i) => (i === econ.seat ? s : { ...s, road: curves[i]! })),
    };
  }
  return forecast(from, goal).chances[econ.seat]!;
}

/** The best few plans: the top ones overall plus the best of each kind, so roads get a hearing. */
function candidates(ranked: Plan[]): Plan[] {
  const out = ranked.slice(0, TRIED);
  const kinds = new Set(out.map(p => p.kind));
  for (const plan of ranked)
    if (!kinds.has(plan.kind)) {
      kinds.add(plan.kind);
      out.push(plan);
    }
  return out;
}

/** `ranked` with the plan the forecast prefers first, if it clearly beats the planner's own pick. */
export function forecastRank(econ: Economy, ranked: Plan[]): Plan[] {
  const top = ranked[0];
  const topGoal = top && goalOf(top, econ);
  if (!top || !topGoal) return ranked;
  const start = forecastStart(econ);
  let best = top;
  let score = chanceWith(econ, start, top, topGoal) + econ.knobs.forecastMargin;
  for (const plan of candidates(ranked).slice(1)) {
    const goal = goalOf(plan, econ);
    if (!goal) continue;
    const chance = chanceWith(econ, start, plan, goal);
    if (chance > score) [best, score] = [plan, chance];
  }
  return best === top ? ranked : [best, ...ranked.filter(p => p !== best)];
}
