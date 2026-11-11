import type { Brain } from '../shared/bots';
import { moveCandidates } from '../shared/bots/advanced/choose';
import { Economy } from '../shared/bots/advanced/economy';
import { makeParams } from '../shared/bots/advanced/params';
import { getActivePlayerId, getView } from '../shared/engine';
import { bankShown } from '../shared/settings';
import { type DevelopmentCard, type GameAction, type GameState, RESOURCES, type ResourceBag } from '../shared/types';
import { rollout } from './rollouts';
import { seeded } from './sim';

/**
 * The headroom probe (PLAN step 1): a slow, training-only search seat. At each of its build
 * decisions it lists the candidates (every build, stopping, and the shipped bot's own move),
 * samples what it can't see (other hands from the public card count, their development cards and
 * the deck, fog, volcano dice) once per rollout, plays every candidate to the end with the
 * table's own bots on the same sample and dice, and confirms the best on fresh samples before
 * taking it over the bot's own move.
 *
 * It needs the game state to rebuild a sample, so it is a Brain bound to a live state (set before
 * each move by the job); everything hidden is resampled, so it only uses what its view shows
 * (except the bank's counts where the room hides them, which only bound the sampled hands).
 */

export interface SearchOptions {
  /** Rollouts per candidate when screening all of them. */
  screen: number;
  /** Fresh paired rollouts of the screen's best against the bot's own move. */
  confirm: number;
  /** Override only when the confirmed gain is this many standard errors above zero. */
  margin: number;
}

/** Statistics a game's search seat collects (decisions searched, how often it overrode the bot). */
export interface SearchStats {
  decisions: number;
  overrides: number;
  /** Sum over overrides of the confirmed gain in win share. */
  gain: number;
}

const knobs = makeParams().knobs;

/** A Brain that searches its own build decisions and otherwise plays `base`. */
export function searchBrain(
  base: Brain,
  live: () => GameState,
  brains: () => Brain[],
  seed: number,
  options: SearchOptions,
  stats: SearchStats,
): Brain {
  return {
    ...base,
    turn(view, turnOptions) {
      const own = base.turn(view, turnOptions);
      const state = live();
      if (view.phase !== 'build' || state.tradeOffer || getActivePlayerId(state) !== view.selfId) return own;
      return searchMove(state, view.selfId, own, brains(), seed, options, stats);
    },
  };
}

const key = (a: GameAction) => JSON.stringify(a);

/** The bot's own move unless another candidate wins clearly more often over determinized rollouts. */
export function searchMove(
  state: GameState,
  id: string,
  own: GameAction,
  brains: Brain[],
  seed: number,
  options: SearchOptions,
  stats: SearchStats,
): GameAction {
  const econ = new Economy(getView(state, id), knobs);
  const moves: GameAction[] = [own];
  for (const c of moveCandidates(econ)) {
    const action = c.action ?? { type: 'end-turn' };
    if (!moves.some(m => key(m) === key(action))) moves.push(action);
  }
  if (moves.length < 2) return own;
  // Screen: every candidate on the same few samples.
  const screen = playouts(state, id, moves, brains, seed, 0, options.screen);
  let best = 0;
  for (let i = 1; i < moves.length; i++) if (screen[i] && sum(screen[i]!) > sum(screen[best]!)) best = i;
  stats.decisions++;
  if (best === 0) return own;
  // Confirm on fresh samples (the screen's winner is biased upward): override only when the
  // paired difference is clearly above zero.
  const [mine, other] = playouts(state, id, [own, moves[best]!], brains, seed, options.screen, options.confirm);
  if (!mine || !other) return own;
  const diffs = other.map((x, k) => x - mine[k]!);
  const mean = sum(diffs) / diffs.length;
  const sd = Math.sqrt(sum(diffs.map(d => (d - mean) ** 2)) / Math.max(1, diffs.length - 1));
  if (mean <= options.margin * (sd / Math.sqrt(diffs.length))) return own;
  stats.overrides++;
  stats.gain += mean;
  return moves[best]!;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Each move's outcome (our win, 0 or 1) on samples first..first+count, every move meeting the
 * same sample and dice; null for a move that turned out illegal.
 */
function playouts(
  state: GameState,
  id: string,
  moves: GameAction[],
  brains: Brain[],
  seed: number,
  first: number,
  count: number,
): (number[] | null)[] {
  const out: (number[] | null)[] = moves.map(() => []);
  for (let k = first; k < first + count; k++) {
    const mix = Math.imul(seed, 7919) ^ Math.imul(state.version, 104729) ^ Math.imul(k + 1, 2654435761);
    const sample = determinize(state, id, seeded(mix ^ 0x5bd1e995));
    moves.forEach((move, i) => {
      if (!out[i]) return;
      const outcome = rollout(sample, id, move, brains, seeded(mix), { rounds: Infinity });
      if (outcome) out[i]!.push(outcome[0]!);
      else out[i] = null;
    });
  }
  return out;
}

/**
 * A copy of the state with everything `id` can't see redrawn: other players' cards (each hand's
 * size kept, drawn from what the public count says it likely holds), their unplayed development
 * cards with the deck, fog tiles among the fogged hexes, and volcano dice orders.
 *
 * Only public facts shape the sample: hand sizes, the public count, the bank where the room shows
 * it (otherwise the bank is redrawn too), and the multisets of unseen development cards, fog
 * tiles, and volcano faces (public from the rules and what has been played or revealed). Hidden
 * orders are sorted away before shuffling, so the same seed gives the same sample whatever the
 * hidden facts are (tests/search.test.ts).
 */
export function determinize(state: GameState, id: string, random: () => number): GameState {
  const others = state.players.filter(p => p.id !== id);
  const size = (bag: ResourceBag) => RESOURCES.reduce((n, r) => n + bag[r], 0);
  const truePool = emptyBag();
  for (const p of others) for (const r of RESOURCES) truePool[r] += p.resources[r];
  const bankPublic = bankShown(state.settings, state.players.length);
  // With the bank shown, the others' cards of each kind are supply − bank − ours: public.
  const pool = bankPublic ? truePool : estimatePool(state, others, size);
  const hands = new Map<string, ResourceBag>();
  for (const p of others) {
    const likely = { ...(state.handGuess.likely[p.id] ?? pool) };
    const hand = emptyBag();
    for (let c = size(p.resources); c > 0; c--) {
      const r = draw(pool, likely, random);
      pool[r]--;
      likely[r] = Math.max(0, likely[r] - 1);
      hand[r]++;
    }
    hands.set(p.id, hand);
  }
  // A hidden bank absorbs the difference, so no card is created or lost.
  const bank = { ...state.bank };
  if (!bankPublic)
    for (const r of RESOURCES) {
      const drawn = others.reduce((n, p) => n + hands.get(p.id)![r], 0);
      bank[r] = Math.max(0, bank[r] + truePool[r] - drawn);
    }
  // Other players' unplayed cards and the deck are one unseen pile: deal its kinds out again.
  const unseen: DevelopmentCard[] = [...state.developmentDeck, ...others.flatMap(p => p.development)];
  const kinds = shuffle(unseen.map(c => c.kind).sort(), random);
  let next = 0;
  const redeal = (cards: DevelopmentCard[]) => cards.map(c => ({ ...c, kind: kinds[next++]! }));
  const developmentDeck = redeal(state.developmentDeck);
  const players = state.players.map(p =>
    p.id === id ? p : { ...p, resources: hands.get(p.id)!, development: redeal(p.development) },
  );
  const fogHexes = Object.keys(state.fog).sort();
  const fogTiles = shuffle(Object.values(state.fog).sort(byJson), random);
  const fog = Object.fromEntries(fogHexes.map((hex, i) => [hex, fogTiles[i]!]));
  const volcanoDecks = Object.fromEntries(
    Object.entries(state.volcanoDecks).map(([hex, faces]) => [hex, shuffle([...faces].sort(), random)]),
  );
  const seen = { ...state.handGuess.seen };
  for (const [pid, hand] of hands) seen[pid] = { ...hand };
  return { ...state, players, bank, developmentDeck, fog, volcanoDecks, handGuess: { ...state.handGuess, seen } };
}

const byJson = (a: unknown, b: unknown) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);

/** Others' cards of each kind from the public count alone, rounded to their real total. */
function estimatePool(state: GameState, others: GameState['players'], size: (bag: ResourceBag) => number) {
  const exact = emptyBag();
  for (const p of others) for (const r of RESOURCES) exact[r] += state.handGuess.likely[p.id]?.[r] ?? 0;
  const pool = emptyBag();
  for (const r of RESOURCES) pool[r] = Math.floor(exact[r]);
  const total = others.reduce((n, p) => n + size(p.resources), 0);
  const order = [...RESOURCES].sort((x, y) => exact[y] - Math.floor(exact[y]) - (exact[x] - Math.floor(exact[x])));
  for (let i = 0; size(pool) < total; i++) pool[order[i % order.length]!]++;
  return pool;
}

const emptyBag = () => Object.fromEntries(RESOURCES.map(r => [r, 0])) as ResourceBag;

/** One resource from the pool, weighted by how many the hand likely holds (any left if none). */
function draw(pool: ResourceBag, likely: ResourceBag, random: () => number): (typeof RESOURCES)[number] {
  const weight = (r: (typeof RESOURCES)[number]) => (pool[r] > 0 ? likely[r] + 0.05 : 0);
  const total = RESOURCES.reduce((n, r) => n + weight(r), 0);
  let x = random() * total;
  for (const r of RESOURCES) {
    x -= weight(r);
    if (x < 0 && pool[r] > 0) return r;
  }
  return RESOURCES.find(r => pool[r] > 0)!;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
