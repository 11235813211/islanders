import { emptyBag } from '../../engine/core';
import { boardIndex, terrainResource } from '../../seafaring';
import { CLASSIC_RESOURCES, type GameView, type Resource, type ResourceBag, TILE_RESOURCES } from '../../types';
import { type ForecastStart, forecast } from './forecast';
import type { Geometry } from './geometry';
import type { Knobs } from './params';
import { roadCurves } from './road-race';

/**
 * Judging a finished starting position by how the game should go from it (forecast.ts): each
 * seat's income, harbors, room to expand against the others, and road prospects decide how soon
 * it reaches the target. This is what dice totals and a nearby-spot score only hint at.
 */

/**
 * The cards a start brings: the last piece placed collects one of each resource around it. The
 * corners still to be placed are the candidates; which of them comes last isn't known here, so
 * they count equally.
 */
function startingCards(view: GameView, geo: Geometry, corners: number[]): ResourceBag {
  const hand = emptyBag();
  const index = boardIndex(view.board);
  const unplaced = corners.filter(c => !view.buildings[geo.ids[c]!]);
  const last = unplaced.length ? unplaced : corners;
  for (const c of last)
    for (const hexId of index.vertex.get(geo.ids[c]!)!.hexIds) {
      const resource = terrainResource(index.hex.get(hexId)!.terrain);
      if (resource) hand[resource] += 1 / last.length;
    }
  return hand;
}

/** The forecast's starting point for a draft position (`owners`: seat per corner, -1 for none). */
export function setupStart(view: GameView, geo: Geometry, owners: Int8Array, knobs: Knobs): ForecastStart {
  const perRound = view.players.length / 36;
  const curves = roadCurves(view, geo, { owners, depth: 3, limit: 150 });
  const occupied = Uint8Array.from(owners, o => (o >= 0 ? 1 : 0));
  const placedNow = view.players.map(p => Object.values(view.buildings).filter(b => b.playerId === p.id).length);
  const seats = view.players.map((p, seat) => {
    const corners: number[] = [];
    for (let c = 0; c < owners.length; c++) if (owners[c] === seat) corners.push(c);
    const income = emptyBag();
    const rates: Record<Resource, number> = {
      wood: 4,
      brick: 4,
      sheep: 4,
      wheat: 4,
      ore: 4,
      lodestone: 4,
      paper: 0,
      cloth: 0,
      coin: 0,
    };
    let wild = 0;
    for (const c of corners) {
      CLASSIC_RESOURCES.forEach((r, i) => {
        income[r] += geo.pips[c * 5 + i]! * perRound;
      });
      income.lodestone += geo.lodestone[c]! * perRound;
      wild += geo.gold[c]! * perRound;
      const harbor = geo.harbor[c];
      if (harbor === 'any') for (const r of TILE_RESOURCES) rates[r] = Math.min(rates[r], 3);
      else if (harbor) rates[harbor] = 2;
    }
    const added = corners.length - placedNow[seat]!;
    return {
      pace: { income, wild, rates },
      hand: startingCards(view, geo, corners),
      points: corners.length,
      settlements: corners,
      frontier: corners,
      settlementsLeft: Math.max(0, p.settlementsLeft - added),
      citiesLeft: p.citiesLeft,
      piecesLeft: Math.max(0, p.roadsLeft + (view.seafaring ? p.shipsLeft : 0) - added),
      road: curves[seat]!,
    };
  });
  return {
    geo,
    seats,
    me: view.players.findIndex(p => p.id === view.selfId),
    target: view.settings.victoryPoints,
    occupied,
    holder: -1,
    deck: view.developmentRemaining,
    reach: view.seafaring ? 7 : 5,
    pointPerCard: knobs.pointPerCard,
    roundsPerPoint: knobs.roundsPerPoint,
    spread: knobs.forecastSpread,
  };
}

/** Our forecast chance to win from a finished draft, above an even share (in percentage points). */
export function setupEdge(view: GameView, geo: Geometry, owners: Int8Array, knobs: Knobs): number {
  const start = setupStart(view, geo, owners, knobs);
  return 100 * (forecast(start).chances[start.me]! - 1 / view.players.length);
}
