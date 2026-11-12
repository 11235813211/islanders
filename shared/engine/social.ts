import { shuffled } from '../board';
import { copyData } from '../copy';
import type { GameAction, GameState } from '../types';
import { addLog, cloneState, requireRule } from './core';

const ACTIVE_PHASES = (state: GameState) => !['lobby', 'finished'].includes(state.phase);
export const PROPOSAL_MS = 45_000;

/** Push every running clock later, e.g. after a pause or an undo. */
export function shiftClocks(state: GameState, milliseconds: number): void {
  if (state.turnDeadline !== null) state.turnDeadline += milliseconds;
  if (state.rollDeadline !== null) state.rollDeadline += milliseconds;
  if (state.tradeOffer) {
    state.tradeOffer.createdAt += milliseconds;
    state.tradeOffer.expiresAt += milliseconds;
  }
}

/**
 * Development cards bought since `restored` was saved go back into the deck, which is reshuffled:
 * the buyer saw the card, so it must not sit on top waiting for the next purchase. (The deck itself
 * is never part of an undo snapshot.)
 */
function returnBoughtCards(current: GameState, restored: GameState, random: () => number): void {
  const kept = new Set(restored.players.flatMap(p => p.development.map(card => card.id)));
  const bought = current.players.flatMap(p => p.development).filter(card => !kept.has(card.id));
  if (!bought.length) return;
  restored.developmentDeck = shuffled(
    [...current.developmentDeck, ...bought.map(card => ({ ...card, boughtTurn: -1 }))],
    random,
  );
}

function resolveProposal(state: GameState, now: number, random: () => number): GameState {
  const proposal = state.proposal!;
  if (!proposal.required.every(id => proposal.accepted.includes(id))) return state;
  if (proposal.kind === 'pause') {
    state.pausedAt = now;
    state.pauseReason = 'vote';
    addLog(state, 'The players paused the game.');
  }
  if (proposal.kind === 'resume') {
    shiftClocks(state, now - state.pausedAt!);
    state.pausedAt = null;
    state.pauseReason = null;
    addLog(state, 'The players resumed the game.');
  }
  if (proposal.kind === 'undo') {
    const undo = state.undo!;
    const history = [...state.undoHistory];
    const restored: GameState = {
      ...state,
      ...copyData(undo.snapshot),
      version: state.version,
      chat: state.chat,
      spectators: state.spectators,
      log: state.log,
      undo: history.pop() ?? null,
      undoHistory: history,
      proposal: null,
    };
    returnBoughtCards(state, restored, random);
    shiftClocks(restored, now - undo.at);
    addLog(restored, `The players undid: ${undo.description}`);
    return restored;
  }
  state.proposal = null;
  return state;
}

/** Chat, proposals, and votes. Returns null for any other action. */
export function socialAction(
  state: GameState,
  playerId: string,
  action: GameAction,
  now: number,
  random: () => number,
  online?: string[],
): GameState | null {
  if (action.type !== 'chat' && action.type !== 'propose' && action.type !== 'vote') return null;
  const member = [...state.players, ...state.spectators].find(p => p.id === playerId);
  requireRule(member, 'You are not a member of this room.');
  let next = cloneState(state);
  if (action.type === 'chat') {
    const last = [...next.chat].reverse().find(message => message.senderId === playerId);
    requireRule(!last || now - last.at >= 1000, 'Wait a moment before sending another message.');
    next.chat.push({
      id: `chat-${next.version + 1}`,
      senderId: playerId,
      name: member.name,
      text: action.text.trim(),
      at: now,
      spectator: !next.players.some(p => p.id === playerId),
    });
    next.chat = next.chat.slice(-80);
  } else {
    requireRule(
      next.players.some(p => p.id === playerId),
      'Spectators cannot vote or change the game.',
    );
    requireRule(ACTIVE_PHASES(next), 'Start a game before proposing a change.');
    if (action.type === 'propose') {
      requireRule(
        !next.proposal || next.proposal.expiresAt <= now || next.proposal.rejected.length > 0,
        'A proposal is already open.',
      );
      if (action.kind === 'undo')
        requireRule(
          next.undo && next.undo.actorId === playerId && next.pausedAt === null,
          'You can request undo of your latest build, trade, or turn change.',
        );
      if (action.kind === 'pause') requireRule(next.pausedAt === null, 'The game is already paused.');
      if (action.kind === 'resume') requireRule(next.pausedAt !== null, 'The game is not paused.');
      // Bots never vote. In a solo test room one person holds every seat, so an undo needs no
      // votes (pause and resume still collect them there, to try out voting). Pause and resume
      // only need people who are connected.
      const required =
        next.testMode && action.kind === 'undo'
          ? [playerId]
          : next.players
              .filter(p => !p.bot && (action.kind === 'undo' || !online || online.includes(p.id) || p.id === playerId))
              .map(p => p.id);
      next.proposal = {
        id: `proposal-${next.version + 1}`,
        kind: action.kind,
        fromId: playerId,
        required,
        accepted: [playerId],
        rejected: [],
        expiresAt: now + PROPOSAL_MS,
        description:
          action.kind === 'undo'
            ? next.undo!.description
            : action.kind === 'pause'
              ? 'Pause the game and its clocks'
              : 'Resume the game',
      };
      next = resolveProposal(next, now, random);
    } else {
      const proposal = next.proposal;
      requireRule(
        proposal && proposal.id === action.proposalId && proposal.expiresAt > now && !proposal.rejected.length,
        'That proposal has expired.',
      );
      requireRule(
        proposal.required.includes(playerId) && !proposal.accepted.includes(playerId),
        'Your vote has already been recorded or is not needed.',
      );
      if (action.accept) {
        proposal.accepted.push(playerId);
        next = resolveProposal(next, now, random);
      } else {
        addLog(next, `${member.name} declined the ${proposal.kind} proposal.`);
        proposal.rejected.push(playerId);
        proposal.expiresAt = now + 5000;
      }
    }
  }
  next.version++;
  return next;
}

/** Freeze clocks while nobody is connected. Returns the same object when nothing changes. */
export function idlePause(state: GameState, now: number): GameState {
  if (!ACTIVE_PHASES(state) || state.pausedAt !== null) return state;
  const next = cloneState(state);
  next.pausedAt = now;
  next.pauseReason = 'idle';
  next.proposal = null;
  next.version++;
  addLog(next, 'Paused while everyone is away.');
  return next;
}

/** Undo an idle pause when someone reconnects. Vote pauses stay until players vote to resume. */
export function idleResume(state: GameState, now: number): GameState {
  if (state.pauseReason !== 'idle' || state.pausedAt === null) return state;
  const next = cloneState(state);
  shiftClocks(next, now - next.pausedAt!);
  next.pausedAt = null;
  next.pauseReason = null;
  next.updatedAt = now;
  next.version++;
  addLog(next, 'Resumed.');
  return next;
}

/** Note in the log that a person connected or disconnected; nothing else changes (no-op outside a game). */
export function logPresence(state: GameState, playerId: string, online: boolean): GameState {
  const player = state.players.find(p => p.id === playerId && !p.bot);
  if (!ACTIVE_PHASES(state) || !player) return state;
  const next = cloneState(state);
  next.version++;
  addLog(next, `${player.name} ${online ? 'connected' : 'disconnected'}.`, { kind: 'presence', playerId, online });
  return next;
}
