import { describe, expect, it } from 'vitest';
import {
  addSpectator,
  advanceTime,
  applyAction,
  awayHostSuccessor,
  BOT_THINK_MS,
  boardPlayerCount,
  botDueAt,
  GameError,
  getActivePlayerId,
  getView,
  idlePause,
  idleResume,
  normalizeGame,
  passHost,
  peekBoard,
  pendingBotActor,
  ROLL_SHOW_MS,
  UNDO_GRACE_MS,
} from '../shared/engine';
import { emptyBag } from '../shared/engine/core';
import { hasAnswered } from '../shared/rules';
import { EMPTY_ROOM_MS, emptyRoomMs, isBotGame, SAVED_BOT_GAME_HOURS } from '../shared/settings';
import type { GameState } from '../shared/types';
import { conserved, grant, inSeatOrder, makeLobby, TEST_NOW as now, seeded, settled } from './fixtures';

const act = (g: ReturnType<typeof makeLobby>, id: string, action: Parameters<typeof applyAction>[2]) =>
  applyAction(g, id, action, seeded(), now);

describe('room membership', () => {
  it('lets the host seat a spectator: an open lobby seat, or anyone’s seat mid-game', () => {
    const lobby = addSpectator(makeLobby(3), { id: 'w', name: 'Watcher' });
    expect(() => act(lobby, 'p1', { type: 'seat-spectator', spectatorId: 'w' })).toThrow(/host/);
    const seated = act(lobby, 'p0', { type: 'seat-spectator', spectatorId: 'w' });
    expect(seated.players.map(p => p.id)).toEqual(['p0', 'p1', 'p2', 'w']);
    expect(seated.spectators).toEqual([]);

    const game = addSpectator(settled(3), { id: 'w', name: 'Watcher' });
    grant(game, 'p1', { ore: 2 });
    expect(() => act(game, 'p0', { type: 'seat-spectator', spectatorId: 'w' })).toThrow(/seat to take over/);
    expect(() => act(game, 'p0', { type: 'seat-spectator', spectatorId: 'w', playerId: 'p0' })).toThrow(/yourself/);
    const took = act(game, 'p0', { type: 'seat-spectator', spectatorId: 'w', playerId: 'p1' });
    const seat = took.players[1]!;
    expect([seat.id, seat.name, seat.bot]).toEqual(['w', 'Watcher', undefined]);
    expect(seat.resources).toEqual(game.players[1]!.resources);
    expect(Object.values(took.buildings).filter(b => b.playerId === 'w')).toHaveLength(2);
    expect(took.spectators).toEqual([{ id: 'p1', name: 'Player 1' }]);
    expect(conserved(took)).toBe(true);
    // A bot's seat can be taken too; the bot just goes.
    const botGame = act(game, 'p0', { type: 'seat-to-bot', playerId: 'p2', watch: false });
    const botId = botGame.players[2]!.id;
    const fromBot = act(botGame, 'p0', { type: 'seat-spectator', spectatorId: 'w', playerId: botId });
    expect(fromBot.players[2]!.id).toBe('w');
    expect(fromBot.spectators).toEqual([]);
  });

  it('passes hosting to the first connected person while the host is away', () => {
    const g = settled(3);
    expect(awayHostSuccessor(g, ['p0', 'p1'])).toBeNull();
    expect(awayHostSuccessor(g, ['p2'])).toBe('p2');
    expect(awayHostSuccessor(g, [])).toBeNull();
    const passed = passHost(g, 'p2');
    expect(passed.hostId).toBe('p2');
    expect(passHost(passed, 'p2')).toBe(passed);
  });

  it('lets the host hand a seat to an Advanced bot, the person watching or leaving', () => {
    const g = settled(3);
    const pieces = Object.values(g.buildings).filter(b => b.playerId === 'p1').length;
    expect(() => act(g, 'p1', { type: 'seat-to-bot', playerId: 'p2', watch: true })).toThrow(GameError);
    expect(() => act(g, 'p0', { type: 'seat-to-bot', playerId: 'p0', watch: true })).toThrow(GameError);
    const watched = act(g, 'p0', { type: 'seat-to-bot', playerId: 'p1', watch: true });
    // The person keeps their id (an account's id is the same in every room); the seat gets a new one.
    expect(watched.spectators).toEqual([{ id: 'p1', name: g.players[1]!.name }]);
    const seat = watched.players[1]!;
    expect(seat).toMatchObject({ id: 'p1.bot', bot: 'advanced', name: g.players[1]!.name });
    expect(Object.values(watched.buildings).filter(b => b.playerId === 'p1.bot')).toHaveLength(pieces);
    expect(watched.stats['p1.bot']).toEqual(g.stats.p1);
    expect(getView(watched, 'p1').role).toBe('spectator');
    expect(() => act(watched, 'p0', { type: 'seat-to-bot', playerId: 'p1.bot', watch: true })).toThrow(GameError);
    const gone = act(g, 'p0', { type: 'seat-to-bot', playerId: 'p2', watch: false });
    expect(gone.spectators).toEqual([]);
    expect(gone.players[2]).toMatchObject({ id: 'p2.bot', bot: 'advanced' });
    expect(() => getView(gone, 'p2')).toThrow(GameError);
    expect(() => act(makeLobby(3), 'p0', { type: 'seat-to-bot', playerId: 'p1', watch: true })).toThrow(GameError);
  });

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
    const watching = act(g, 'p0', { type: 'remove-player', playerId: 'p1', watch: true });
    expect(watching.players.map(p => p.id)).toEqual(['p0']);
    expect(watching.spectators.map(s => s.id)).toEqual(['p1']);
    g = act(g, 'p0', { type: 'transfer-host', playerId: 'p1' });
    expect(g.hostId).toBe('p1');
    expect(() => act(g, 'p0', { type: 'remove-player', playerId: 'p1' })).toThrow(/host/);
  });

  it('lets players, the host too, propose and back up to 3 maps each, for the host to pick or turn down', () => {
    let g = makeLobby(3);
    g = act(g, 'p1', { type: 'propose-map', mapId: 'base' });
    g = act(g, 'p2', { type: 'propose-map', mapId: 'base' });
    expect(g.mapProposals).toEqual([{ mapId: 'base', name: 'Base game', layoutFor: null, by: ['p1', 'p2'] }]);
    expect(() => act(g, 'p1', { type: 'propose-map', mapId: 'nowhere' })).toThrow(/not available/);
    g = act(g, 'p1', { type: 'propose-map', mapId: 'base' });
    expect(g.mapProposals[0]!.by).toEqual(['p2']);
    expect(() => act(g, 'p1', { type: 'decline-map', mapId: 'base' })).toThrow(/host/);
    expect(act(g, 'p0', { type: 'decline-map', mapId: 'base' }).mapProposals).toEqual([]);
    expect(act(g, 'p0', { type: 'remove-player', playerId: 'p2' }).mapProposals).toEqual([]);
    // Several at once: the base game for each layout counts as a different proposal here.
    g = act(g, 'p0', { type: 'propose-map', mapId: 'base' });
    g = act(g, 'p0', { type: 'propose-map', mapId: 'base', layoutFor: 3 });
    g = act(g, 'p0', { type: 'propose-map', mapId: 'base', layoutFor: 4 });
    expect(g.mapProposals.filter(p => p.by.includes('p0'))).toHaveLength(3);
    expect(() => act(g, 'p0', { type: 'propose-map', mapId: 'base', layoutFor: 5 })).toThrow(/up to 3/);
    // Taking one back frees a place.
    g = act(g, 'p0', { type: 'propose-map', mapId: 'base', layoutFor: 4 });
    g = act(g, 'p0', { type: 'propose-map', mapId: 'base', layoutFor: 5 });
    expect(g.mapProposals.find(p => p.layoutFor === 5)!.by).toEqual(['p0']);
  });

  it('lets only the host set the player count for maps, in the lobby, without changing the seats', () => {
    let g = makeLobby(4);
    expect(boardPlayerCount(getView(g, 'p1'))).toBe(4);
    expect(() => act(g, 'p1', { type: 'set-board-players', players: 5 })).toThrow(/host/);
    expect(() => act(g, 'p0', { type: 'set-board-players', players: 1 })).toThrow(/2 to 6/);
    expect(() => act(g, 'p0', { type: 'set-board-players', players: 7 })).toThrow(/2 to 6/);
    g = act(g, 'p0', { type: 'set-board-players', players: 5 });
    expect(g.players).toHaveLength(4);
    expect(boardPlayerCount(getView(g, 'p1'))).toBe(5);
    g = act(g, 'p0', { type: 'set-board-players' });
    expect(g.boardPlayers).toBeNull();
    const { boardPlayers: _gone, ...older } = g;
    expect(normalizeGame({ ...older, schemaVersion: 24 } as GameState).boardPlayers).toBeNull();
    g = act(g, 'p0', { type: 'new-board' });
    expect(() => act(g, 'p0', { type: 'set-board-players', players: 5 })).toThrow();
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
    g = inSeatOrder(act(g, 'p0', { type: 'start' }));
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

  it('a bot waits for its roll to play out before its next move', () => {
    let g = settled(2);
    g.players[1]!.bot = 'beginner';
    Object.assign(g, { turnIndex: 1, phase: 'roll', rollDeadline: null });
    g = advanceTime(g, botDueAt(g)!, seeded());
    expect(g.log.at(-1)?.event?.kind).toMatch(/roll|iceberg|eruption/);
    // Not a seven on this seed: the bot builds or ends its turn next.
    expect(g.phase).toBe('build');
    expect(botDueAt(g)).toBe(g.updatedAt + BOT_THINK_MS + ROLL_SHOW_MS);
    expect(advanceTime(g, g.updatedAt + BOT_THINK_MS, seeded())).toBe(g);
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

  it('cannot undo buying a development card: the buyer has seen it', () => {
    let g = settled(3);
    g.testMode = true;
    g.phase = 'build';
    grant(g, 'p0', { sheep: 1, wheat: 1, ore: 1 });
    g = act(g, 'p0', { type: 'buy-development' });
    expect(g.undo).toBeNull();
    expect(() => applyAction(g, 'p0', { type: 'propose', kind: 'undo' }, seeded(7), now)).toThrow(GameError);
  });

  it('has a bot answer an offer sent to it, and leaves people alone', () => {
    const g = settled(3);
    g.phase = 'build';
    g.players[1]!.bot = 'beginner';
    grant(g, 'p0', { wood: 2 });
    grant(g, 'p1', { ore: 1 });
    let offered = act(g, 'p0', {
      type: 'offer-trade',
      give: { ...emptyBag(), wood: 1 },
      want: { ...emptyBag(), ore: 1 },
    });
    expect(pendingBotActor(offered)).toBe('p1');
    offered = advanceTime(offered, botDueAt(offered)!, seeded());
    const answered = !offered.tradeOffers[0] || hasAnswered(offered.tradeOffers[0], 'p1');
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
    expect(() => act(g, 'p2', { type: 'accept-trade', offerId: g.tradeOffers[0]!.id })).toThrow(/not sent to you/);
    expect(() => act(g, 'p0', { type: 'offer-trade', give, want, to: ['p0'] })).toThrow(/who receives/);
    g = act(g, 'p1', {
      type: 'counter-trade',
      offerId: g.tradeOffers[0]!.id,
      give: want,
      want: { ...emptyBag(), wood: 2 },
    });
    const counter = g.tradeOffers[0]!.counters[0]!;
    expect(() =>
      act(g, 'p1', { type: 'accept-counter', offerId: g.tradeOffers[0]!.id, counterId: counter.id }),
    ).toThrow(/offering player/);
    const before = structuredClone(g.players);
    g = act(g, 'p0', { type: 'accept-counter', offerId: g.tradeOffers[0]!.id, counterId: counter.id });
    expect(g.tradeOffers[0]).toBeUndefined();
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
      act(g, 'p1', { type: 'counter-trade', offerId: g.tradeOffers[0]!.id, give: emptyBag(), want: emptyBag() }),
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
    expect(stolen.stats.p0!.cardsIn.steal).toBe(1);
    expect(stolen.stats.p1!.cardsOut.steal).toBe(1);
    expect(stolen.stats.p0!.robberMoves).toBe(1);
    expect(getView(stolen, 'p2').players[0]!.stats.cardsIn.steal).toBe(1);
  });
});

describe('pick-board phase', () => {
  const draw = (g: ReturnType<typeof makeLobby>, seed: number) =>
    applyAction(g, 'p0', { type: 'new-board' }, seeded(seed), now);
  const layout = (g: ReturnType<typeof makeLobby>) => g.board.hexes.map(h => `${h.terrain}${h.number}`).join();

  it('fixes the seats, lets the host redraw and go back, then starts setup on the board shown', () => {
    let g = draw(makeLobby(3), 1);
    expect(g.phase).toBe('pick-board');
    expect(getView(g, 'p1').boardPick).toEqual({ shown: 1, count: 1 });
    expect(getActivePlayerId(g)).toBeNull();
    const first = layout(g);
    g = draw(g, 2);
    expect(layout(g)).not.toBe(first);
    expect(getView(g, 'p0').boardPick).toEqual({ shown: 2, count: 2 });
    g = act(g, 'p0', { type: 'show-board', board: 1 });
    expect(layout(g)).toBe(first);
    expect(() => act(g, 'p1', { type: 'new-board' })).toThrow(GameError);
    expect(() => act(g, 'p0', { type: 'show-board', board: 3 })).toThrow(GameError);
    expect(() => act(g, 'p0', { type: 'add-bot', level: 'beginner' })).toThrow(GameError);
    g = act(g, 'p0', { type: 'start' });
    expect(g.phase).toBe('setup-settlement');
    expect(layout(g)).toBe(first);
    expect(g.boardSeeds).toEqual([]);
    expect(getView(g, 'p0').boardPick).toBeNull();
  });

  it('lets anyone look at an earlier board without changing the one shown', () => {
    let g = draw(makeLobby(3), 1);
    const first = layout(g);
    g = draw(g, 2);
    const peeked = peekBoard(g, 1);
    expect(peeked.board.hexes.map(h => `${h.terrain}${h.number}`).join()).toBe(first);
    expect(layout(g)).not.toBe(first);
    expect(g.boardShown).toBe(1);
    expect(() => peekBoard(g, 3)).toThrow(GameError);
    expect(() => peekBoard(act(g, 'p0', { type: 'start' }), 1)).toThrow(GameError);
  });

  it('keeps at most 19 boards to go back to', () => {
    let g = draw(makeLobby(2), 1);
    for (let seed = 2; seed <= 25; seed++) g = draw(g, seed);
    expect(g.boardSeeds).toHaveLength(19);
    expect(g.boardShown).toBe(18);
  });
});
