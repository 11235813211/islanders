import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BoardDesign, BUILTIN_BOARDS, isAdminOnlyCategory, playerRanges, upgradeDesign } from '../shared/maps';
import type { GameSettings } from '../shared/types';
import { seeded } from './sim';

/**
 * What a training game is played on: a map (or the standard island), a table size, and room
 * settings. Scenarios are drawn from a seed, so a game is reproducible from its seed alone.
 *
 * Maps: the built-in boards plus a snapshot of the live board library (training/boards/
 * library.json; refresh with `node training/run.mjs boards`), which holds the "AI Training" boards.
 */

export interface Scenario {
  /** Short label for reports: map id and table size. */
  name: string;
  design: BoardDesign | null;
  players: number;
  settings: Partial<GameSettings>;
}

const here = dirname(fileURLToPath(import.meta.url));
/** The bundled script runs from .training-build/, the source from training/. */
const LIBRARY = [join(here, 'boards', 'library.json'), join(here, '..', 'training', 'boards', 'library.json')];

let cachedMaps: BoardDesign[] | null = null;
/** Ids of boards in the library's "AI Training" category (edge cases made for training). */
const trainers = new Set<string>();

/** Every designed map: built-ins, then library boards with ids not already built in. */
export function allMaps(): BoardDesign[] {
  if (cachedMaps) return cachedMaps;
  const path = LIBRARY.find(p => {
    try {
      readFileSync(p);
      return true;
    } catch {
      return false;
    }
  });
  const stored: { boards: BoardDesign[]; categories: { id: string; name: string }[] } = path
    ? JSON.parse(readFileSync(path, 'utf8'))
    : { boards: [], categories: [] };
  const library = stored.boards.map(upgradeDesign);
  const training = new Set(stored.categories.filter(isAdminOnlyCategory).map(c => c.id));
  for (const b of library) if (training.has(b.categoryId)) trainers.add(b.id);
  const ids = new Set(BUILTIN_BOARDS.map(b => b.id));
  cachedMaps = [...BUILTIN_BOARDS, ...library.filter(b => !ids.has(b.id))];
  return cachedMaps;
}

/**
 * Table sizes training skips although the board allows them. Trainers 3–5 (37 tiles) can run out
 * of spots at four players before anyone reaches 13: every corner taken, the deck empty (seed
 * 300868). Lower the limit in the board editor too.
 */
const TOO_SMALL: Record<string, number> = { 'new-base-board-3': 3, 'new-base-board-4': 3, 'new-base-board-5': 3 };

interface Table {
  id: string;
  design: BoardDesign | null;
  players: number[];
  trainer: boolean;
}

/** Map id → its table sizes. The standard island is "base" (2–6). */
export function mapTables(): Table[] {
  const tables: Table[] = [{ id: 'base', design: null, players: [2, 3, 4, 5, 6], trainer: false }];
  for (const design of allMaps()) {
    const counts = new Set<number>();
    for (const range of playerRanges(design)) for (let n = range.min; n <= range.max; n++) counts.add(n);
    const players = [...counts].filter(n => n <= (TOO_SMALL[design.id] ?? 6)).sort();
    tables.push({ id: design.id, design, players, trainer: trainers.has(design.id) });
  }
  return tables;
}

const pick = <T>(random: () => number, items: readonly T[]): T => items[Math.floor(random() * items.length)]!;

/** Room settings to vary, drawn so that the defaults stay the most common case. */
export function drawSettings(random: () => number, design: BoardDesign | null): Partial<GameSettings> {
  const settings: Partial<GameSettings> = {
    friendlyRobber: random() < 0.3,
    routeLinks: random() < 0.75 ? 'anywhere' : 'settlement',
    volcanoGold: random() < 0.6,
    volcanoDice: random() < 0.5 ? 'random' : 'balanced',
    volcanoStart: random() < 0.8,
    discoveries: pick(random, ['kept', 'kept', 'tradable', 'card'] as const),
    discardLimit: random() < 0.85 ? 7 : 9,
    numberLayout: random() < 0.5 ? 'ordered' : 'random',
  };
  if (!design) settings.seafarers = random() < 0.25;
  // Occasionally a shorter race than the map's own target. (Longer ones can be unwinnable on
  // small maps: every spot taken and the deck empty, as on Trainer 2 at four players and 15.)
  const r = random();
  if (r < 0.1) settings.victoryPoints = (design?.victoryPoints ?? 10) - 2;
  return settings;
}

export interface ScenarioFilter {
  /** Only these map ids ("base" is the standard island). */
  maps?: string[];
  /** Only these table sizes. */
  players?: number[];
  /** Share of games on the standard island (default 0.3). */
  baseShare?: number;
  /** Share of games on "AI Training" boards (default 0.25); other designed maps get the rest. */
  trainerShare?: number;
}

/** The scenario for one game seed. */
export function drawScenario(seed: number, filter: ScenarioFilter = {}): Scenario {
  const random = seeded(seed * 7919 + 17);
  let tables = mapTables().filter(t => !filter.maps || filter.maps.includes(t.id));
  if (filter.players)
    tables = tables
      .map(t => ({ ...t, players: t.players.filter(n => filter.players!.includes(n)) }))
      .filter(t => t.players.length);
  if (!tables.length) throw new Error('No map fits the scenario filter.');
  const groups = [
    { tables: tables.filter(t => t.id === 'base'), share: filter.baseShare ?? 0.3 },
    { tables: tables.filter(t => t.trainer), share: filter.trainerShare ?? 0.25 },
    { tables: tables.filter(t => t.id !== 'base' && !t.trainer), share: 0 },
  ].filter(g => g.tables.length);
  // The last group present takes whatever share is left.
  const roll = random();
  let group = groups.at(-1)!;
  let edge = 0;
  for (const g of groups.slice(0, -1)) {
    edge += g.share;
    if (roll < edge) {
      group = g;
      break;
    }
  }
  const table = pick(random, group.tables);
  const players = pick(random, table.players);
  return {
    name: `${table.id}/${players}`,
    design: table.design,
    players,
    settings: drawSettings(random, table.design),
  };
}
