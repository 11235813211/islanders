import { boardIndex } from '../../seafaring';
import { type GameView, RESOURCES } from '../../types';
import { pips } from '../analysis';
import type { Economy } from './economy';

/**
 * Where to put the robber or the pirate, and whom to rob. Every option is scored the same way:
 * pips it blocks (for the robber) or ships it hems in (for the pirate), times how close each
 * victim is to winning, plus the card it lets us steal, minus what it costs us.
 */

/** How much an opponent's progress matters: grows with their points toward the target. */
export function threat(econ: Economy, playerId: string): number {
  const { view, knobs } = econ;
  const player = view.players.find(p => p.id === playerId)!;
  const leader = view.players
    .filter(p => p.id !== view.selfId)
    .reduce((a, b) => (b.publicPoints > a.publicPoints ? b : a));
  const share = (player.publicPoints + player.developmentCount * 0.3) / view.settings.victoryPoints;
  return 1 + knobs.threatPoints * share * share + (leader.id === playerId ? knobs.threatLeader : 0);
}

/** Expected worth of one card stolen from this player (more if they hold what we're missing). */
function stealWorth(econ: Economy, playerId: string): number {
  const player = econ.view.players.find(p => p.id === playerId)!;
  if (!player.resourceCount) return 0;
  const goal = econ.bestGoal();
  if (!goal) return 1;
  const hand = econ.handOf(playerId);
  const useful = RESOURCES.reduce((n, r) => n + (econ.view.hand[r] < goal.cost[r] ? hand[r] : 0), 0);
  return 0.6 + Math.min(1, useful / player.resourceCount);
}

/** Score for moving the robber or pirate to `hexId`. */
export function hexScore(econ: Economy, hexId: string): number {
  const { view, knobs } = econ;
  const index = boardIndex(view.board);
  const hex = index.hex.get(hexId)!;
  const victims = new Set<string>();
  let value = 0;
  if (hex.terrain === 'sea') {
    // The pirate: robs ship owners beside it and stops them building or moving ships there.
    const ships = new Map<string, number>();
    for (const [edgeId, owner] of Object.entries(view.ships))
      if (index.edgeHexes.get(edgeId)!.includes(hex)) ships.set(owner, (ships.get(owner) ?? 0) + 1);
    for (const [owner, count] of ships) {
      if (owner === view.selfId) value -= knobs.selfHarm * count * 0.6;
      else {
        value += knobs.pirateBlock * threat(econ, owner) * Math.min(2, count);
        victims.add(owner);
      }
    }
  } else {
    const p = pips(hex.number);
    for (const id of hex.vertexIds) {
      const b = view.buildings[id];
      if (!b) continue;
      const times = b.kind === 'city' ? 2 : 1;
      if (b.playerId === view.selfId) value -= knobs.selfHarm * p * times;
      else {
        value += p * times * threat(econ, b.playerId);
        victims.add(b.playerId);
      }
    }
    // Leaving our own hex frees our production.
  }
  let steal = 0;
  for (const id of victims) steal = Math.max(steal, stealWorth(econ, id) * threat(econ, id));
  return value + knobs.stealValue * steal;
}

/** The best legal robber or pirate destination. */
export function robberHex(econ: Economy): string {
  const options = econ.view.legal.robberHexes;
  let best = options[0]!;
  let score = -Infinity;
  for (const id of options) {
    const s = hexScore(econ, id);
    if (s > score) [best, score] = [id, s];
  }
  return best;
}

/** Whom to rob: the most useful card from the most dangerous player. */
export function stealTarget(econ: Economy): string {
  const { view } = econ;
  return [...view.legal.stealTargets].sort(
    (a, b) => stealWorth(econ, b) * threat(econ, b) - stealWorth(econ, a) * threat(econ, a),
  )[0]!;
}

/** Own pips the robber is blocking right now. */
export function blockedOwnPips(view: GameView): number {
  const hex = boardIndex(view.board).hex.get(view.robber);
  if (!hex) return 0;
  return hex.vertexIds.reduce((n, id) => {
    const b = view.buildings[id];
    return b?.playerId === view.selfId ? n + pips(hex.number) * (b.kind === 'city' ? 2 : 1) : n;
  }, 0);
}
