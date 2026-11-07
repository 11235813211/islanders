import { describe, expect, it } from 'vitest';
import {
  advanceTime,
  applyAction,
  BOT_THINK_MS,
  botDueAt,
  GameError,
  getActivePlayerId,
  getView,
  idlePause,
  idleResume,
  pendingBotActor,
  UNDO_GRACE_MS,
} from '../shared/engine';
import { emptyBag } from '../shared/engine/core';
import { EMPTY_ROOM_MS, emptyRoomMs, isBotGame, SAVED_BOT_GAME_HOURS } from '../shared/settings';
import { conserved, grant, makeLobby, TEST_NOW as now, seeded, settled } from './fixtures';

const act = (g: ReturnType<typeof makeLobby>, id: string, action: Parameters<typeof applyAction>[2]) =>
  applyAction(g, id, action, seeded(), now);

describe('room membership', () => {
  it('removes a player who leaves the lobby and hands hosting to the next person', () => {
    let g = makeLobby(3);
    g = act(g, 'p0', { type: 'leave' });
    expect(g.players.map(p => p.id)).toEqual(['p1', 'p2']);
    expect(g.hostId).toBe('p1');
  });

  it('gives a bot the seat of someone who leaves mid-game, and ends the game if no people remain', () => {
    let g = settled(2);
    g = act(g, 'p1', { type: 'leave' });
    expect(g.players[1]!.bot).toBe('advanced');
    expect(g.phase).not.toBe('finished');
    g = act(g, 'p0', { type: 'leave' });
    expect(g.phase).toBe('finished');
    expect(g.winnerId).toBeNull();
  });

  it('lets only the host remove seats, add bots, change their level, and hand over hosting', () => {
    let g = makeLobby(2);
    expect(() => act(g, 'p1', { type: 'add-bot', level: 'beginner' })).toThrow(/host/);
    g = act(g, 'p0', { type: 'add-bot', level: 'beginner' });
    const bot = g.players[2]!;
    expect(bot.bot).toBe('beginner');
    expect(bot.color).not.toBe(g.players[0]!.color);
    g = act(g, 'p0', { type: 'set-bot-level', playerId: bot.id, level: 'intermediate' });
    expect(g.players[2]!.bot).toBe('intermediate');
    expect(() => act(g, 'p0', { type: 'transfer-host', playerId: bot.id })).toThrow(/another person/);
    g = act(g, 'p0', { type: 'remove-player', playerId: bot.id });
    expect(g.players).toHaveLength(2);
    g = act(g, 'p0', { type: 'transfer-host', playerId: 'p1' });
    expect(g.hostId).toBe('p1');
    expect(() => act(g, 'p0', { type: 'remove-player', playerId: 'p1' })).toThrow(/host/);
  });

  it('starts a fresh game with the same seats after the game ends', () => {
    const g = settled(3);
    g.phase = 'finished';
    g.winnerId = 'p0';
    g.chat.push({ id: 'c1', senderId: 'p1', name: 'Player 1', text: 'gg', at: now, spectator: false });
    expect(() => act(g, 'p1', { type: 'play-again' })).toThrow(/host/);
    const next = act(g, 'p0', { type: 'play-again' });
    expect(next.phase).toBe('lobby');
    expect(next.players.map(p => [p.id, p.color])).toEqual(g.players.map(p => [p.id, p.color]));
    expect(Object.keys(next.buildings)).toHaveLength(0);
    expect(next.players.every(p => Object.values(p.resources).every(n => n === 0))).toBe(true);
    expect(next.chat).toEqual(g.chat);
    expect(next.version).toBeGreaterThan(g.version);
  });
});

describe('idle pause', () => {
  it('freezes clocks while nobody is connected and shifts them on return', () => {
    const g = settled();
    const paused = idlePause(g, now);
    expect(paused.pauseReason).toBe('idle');
    expect(advanceTime(paused, now + 10 * 60_000)).toBe(paused);
    const resumed = idleResume(paused, now + 60_000);
    expect(resumed.pausedAt).toBeNull();
    expect(resumed.turnDeadline).toBe(g.turnDeadline! + 60_000);
    // A paused-by-vote game stays paused when someone reconnects.
    const voted = { ...g, pausedAt: now, pauseReason: 'vote' as const };
    expect(idleResume(voted, now + 1000)).toBe(voted);
  });
});

describe('bot scheduling', () => {
  it('waits a short thinking delay before a bot acts, and never while paused', () => {
    let g = makeLobby(2);
    g.players[1]!.bot = 'beginner';
    g = act(g, 'p0', { type: 'start' });
    g = act(g, 'p0', { type: 'place-settlement', vertexId: getView(g, 'p0').legal.settlements[0]! });
    g = act(g, 'p0', { type: 'place-road', edgeId: getView(g, 'p0').legal.roads[0]! });
    expect(pendingBotActor(g)).toBe(g.players[1]!.id);
    const due = botDueAt(g)!;
    expect(advanceTime(g, due - 1, seeded())).toBe(g);
    const moved = advanceTime(g, due, seeded());
    expect(Object.keys(moved.buildings)).toHaveLength(2);
    expect(pendingBotActor(idlePause(g, now))).toBeNull();
  });

  it('gives a person a moment to undo ending their turn before the next bot starts', () => {
    let g = settled(2);
    g.phase = 'build';
    g.players[1]!.bot = 'beginner';
    g = act(g, 'p0', { type: 'end-turn' });
    expect(getView(g, 'p0').undoAvailable).toMatchObject({ actorId: 'p0', endsTurn: true });
    expect(botDueAt(g)).toBe(g.updatedAt + BOT_THINK_MS + UNDO_GRACE_MS);
    expect(advanceTime(g, g.updatedAt + BOT_THINK_MS, seeded())).toBe(g);
    g = applyAction(g, 'p0', { type: 'propose', kind: 'undo' }, seeded(), now);
    expect(getActivePlayerId(g)).toBe('p0');
    expect(g.phase).toBe('build');
    expect(botDueAt(g)).toBeNull();
  });

  it('undoes at once in a solo test room, where one person holds every seat', () => {
    let g = settled(3);
    g.testMode = true;
    g.phase = 'build';
    grant(g, 'p0', { wood: 1, brick: 1 });
    g = act(g, 'p0', { type: 'build-road', edgeId: getView(g, 'p0').legal.roads[0]! });
    const roads = Object.keys(g.roads).length;
    g = applyAction(g, 'p0', { type: 'propose', kind: 'undo' }, seeded(), now);
    expect(g.proposal).toBeNull();
    expect(Object.keys(g.roads)).toHaveLength(roads - 1);
  });

  it('has a bot answer an offer sent to it, and leaves people alone', () => {
    const g = settled(3);
    g.phase = 'build';
    g.players[1]!.bot = 'beginner';
    grant(g, 'p0', { wood: 2 });
    let offered = act(g, 'p0', {
      type: 'offer-trade',
      give: { ...emptyBag(), wood: 1 },
      want: { ...emptyBag(), ore: 1 },
    });
    expect(pendingBotActor(offered)).toBe('p1');
    offered = advanceTime(offered, botDueAt(offered)!, seeded());
    const answered = !offered.tradeOffer || offered.tradeOffer.declinedBy.includes('p1');
    expect(answered).toBe(true);
    expect(pendingBotActor(offered)).toBeNull();
  });
});

describe('how long empty rooms stay open', () => {
  it('keeps a game against bots for a day, and everything else for five minutes', () => {
    const solo = settled(3);
    solo.players[1]!.bot = 'beginner';
    solo.players[2]!.bot = 'beginner';
    expect(isBotGame(solo)).toBe(true);
    expect(emptyRoomMs(solo)).toBe(SAVED_BOT_GAME_HOURS * 60 * 60 * 1000);
    // Two people, a lobby, a finished game, or a solo test room are not saved games.
    expect(isBotGame(settled(3))).toBe(false);
    expect(isBotGame({ ...solo, phase: 'lobby' })).toBe(false);
    expect(isBotGame({ ...solo, phase: 'finished' })).toBe(false);
    expect(isBotGame({ ...solo, testMode: true })).toBe(false);
    expect(emptyRoomMs(settled(3))).toBe(EMPTY_ROOM_MS);
  });
});

describe('trades and counter-offers', () => {
  it('sends an offer only to chosen players and lets a recipient counter', () => {
    let g = settled(3);
    g.phase = 'build';
    grant(g, 'p0', { wood: 2 });
    grant(g, 'p1', { ore: 2 });
    const give = { ...emptyBag(), wood: 1 };
    const want = { ...emptyBag(), ore: 1 };
    g = act(g, 'p0', { type: 'offer-trade', give, want, to: ['p1'] });
    expect(() => act(g, 'p2', { type: 'accept-trade', offerId: g.tradeOffer!.id })).toThrow(/not sent to you/);
    expect(() => act(g, 'p0', { type: 'offer-trade', give, want, to: ['p0'] })).toThrow(/who receives/);
    g = act(g, 'p1', {
      type: 'counter-trade',
      offerId: g.tradeOffer!.id,
      give: want,
      want: { ...emptyBag(), wood: 2 },
    });
    const counter = g.tradeOffer!.counters[0]!;
    expect(() => act(g, 'p1', { type: 'accept-counter', offerId: g.tradeOffer!.id, counterId: counter.id })).toThrow(
      /your turn/,
    );
    const before = structuredClone(g.players);
    g = act(g, 'p0', { type: 'accept-counter', offerId: g.tradeOffer!.id, counterId: counter.id });
    expect(g.tradeOffer).toBeNull();
    expect(g.players[0]!.resources.wood).toBe(before[0]!.resources.wood - 2);
    expect(g.players[1]!.resources.ore).toBe(before[1]!.resources.ore - 1);
    expect(g.stats.p0!.trades).toBe(1);
    expect(g.log.at(-1)!.event).toMatchObject({ kind: 'player-trade', fromId: 'p0', toId: 'p1' });
    expect(conserved(g)).toBe(true);
  });

  it('rejects malformed counter-offers', () => {
    let g = settled(2);
    g.phase = 'build';
    grant(g, 'p0', { wood: 1 });
    g = act(g, 'p0', { type: 'offer-trade', give: { ...emptyBag(), wood: 1 }, want: { ...emptyBag(), ore: 1 } });
    expect(() =>
      act(g, 'p1', { type: 'counter-trade', offerId: g.tradeOffer!.id, give: emptyBag(), want: emptyBag() }),
    ).toThrow(GameError);
  });
});

describe('events and stats', () => {
  it('records rolls and steals as data, and shows the stolen card only to the two players involved', () => {
    let g = settled(3);
    g = applyAction(g, 'p0', { type: 'roll' }, () => 0.5, now);
    expect(g.log.find(e => e.event?.kind === 'roll')?.event).toMatchObject({ kind: 'roll', playerId: 'p0' });
    const s = settled(3);
    s.phase = 'robber';
    s.buildings = {};
    const hex = s.board.hexes.find(h => h.id !== s.robber)!;
    s.buildings[hex.vertexIds[0]!] = { playerId: 'p1', kind: 'settlement' };
    for (const r of ['wood', 'brick', 'sheep', 'wheat', 'ore'] as const) {
      s.bank[r] += s.players[1]!.resources[r];
      s.players[1]!.resources[r] = 0;
    }
    grant(s, 'p1', { ore: 1 });
    const stolen = applyAction(s, 'p0', { type: 'move-robber', hexId: hex.id }, seeded(), now);
    const event = (id: string) => getView(stolen, id).log.find(e => e.event?.kind === 'steal')!.event;
    expect(event('p0')).toMatchObject({ resource: 'ore' });
    expect(event('p1')).toMatchObject({ resource: 'ore' });
    expect(event('p2')).toMatchObject({ resource: null });
    expect(stolen.stats.p0!.stolen).toBe(1);
    expect(stolen.stats.p1!.lost).toBe(1);
    expect(getView(stolen, 'p2').players[0]!.stats.stolen).toBe(1);
  });
});
