import { BOTS } from '../shared/bots';
import { Economy } from '../shared/bots/advanced/economy';
import { distanceFrom, isOpen } from '../shared/bots/advanced/geometry';
import { makeParams } from '../shared/bots/advanced/params';
import { races } from '../shared/bots/advanced/rivals';
import { getActivePlayerId, getView, normalizeGame } from '../shared/engine';
import type { GameState } from '../shared/types';
import type { Position } from './record-disagree';
import { drawScenario, type ScenarioFilter } from './scenarios';
import { playGame } from './sim';

/**
 * How well the rival model (shared/bots/advanced/rivals.ts) predicts where players settle next:
 * at the start of every turn, another seat's view predicts each player's likely targets; when a
 * player then builds a settlement (after setup), check whether it was the top prediction or among
 * them, against a simple baseline (the nearest open corner). Games are shipped Advanced bots.
 */

interface Prediction {
  top: number[];
  nearest: number;
}

export interface RaceCheck {
  settlements: number;
  top1: number;
  top3: number;
  nearest: number;
  /** Settlements no prediction covered (the player had no reachable target in the model). */
  unpredicted: number;
}

const knobs = { ...makeParams().knobs, raceModel: 1 };

/** Run `games` games from `firstSeed` and count how often settlements were predicted. */
export function raceCheck(games: number, firstSeed: number, filter?: ScenarioFilter): RaceCheck {
  const out: RaceCheck = { settlements: 0, top1: 0, top3: 0, nearest: 0, unpredicted: 0 };
  for (let seed = firstSeed; seed < firstSeed + games; seed++) {
    const scenario = drawScenario(seed, filter);
    const brains = Array.from({ length: scenario.players }, () => BOTS.advanced.brain);
    const predictions = new Map<string, Prediction>();
    let known = new Set<string>();
    let lastRoll = -1;
    playGame(scenario, brains, seed, {
      beforeMove(state) {
        if (state.phase.startsWith('setup')) {
          known = new Set(Object.keys(state.buildings));
          return;
        }
        score(state, known, predictions, out);
        known = new Set(Object.keys(state.buildings));
        if (state.phase === 'roll' && state.turn !== lastRoll) {
          lastRoll = state.turn;
          predict(state, predictions);
        }
      },
    });
  }
  return out;
}

/** Count new settlements since `known` against the latest predictions. */
function score(state: GameState, known: Set<string>, predictions: Map<string, Prediction>, out: RaceCheck): void {
  for (const [vertexId, b] of Object.entries(state.buildings)) {
    if (known.has(vertexId) || b.kind !== 'settlement') continue;
    const p = predictions.get(b.playerId);
    out.settlements++;
    if (!p?.top.length) {
      out.unpredicted++;
      continue;
    }
    const geoIndex = predictionIndex(state, vertexId);
    if (p.top[0] === geoIndex) out.top1++;
    if (p.top.includes(geoIndex)) out.top3++;
    if (p.nearest === geoIndex) out.nearest++;
  }
}

let indexCache: { board: unknown; ids: Map<string, number> } | null = null;

/** A corner's geometry index (cached per board). */
function predictionIndex(state: GameState, vertexId: string): number {
  if (indexCache?.board !== state.board) {
    const econ = new Economy(getView(state, state.players[0]!.id), knobs);
    indexCache = { board: state.board, ids: econ.geo.indexOf };
  }
  return indexCache.ids.get(vertexId)!;
}

/**
 * The same check on a person's settlements in saved games (positions from `records-positions`):
 * each settlement the person built after setup, against the prediction made from another seat's
 * view at the person's previous recorded move before that turn (about a turn earlier).
 */
export function raceCheckPeople(positions: Position[]): RaceCheck {
  const out: RaceCheck = { settlements: 0, top1: 0, top3: 0, nearest: 0, unpredicted: 0 };
  const byGame = new Map<number, Position[]>();
  for (const p of positions) byGame.set(p.game, [...(byGame.get(p.game) ?? []), p]);
  for (const list of byGame.values()) {
    list.sort((a, b) => a.step - b.step);
    for (const p of list) {
      if (p.person.type !== 'build-settlement' || p.state.phase.startsWith('setup')) continue;
      const earlier = list.filter(q => q.state.turn < p.state.turn && !q.state.phase.startsWith('setup')).at(-1);
      out.settlements++;
      if (!earlier) {
        out.unpredicted++;
        continue;
      }
      const state = normalizeGame(earlier.state, earlier.state.updatedAt, () => 0.5);
      const predictions = new Map<string, Prediction>();
      predict(state, predictions, earlier.actor);
      const guess = predictions.get(p.actor);
      const corner = predictionIndex(state, p.person.vertexId);
      if (!guess?.top.length) out.unpredicted++;
      else {
        if (guess.top[0] === corner) out.top1++;
        if (guess.top.includes(corner)) out.top3++;
      }
      if (guess?.nearest === corner) out.nearest++;
    }
  }
  return out;
}

/** Every player's predicted targets, seen by a seat other than `about` (default: the active one). */
function predict(state: GameState, predictions: Map<string, Prediction>, about?: string): void {
  const active = state.players.findIndex(p => p.id === (about ?? getActivePlayerId(state)));
  const observer = state.players[(active + 1) % state.players.length]!.id;
  const econ = new Economy(getView(state, observer), knobs);
  const r = races(econ);
  const occupied = new Uint8Array(econ.geo.n);
  for (const id of Object.keys(state.buildings)) occupied[econ.geo.indexOf.get(id)!] = 1;
  econ.view.players.forEach((p, seat) => {
    let nearest = -1;
    let best = 255;
    for (let c = 0; c < econ.geo.n; c++) {
      if (!econ.geo.land[c] || !isOpen(econ.geo, occupied, c)) continue;
      const d = distanceFrom(econ.geo, econ.frontiers[seat]!, c);
      if (d < best) [nearest, best] = [c, d];
    }
    predictions.set(p.id, { top: r.intents[seat]!.map(t => t.corner), nearest });
  });
}
