import { generateHarbors } from '../board';
import { firstFreeColor, isPlayerColor } from '../colors';
import { developmentDeck, updateAwards } from '../rules';
import { DEFAULT_SETTINGS } from '../settings';
import type { GameState } from '../types';
import { AUTO_ROLL_SECONDS, emptyDiceCounts, emptyStats } from './core';

/**
 * Stored rooms are upgraded by running each numbered step once, in order.
 * To change the stored shape: append a step here (never edit an old one).
 * SCHEMA_VERSION follows automatically. Step N upgrades version N to N+1.
 */
// biome-ignore lint/suspicious/noExplicitAny: migrations read shapes older than GameState.
type Migration = (state: any, ctx: { now: number; random: () => number }) => void;

const MIGRATIONS: Migration[] = [
  // 0 → 1: everything added before rooms were versioned.
  (s, { now, random }) => {
    s.tradeOffer ??= null;
    s.board.harbors ??= generateHarbors(s.board);
    s.spectators ??= [];
    s.chat ??= [];
    for (const p of s.players) {
      p.development ??= [];
      p.knights ??= 0;
    }
    s.developmentDeck ??= developmentDeck(random);
    s.developmentPlayed ??= false;
    s.freeRoads ??= 0;
    s.resumePhase ??= null;
    s.longestRoadId ??= null;
    s.largestArmyId ??= null;
    s.turnExpired ??= false;
    s.pausedAt ??= null;
    s.proposal ??= null;
    s.undo ??= null;
    s.undoHistory ??= [];
    if (s.proposal) s.proposal.rejected ??= [];
    s.turnDeadline ??= ['lobby', 'finished'].includes(s.phase)
      ? null
      : now + (s.settings?.turnSeconds ?? DEFAULT_SETTINGS.turnSeconds) * 1000;
    s.testMode = s.testMode === true;
    // Colors were indexes into a four-color palette.
    const legacyColors = ['orange', 'blue', 'white', 'purple'] as const;
    s.players.forEach((p: { color: unknown }, index: number) => {
      const wanted = isPlayerColor(p.color) ? p.color : typeof p.color === 'number' ? legacyColors[p.color] : undefined;
      const taken = s.players.slice(0, index).map((other: { color: string }) => other.color);
      p.color = wanted && !taken.includes(wanted) ? wanted : firstFreeColor(taken);
    });
    // Trade offers went to everyone and had no counter-offers.
    if (s.tradeOffer) {
      s.tradeOffer.createdAt ??= now;
      s.tradeOffer.expiresAt ??= now + 30_000;
      s.tradeOffer.to ??= s.players.map((p: { id: string }) => p.id).filter((id: string) => id !== s.tradeOffer.fromId);
      s.tradeOffer.counters ??= [];
    }
    s.stats ??= Object.fromEntries(s.players.map((p: { id: string }) => [p.id, emptyStats()]));
    s.pauseReason ??= s.pausedAt === null ? null : 'vote';
    s.updatedAt ??= now;
    s.finishedAt ??= s.phase === 'finished' ? now : null;
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Upgrade a stored room, then repair any invalid values. Never mutates its input. */
export function normalizeGame(state: GameState, now = Date.now(), random: () => number = Math.random): GameState {
  const next = structuredClone(state);
  for (let version = next.schemaVersion ?? 0; version < SCHEMA_VERSION; version++)
    MIGRATIONS[version]!(next, { now, random });
  next.schemaVersion = SCHEMA_VERSION;
  repair(next, now);
  return next;
}

/** Checks that run on every load: settings within range, dice counts, and the roll clock. */
function repair(next: GameState, now: number): void {
  next.settings = {
    ...DEFAULT_SETTINGS,
    ...next.settings,
    autoRollSeconds: AUTO_ROLL_SECONDS.includes(next.settings?.autoRollSeconds)
      ? next.settings.autoRollSeconds
      : DEFAULT_SETTINGS.autoRollSeconds,
    trackDice: typeof next.settings?.trackDice === 'boolean' ? next.settings.trackDice : DEFAULT_SETTINGS.trackDice,
  };
  next.diceCounts = Object.fromEntries(
    Object.keys(emptyDiceCounts()).map(total => {
      const count = next.diceCounts?.[Number(total)];
      return [total, Number.isSafeInteger(count) && count! >= 0 ? count : 0];
    }),
  );
  updateAwards(next);
  if (next.phase !== 'roll' || !next.settings.autoRollSeconds) next.rollDeadline = null;
  else if (!Number.isFinite(next.rollDeadline) || next.rollDeadline === undefined)
    next.rollDeadline = now + next.settings.autoRollSeconds * 1000;
}
