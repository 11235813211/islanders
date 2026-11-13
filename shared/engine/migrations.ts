import { generateHarbors } from '../board';
import { firstFreeColor, isPlayerColor } from '../colors';
import { liftRichIslands } from '../maps/edit';
import { playerRanges } from '../maps/types';
import { developmentDeck, updateAwards } from '../rules';
import { AUTO_ROLL_SECONDS, DEFAULT_SETTINGS } from '../settings';
import type { GameSettings, GameState } from '../types';
import { emptyDiceCounts, emptyStats } from './core';
import { startHandGuess } from './hands';

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
  // 1 → 2: sea maps (ships, pirate, gold, discoveries, island bonuses, chosen map).
  s => {
    s.ships ??= {};
    s.pirate ??= null;
    s.stealHex ??= null;
    s.pendingGold ??= {};
    s.shipsBuilt ??= [];
    s.shipMoved ??= false;
    s.islands ??= {};
    s.bonusPoints ??= {};
    s.design ??= null;
    s.map ??= null;
    for (const p of s.players) p.discoveries ??= 0;
  },
  // 2 → 3: five and six players (special build phase).
  s => {
    s.specialBuilder ??= null;
  },
  // 3 → 4: trade offers record who said yes; the offering player picks a partner.
  s => {
    if (s.tradeOffer) s.tradeOffer.acceptedBy ??= [];
  },
  // 4 → 5: Seafarers as a room setting, timed gold choices, and the eruption phase.
  s => {
    s.settings = { ...s.settings, seafarers: !!s.design?.tiles.some((t: { kind: string }) => t.kind === 'sea') };
    s.goldDeadline ??= null;
    s.robberDeadline ??= null;
    s.eruption ??= null;
    s.volcanoDecks ??= {};
    s.fog ??= {};
    s.specialQueue ??= [];
    s.specialAsked ??= [];
  },
  // 5 → 6: fields added to the step above after it shipped (rooms already at 5 missed them).
  s => {
    s.robberDeadline ??= null;
    s.specialQueue ??= [];
    s.specialAsked ??= [];
  },
  // 6 → 7: a chosen map lists each layout's player counts, and which layout the host picked.
  s => {
    if (s.map && !s.map.layouts)
      s.map = {
        id: s.map.id,
        name: s.map.name,
        layouts: s.design ? playerRanges(s.design) : [s.map.players],
        layout: null,
      };
  },
  // 7 → 8: "show bank cards" became auto / always / never (auto, the old default, hides them with two players).
  s => {
    const old = s.settings?.showBank as unknown;
    if (typeof old === 'boolean') s.settings.showBank = old ? 'always' : 'auto';
  },
  // 8 → 9: the public card count for bots. Earlier moves are unknown, so it starts from card counts.
  s => {
    s.handGuess ??= startHandGuess(s);
  },
  // 9 → 10: detailed end-of-game stats. Old totals carry over where they map onto the new ones.
  s => {
    for (const [id, old] of Object.entries(s.stats ?? {}) as [string, Record<string, number>][]) {
      if ('cardsIn' in old) continue;
      const stats = emptyStats();
      stats.cardsIn = { roll: old.gained ?? 0, steal: old.stolen ?? 0 };
      stats.cardsOut = { steal: old.lost ?? 0, discard: old.discarded ?? 0 };
      stats.trades = old.trades ?? 0;
      s.stats[id] = stats;
    }
  },
  // 10 → 11: lobby color swap requests.
  s => {
    s.colorSwaps ??= [];
  },
  // 11 → 12: balanced dice deck. Existing rooms keep their dice as they were.
  s => {
    s.diceDeck ??= [];
    s.lastRollTotal ??= null;
    s.settings.diceMode ??= 'random';
  },
  // 12 → 13: number richness moved from one setting for closed islands onto each island.
  s => {
    if (s.design) s.design = liftRichIslands(s.design);
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
  // Settings that no longer exist are dropped, so a later change still validates.
  const known = Object.fromEntries(
    Object.entries(next.settings ?? {}).filter(([key]) => Object.hasOwn(DEFAULT_SETTINGS, key)),
  ) as Partial<GameSettings>;
  next.settings = {
    ...DEFAULT_SETTINGS,
    ...known,
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
