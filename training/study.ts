import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getView, normalizeGame } from '../shared/engine';
import type { GameRecord, ReplayEvent } from '../shared/replay';
import { boardIndex } from '../shared/seafaring';
import type { GameEvent, GameState } from '../shared/types';

/**
 * Recorded games with people, summarized seat by seat (cli `replays --dump`, then `records-study`).
 * A replay needs the engine the game was played on, so dumping is separate: an old record can be
 * dumped from a worktree at its commit and studied here.
 */

/** What a dump keeps of one replayed game: the record's seats, the final state, and every logged event. */
export interface GameDump {
  seats: GameRecord['seats'];
  winnerSeat: number | null;
  endedAt: number;
  final: GameState;
  events: { turn: number; event: GameEvent }[];
}

/** Collects logged events step by step during a replay (the log itself keeps only its last 60). */
export function eventCollector() {
  const events: GameDump['events'] = [];
  let seen = -1;
  return {
    events,
    onStep({ after }: ReplayEvent) {
      for (const entry of after.log)
        if (entry.id > seen && entry.event) events.push({ turn: after.turn, event: entry.event });
      seen = after.log.at(-1)?.id ?? seen;
    },
  };
}

/** Save one dump as `dir/<i>.json`. */
export function writeDump(dir: string, i: number, dump: GameDump): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${i}.json`), JSON.stringify(dump));
}

type Row = Record<string, string | number>;

/** One row per seat: who (person or bot), result, points, and how they played Cartographers. */
export function seatRows(dump: GameDump, game: number): Row[] {
  const final = normalizeGame(dump.final, dump.endedAt, () => 0.5);
  const index = boardIndex(final.board);
  const name = final.design?.name ?? 'standard';
  return final.players.map((p, order) => {
    const seat = Number(p.id.slice(1));
    const mine = dump.events.filter(e => 'playerId' in e.event && e.event.playerId === p.id);
    const built = (piece: string) =>
      mine.filter(e => e.event.kind === 'build' && 'piece' in e.event && e.event.piece === piece);
    const firstSurvey = built('survey')[0]?.turn;
    // Lodestone pips touching its buildings at the end.
    const towns = Object.entries(final.buildings)
      .filter(([, b]) => b.playerId === p.id)
      .map(([v]) => v);
    const lodePips = towns.reduce(
      (n, v) =>
        n +
        index.vertex
          .get(v)!
          .hexIds.map(h => index.hex.get(h)!)
          .filter(h => h.terrain === 'lodestone')
          .reduce((m, h) => m + (h.number ? 6 - Math.abs(7 - h.number) : 0), 0),
      0,
    );
    const stats = final.stats[p.id];
    return {
      game,
      map: `${name} ${final.players.length}p`,
      seat,
      order,
      who: dump.seats[seat] ?? 'PERSON',
      won: dump.winnerSeat === seat ? 1 : 0,
      points: getView(final, p.id).players.find(q => q.id === p.id)!.points,
      surveys: built('survey').length,
      firstSurvey: firstSurvey ?? '-',
      relays: built('relay').length,
      charts: mine.filter(e => e.event.kind === 'chart').length,
      splits: mine.filter(e => e.event.kind === 'split').length,
      lodestone: stats?.produced.lodestone ?? 0,
      lodePipsAtEnd: lodePips,
      settlements: stats?.built.settlement ?? 0,
      cities: stats?.built.city ?? 0,
      ships: stats?.built.ship ?? 0,
      cards: stats?.built.development ?? 0,
      trades: stats?.trades ?? 0,
      road: final.longestRoadId === p.id ? 'LR' : '',
      army: final.largestArmyId === p.id ? 'LA' : '',
      turns: final.turn,
    };
  });
}

/** Every seat of every dump in `dir`, as rows. */
export function studyDumps(dir: string): Row[] {
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  return files.flatMap(f =>
    seatRows(JSON.parse(readFileSync(join(dir, f), 'utf8')) as GameDump, Number.parseInt(f, 10)),
  );
}
