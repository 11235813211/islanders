import { actWith, BOTS, type Brain } from '../shared/bots';
import { addPlayer, applyAction, createGame, GameError, getActivePlayerId, getView } from '../shared/engine';
import { bankGold, pendingBotActor } from '../shared/engine/time';
import type { GameAction, GameState } from '../shared/types';
import { endDiagnostics } from './diagnostics';
import type { Scenario } from './scenarios';

/**
 * Plays one all-bot game as fast as possible: no clocks, one bot move per step, and the same
 * fallbacks as the room's bot driver (engine/time.ts runBotStep) so a bad move never stalls it.
 */

export const NOW = 1_800_000_000_000;
const MAX_STEPS_PER_TURN = 30;

/** Deterministic PRNG (same as tests/fixtures.ts seeded). */
export function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

/** A lobby with `seats` players on the scenario's map and settings, not yet started. */
export function scenarioLobby(scenario: Scenario, seats: number, random: () => number): GameState {
  let g = createGame('TRAINING', random);
  for (let i = 0; i < seats; i++) g = addPlayer(g, { id: `p${i}`, name: `P${i}` });
  if (scenario.design)
    g = applyAction(g, 'p0', { type: 'choose-map', mapId: scenario.design.id }, random, NOW, {
      design: scenario.design,
    });
  const settings = { ...g.settings, ...scenario.settings };
  g = applyAction(g, 'p0', { type: 'configure', settings }, random, NOW);
  // The design's own points apply unless the scenario sets them.
  if (scenario.settings.victoryPoints) g.settings.victoryPoints = scenario.settings.victoryPoints;
  // Every seat is a bot (the level is only a label here: each seat's brain is passed in).
  for (const p of g.players) p.bot = 'advanced';
  return g;
}

export interface GameResult {
  winner: number | null;
  /** Visible + hidden points per seat at the end. */
  points: number[];
  turns: number;
  steps: number;
  victoryPoints: number;
  /** Per seat: how often each action type was taken (accepted by the engine). */
  actions: Record<string, number>[];
}

/** Hooks a caller can attach (data collection). */
export interface SimHooks {
  /** Called before each bot move with the state and the seat about to act. */
  beforeMove?(state: GameState, seat: number): void;
  /** Called with the final state. */
  end?(state: GameState): void;
}

/** Play a full game. `brains[i]` plays seat i (`p{i}`); the engine draws who goes first. */
export function playGame(
  scenario: Scenario,
  brains: Brain[],
  seed: number,
  hooks: SimHooks = {},
  maxSteps = 8000,
): GameResult {
  const random = seeded(seed);
  let g = scenarioLobby(scenario, brains.length, random);
  g = applyAction(g, 'p0', { type: 'start' }, random, NOW);
  const actions = brains.map(() => ({}) as Record<string, number>);
  const played = playOn(g, brains, random, { hooks, maxSteps, actions });
  g = played.state;
  hooks.end?.(g);
  endDiagnostics(g).forEach((counts, seat) => {
    Object.assign(actions[seat]!, counts);
  });
  const points = g.players.map(p => getView(g, p.id).players.find(q => q.id === p.id)!.points);
  return {
    winner: g.winnerId ? Number(g.winnerId.slice(1)) : null,
    points,
    turns: g.turn,
    steps: played.steps,
    victoryPoints: g.settings.victoryPoints,
    actions,
  };
}

/**
 * Bot moves from any state until the game ends, `maxSteps` moves, or turn `untilTurn` begins
 * (rollouts continue a game for a few turns).
 */
export function playOn(
  state: GameState,
  brains: Brain[],
  random: () => number,
  options: { hooks?: SimHooks; maxSteps?: number; untilTurn?: number; actions?: Record<string, number>[] } = {},
): { state: GameState; steps: number } {
  let g = state;
  let steps = 0;
  let turnSteps = 0;
  let lastTurn = -1;
  const { hooks = {}, maxSteps = 8000, untilTurn = Infinity, actions } = options;
  for (; steps < maxSteps && g.phase !== 'finished' && g.turn < untilTurn; steps++) {
    const actor = pendingBotActor(g);
    if (!actor) throw new Error(`No seat wants to act in phase ${g.phase} (turn ${g.turn}).`);
    if (g.turn !== lastTurn) {
      lastTurn = g.turn;
      turnSteps = 0;
    }
    turnSteps++;
    const seat = Number(actor.slice(1));
    hooks.beforeMove?.(g, seat);
    const fog = Object.keys(g.fog).length;
    g = step(g, actor, brains[seat]!, turnSteps, random);
    if (actions) {
      const kind = lastAction ?? 'fallback';
      actions[seat]![kind] = (actions[seat]![kind] ?? 0) + 1;
      const revealed = fog - Object.keys(g.fog).length;
      if (revealed) actions[seat]!['end: fog revealed'] = (actions[seat]!['end: fog revealed'] ?? 0) + revealed;
    }
  }
  return { state: g, steps };
}

/** The type of the action `step` last applied (null when it fell back). */
let lastAction: string | null = null;

/** One bot move with the room driver's fallbacks (exported for rollouts): the brain, then Beginner, then ending the turn. */
export function step(g: GameState, actor: string, brain: Brain, turnSteps: number, random: () => number): GameState {
  const view = getView(g, actor);
  const attempts: (() => GameAction)[] = [
    () => (turnSteps > MAX_STEPS_PER_TURN && g.phase === 'build' ? { type: 'end-turn' } : actWith(brain, view)),
    () => actWith(BOTS.beginner.brain, view, { builds: 99 }),
    () => bankGold(g, actor),
  ];
  for (const [i, attempt] of attempts.entries()) {
    try {
      const action = attempt();
      const next = applyAction(g, actor, action, random, NOW);
      lastAction = i === 0 ? action.type : 'fallback';
      return next;
    } catch (error) {
      if (!(error instanceof GameError)) throw error;
    }
  }
  lastAction = 'fallback';
  if (g.phase === 'build' && getActivePlayerId(g) === actor)
    return applyAction(g, actor, { type: 'end-turn' }, random, NOW);
  throw new Error(`Seat ${actor} has no legal move in phase ${g.phase}.`);
}
