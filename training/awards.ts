import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameDump, TurnRow } from './study';

/**
 * Longest Road and Largest Army in saved games with people (PLAN.md, the awards item): per game,
 * when each award changed hands, how long each seat held it, and how far the other seats were
 * from taking it while it was held. Reads dumps with per-turn rows (`replays --dump`, or
 * dump-records.ts on an older engine).
 */

/** Per seat: turns holding each award, times taken, and the end (road length, knights, points). */
interface SeatAwards {
  who: string;
  won: boolean;
  roadTurns: number;
  armyTurns: number;
  roadTaken: number;
  armyTaken: number;
  /** Turns this seat was behind the holder's road by 1–2 (one or two roads from tying or taking it). */
  roadClose: number;
  /** Turns this seat was one knight from taking the army. */
  armyClose: number;
  road: number;
  knights: number;
  points: number;
}

/** The award story of one dump, with a line per change of holder. */
export function gameAwards(dump: GameDump): { seats: SeatAwards[]; changes: string[] } {
  const rows = dump.turns ?? [];
  const order = dump.final.players.map(p => p.id);
  const label = (id: string) => `${dump.seats[Number(id.slice(1))] ?? 'PERSON'}(${id})`;
  const seats: SeatAwards[] = order.map((id, k) => ({
    who: label(id),
    won: dump.winnerSeat === Number(id.slice(1)),
    roadTurns: 0,
    armyTurns: 0,
    roadTaken: 0,
    armyTaken: 0,
    roadClose: 0,
    armyClose: 0,
    road: rows.at(-1)?.road[k] ?? 0,
    knights: rows.at(-1)?.knights[k] ?? 0,
    points: rows.at(-1)?.points[k] ?? 0,
  }));
  const changes: string[] = [];
  let last: TurnRow | null = null;
  for (const row of rows) {
    const holder = (id: string | null) => (id ? order.indexOf(id) : -1);
    const road = holder(row.roadId);
    const army = holder(row.armyId);
    if (road >= 0) seats[road]!.roadTurns++;
    if (army >= 0) seats[army]!.armyTurns++;
    row.road.forEach((length, k) => {
      const gap = road >= 0 ? row.road[road]! - length : 5 - length;
      if (k !== road && gap >= 0 && gap <= 2 && length >= 3) seats[k]!.roadClose++;
    });
    row.knights.forEach((n, k) => {
      const need = army >= 0 ? row.knights[army]! + 1 : 3;
      if (k !== army && need - n === 1) seats[k]!.armyClose++;
    });
    if (last && row.roadId !== last.roadId) {
      if (road >= 0) seats[road]!.roadTaken++;
      changes.push(
        `turn ${row.turn}: road → ${row.roadId ? label(row.roadId) : 'nobody'} (lengths ${row.road.join('/')}, points ${row.points.join('/')})`,
      );
    }
    if (last && row.armyId !== last.armyId) {
      if (army >= 0) seats[army]!.armyTaken++;
      changes.push(
        `turn ${row.turn}: army → ${row.armyId ? label(row.armyId) : 'nobody'} (knights ${row.knights.join('/')}, points ${row.points.join('/')})`,
      );
    }
    last = row;
  }
  return { seats, changes };
}

/** Print every dump in `dir` that has per-turn rows (optionally only some games). */
export function reportAwards(dir: string, only?: number[]): void {
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => Number.parseInt(f, 10))
    .filter(i => !only || only.includes(i))
    .sort((a, b) => a - b);
  for (const i of files) {
    const dump = JSON.parse(readFileSync(join(dir, `${i}.json`), 'utf8')) as GameDump;
    if (!dump.turns?.length) continue;
    const { seats, changes } = gameAwards(dump);
    const map = dump.final.design?.name ?? 'standard';
    console.log(
      `\ngame ${i}: ${map}, ${seats.length} players, ${dump.final.settings.victoryPoints} points, ${dump.turns.length} turns`,
    );
    console.log('  seat              won  road(turns taken close)  army(turns taken close)  length knights points');
    for (const s of seats)
      console.log(
        `  ${s.who.padEnd(18)}${(s.won ? 'yes' : '').padEnd(5)}${`${s.roadTurns} ${s.roadTaken} ${s.roadClose}`.padEnd(25)}${`${s.armyTurns} ${s.armyTaken} ${s.armyClose}`.padEnd(25)}${String(s.road).padEnd(7)}${String(s.knights).padEnd(8)}${s.points}`,
      );
    for (const c of changes) console.log(`  ${c}`);
  }
}
