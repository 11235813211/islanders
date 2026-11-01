// Rules reference: https://www.catan.com/sites/default/files/2021-06/catan_base_rules_2020_200707.pdf
// Edge-case reference: https://www.catan.com/faq/basegame
import { describe, expect, it } from 'vitest';
import { assignNumbers, generateBoard, ORDERED_NUMBERS, spiralHexes } from '../shared/board';
import { addSpectator, advanceTime, applyAction, emptyBag, getView, normalizeGame } from '../shared/engine';
import { developmentDeck, longestRoad, tradeRates, updateAwards, victoryPoints } from '../shared/rules';
import { RESOURCES, type DevelopmentType, type GameState } from '../shared/types';
import { conserved, grant, makeLobby, seeded, settled, TEST_NOW as now } from './fixtures';
const act = (g: GameState, id: string, action: Parameters<typeof applyAction>[2], at = now) => applyAction(g, id, action, seeded(), at);
function card(g: GameState, kind: DevelopmentType, id = 'test-card') { g.players[0].development.push({ id, kind, boughtTurn: 0 }); return id; }
function voteAll(game: GameState, kind: 'undo' | 'pause' | 'resume', at = now) {
  let g = act(game, 'p0', { type: 'propose', kind }, at);
  for (const id of ['p1', 'p2']) g = act(g, id, { type: 'vote', proposalId: g.proposal!.id, accept: true }, at);
  return g;
}
describe('base board and ports', () => {
  it('has nine distinct coastal harbors, four general and one of each specialized type', () => {
    for (let seed = 0; seed < 30; seed++) {
      const board = generateBoard(seeded(seed));
      expect(board.harbors).toHaveLength(9);
      expect(new Set(board.harbors.flatMap(p => p.vertices)).size).toBe(18);
      expect(board.harbors.filter(p => p.resource === 'any')).toHaveLength(4);
      for (const r of RESOURCES) expect(board.harbors.filter(p => p.resource === r)).toHaveLength(1);
      for (const p of board.harbors) {
        const [a, b] = p.vertices.map(id => board.vertices.find(v => v.id === id)!);
        expect(a.hexIds.filter(id => b.hexIds.includes(id))).toHaveLength(1);
      }
    }
  });
  it('places the classic number order counterclockwise, skips every possible desert position, and separates red numbers', () => {
    const board = generateBoard(seeded());
    const producing = board.hexes.find(h => h.terrain !== 'desert')!;
    for (const desert of board.hexes) {
      for (const h of board.hexes) if (h.terrain === 'desert') h.terrain = producing.terrain === 'desert' ? 'wood' : producing.terrain;
      desert.terrain = 'desert'; assignNumbers(board, 'ordered');
      expect(spiralHexes(board).filter(h => h.terrain !== 'desert').map(h => h.number)).toEqual(ORDERED_NUMBERS);
      expect(desert.number).toBeNull();
      const red = board.hexes.filter(h => h.number === 6 || h.number === 8);
      for (const a of red) for (const b of red.filter(h => h !== a)) expect(Math.max(Math.abs(a.q-b.q), Math.abs(a.r-b.r), Math.abs(a.q+a.r-b.q-b.r))).toBeGreaterThan(1);
    }
  });
  it('uses only owned harbors and takes the best available maritime rate', () => {
    const g = settled(); g.phase = 'build'; g.buildings = {};
    expect(tradeRates(g, 'p0').wood).toBe(4);
    const generic = g.board.harbors.find(p => p.resource === 'any')!, wood = g.board.harbors.find(p => p.resource === 'wood')!;
    g.buildings[generic.vertices[0]] = { playerId: 'p0', kind: 'settlement' };
    g.buildings[wood.vertices[1]] = { playerId: 'p1', kind: 'city' };
    expect(tradeRates(g, 'p0').wood).toBe(3);
    g.buildings[wood.vertices[1]].playerId = 'p0'; expect(tradeRates(g, 'p0').wood).toBe(2);
    grant(g, 'p0', { wood: 2 });
    const before = g.players[0].resources.wood;
    const next = act(g, 'p0', { type: 'trade', give: 'wood', receive: 'ore' });
    expect(next.players[0].resources.wood).toBe(before - 2); expect(conserved(next)).toBe(true);
  });
});
describe('development cards and awards', () => {
  it('contains exactly the base game deck', () => {
    const deck = developmentDeck(seeded()); expect(deck).toHaveLength(25);
    expect(deck.filter(c => c.kind === 'knight')).toHaveLength(14);
    expect(deck.filter(c => c.kind === 'victory-point')).toHaveLength(5);
    for (const kind of ['road-building', 'monopoly', 'year-of-plenty']) expect(deck.filter(c => c.kind === kind)).toHaveLength(2);
  });
  it('charges for a private card and prevents playing it during its purchase turn', () => {
    const g = settled(); g.phase = 'build'; grant(g, 'p0', { sheep: 1, wheat: 1, ore: 1 });
    g.developmentDeck = [{ id: 'buy', kind: 'knight', boughtTurn: -1 }];
    const next = act(g, 'p0', { type: 'buy-development' }); expect(conserved(next)).toBe(true);
    expect(getView(next, 'p1').development).toHaveLength(0);
    expect(getView(next, 'p1').players[0].developmentCount).toBe(1);
    expect(getView(next, 'p0').playableDevelopment).not.toContain('buy');
    expect(() => act(next, 'p0', { type: 'play-knight', cardId: 'buy' })).toThrow(/earlier turn/);
    expect(() => act(next, 'p0', { type: 'buy-development' })).toThrow(/empty/);
  });
  it('plays a knight before rolling without discards, then returns to the roll phase and limits play to one card', () => {
    let g = settled(); card(g, 'knight'); grant(g, 'p1', { wood: 8 });
    g = act(g, 'p0', { type: 'play-knight', cardId: 'test-card' }); expect(g.phase).toBe('robber'); expect(g.pendingDiscards).toEqual({});
    g = act(g, 'p0', { type: 'move-robber', hexId: getView(g, 'p0').legal.robberHexes[0] });
    if (g.phase === 'steal') g = act(g, 'p0', { type: 'steal', playerId: getView(g, 'p0').legal.stealTargets[0] });
    expect(g.phase).toBe('roll'); expect(g.players[0].knights).toBe(1);
    card(g, 'knight', 'second'); expect(() => act(g, 'p0', { type: 'play-knight', cardId: 'second' })).toThrow(/one development/);
  });
  it('builds two free connected roads before rolling without consuming resources', () => {
    let g = settled(); card(g, 'road-building'); const hand = { ...g.players[0].resources };
    g = act(g, 'p0', { type: 'play-road-building', cardId: 'test-card' });
    for (let i = 0; i < 2; i++) g = act(g, 'p0', { type: 'build-road', edgeId: getView(g, 'p0').legal.roads[0] });
    expect(g.phase).toBe('roll'); expect(g.players[0].resources).toEqual(hand);
    expect(getView(g, 'p0').players[0].roadsLeft).toBe(11);
  });
  it('monopoly transfers only the selected resource and plenty respects bank stock', () => {
    let g = settled(); g.phase = 'build'; card(g, 'monopoly'); grant(g, 'p1', { ore: 3 }); grant(g, 'p2', { ore: 2 });
    const total = g.players.reduce((n,p) => n + p.resources.ore, 0);
    g = act(g, 'p0', { type: 'play-monopoly', cardId: 'test-card', resource: 'ore' });
    expect(g.players[0].resources.ore).toBe(total); expect(g.players[1].resources.ore).toBe(0); expect(conserved(g)).toBe(true);
    g.developmentPlayed = false; card(g, 'year-of-plenty', 'plenty');
    g = act(g, 'p0', { type: 'play-plenty', cardId: 'plenty', resources: { ...emptyBag(), wood: 2 } }); expect(conserved(g)).toBe(true);
    g.developmentPlayed = false; card(g, 'year-of-plenty', 'bad'); g.bank.ore = 0;
    expect(() => act(g, 'p0', { type: 'play-plenty', cardId: 'bad', resources: { ...emptyBag(), ore: 2 } })).toThrow(/bank/);
  });
  it('counts loops once, excludes branches, and stops at opponent buildings', () => {
    const g = makeLobby(); g.roads = {}; g.buildings = {};
    const hex = g.board.hexes.find(h => h.q === 0 && h.r === 0)!;
    const loop = g.board.edges.filter(e => hex.vertexIds.includes(e.a) && hex.vertexIds.includes(e.b));
    for (const e of loop) g.roads[e.id] = 'p0';
    expect(longestRoad(g, 'p0')).toBe(6);
    const spur = g.board.edges.find(e => !loop.includes(e) && (hex.vertexIds.includes(e.a) || hex.vertexIds.includes(e.b)))!;
    g.roads[spur.id] = 'p0'; expect(longestRoad(g, 'p0')).toBe(7);
    const joint = hex.vertexIds.find(id => id === spur.a || id === spur.b)!;
    g.buildings[joint] = { playerId: 'p1', kind: 'settlement' };
    expect(longestRoad(g, 'p0')).toBe(6);
    g.buildings[hex.vertexIds[(hex.vertexIds.indexOf(joint)+3)%6]] = { playerId: 'p2', kind: 'settlement' };
    expect(longestRoad(g, 'p0')).toBe(3);
  });
  it('keeps tied awards with the holder and transfers on a strictly higher count', () => {
    const g = makeLobby(); g.players[0].knights = 3; updateAwards(g); expect(g.largestArmyId).toBe('p0');
    g.players[1].knights = 3; updateAwards(g); expect(g.largestArmyId).toBe('p0');
    g.players[1].knights = 4; updateAwards(g); expect(g.largestArmyId).toBe('p1');
    expect(victoryPoints(g, 'p1')).toBe(2);
  });
  it('keeps victory cards hidden and wins immediately when buying the tenth point', () => {
    let g = settled(); g.phase = 'build'; g.buildings = {};
    g.board.vertices.slice(0,4).forEach(v => { g.buildings[v.id] = { playerId: 'p0', kind: 'city' }; });
    card(g, 'victory-point'); grant(g, 'p0', { sheep: 1, wheat: 1, ore: 1 });
    expect(getView(g, 'p0').players[0].points).toBe(9); expect(getView(g, 'p1').players[0].points).toBe(8);
    g.developmentDeck = [{ id: 'winning', kind: 'victory-point', boughtTurn: -1 }];
    g = act(g, 'p0', { type: 'buy-development' }); expect(g.winnerId).toBe('p0'); expect(g.phase).toBe('finished');
    expect(getView(g, 'p1').players[0].points).toBe(10);
  });
});
describe('clocks, consent, spectators and chat', () => {
  it('expires a turn once, lets the bot finish, and gives the next player a full clock', () => {
    let g = settled(); g.settings.autoRollSeconds = 0; g.rollDeadline = null; g.turnDeadline = now + 1000;
    g = advanceTime(g, now + 1001, () => 0); expect(g.phase).toBe('roll'); expect(g.turnExpired).toBe(false); expect(g.turnIndex).toBe(1); expect(g.turnDeadline).toBe(now + 1001 + 120_000);
    expect(advanceTime(g, now + 10_000)).toBe(g); expect(g.turn).toBe(2);
  });
  it('pauses only on approval, blocks game moves, and restores all clock time on resume', () => {
    const original = settled(); let g = voteAll(original, 'pause', now + 1000);
    expect(g.pausedAt).toBe(now + 1000);
    expect(advanceTime(g, now + 500_000)).toBe(g);
    expect(() => act(g, 'p0', { type: 'roll' })).toThrow(/paused/);
    g = voteAll(g, 'resume', now + 51_000); expect(g.pausedAt).toBeNull();
    expect(g.rollDeadline).toBe(original.rollDeadline! + 50_000); expect(g.turnDeadline).toBe(original.turnDeadline! + 50_000);
  });
  it('allows connected players to agree on pause while another player is disconnected', () => {
    const g = applyAction(settled(), 'p0', { type: 'propose', kind: 'pause' }, seeded(), now, { online: ['p0'] });
    expect(g.pausedAt).toBe(now);
  });
  it('requires all other players for undo, restores resources and time, and cannot undo a random reveal', () => {
    const original = settled(); original.phase = 'build'; grant(original, 'p0', { wood: 1, brick: 1 });
    const edge = getView(original, 'p0').legal.roads[0];
    let g = act(original, 'p0', { type: 'build-road', edgeId: edge }, now + 1000);
    expect(g.undo?.snapshot).not.toHaveProperty('undo'); expect(getView(g, 'p1')).not.toHaveProperty('undo');
    g = voteAll(g, 'undo', now + 11_000); expect(g.roads).toEqual(original.roads); expect(g.players).toEqual(original.players);
    expect(g.turnDeadline).toBe(original.turnDeadline! + 10_000); expect(g.undo).toEqual(original.undo);
    const rolled = act(settled(), 'p0', { type: 'roll' }); expect(rolled.undo).toBeNull();
  });
  it('rejects and expires proposals, and expires trades even if no browser is connected', () => {
    let g = act(settled(), 'p0', { type: 'propose', kind: 'pause' });
    g = act(g, 'p1', { type: 'vote', proposalId: g.proposal!.id, accept: false }); expect(g.pausedAt).toBeNull(); expect(g.proposal?.rejected).toEqual(['p1']);
    g.phase = 'build'; grant(g, 'p0', { wood: 1 });
    g = act(g, 'p0', { type: 'offer-trade', give: { ...emptyBag(), wood: 1 }, want: { ...emptyBag(), ore: 1 } });
    expect(() => act(g, 'p1', { type: 'accept-trade', offerId: g.tradeOffer!.id }, now + 30_001)).toThrow(/no longer/);
    g = advanceTime(g, now + 30_001); expect(g.tradeOffer).toBeNull();
    g = act(g, 'p0', { type: 'propose', kind: 'pause' }, now + 31_000);
    expect(advanceTime(g, now + 80_000).proposal).toBeNull();
  });
  it('shows spectators no private cards, allows chat, and rejects moves and votes', () => {
    let g = addSpectator(settled(), { id: 'watcher', name: 'Watcher' }); card(g, 'victory-point');
    const v = getView(g, 'watcher'); expect(v.role).toBe('spectator'); expect(v.hand).toEqual(emptyBag()); expect(v.development).toEqual([]);
    expect(v.legal.settlements).toEqual([]); expect(v.players[0].points).toBe(2);
    expect(() => act(g, 'watcher', { type: 'roll' })).toThrow(/not a player/);
    expect(() => act(g, 'watcher', { type: 'propose', kind: 'pause' })).toThrow(/Spectators/);
    g = act(g, 'watcher', { type: 'chat', text: 'Hello island!' }); expect(getView(g, 'p0').chat.at(-1)?.text).toBe('Hello island!');
    expect(() => act(g, 'watcher', { type: 'chat', text: 'spam' })).toThrow(/Wait/);
  });
  it('migrates persisted games without losing the old board or player hand', () => {
    const original = settled(), legacy = structuredClone(original) as unknown as Record<string, unknown>;
    for (const k of ['spectators', 'chat', 'developmentDeck', 'pausedAt', 'undo', 'proposal', 'turnDeadline']) delete legacy[k];
    const migrated = normalizeGame(legacy as unknown as GameState, now); expect(migrated.board).toEqual(original.board); expect(migrated.players[0].resources).toEqual(original.players[0].resources);
    expect(migrated.developmentDeck).toHaveLength(25); expect(migrated.pausedAt).toBeNull();
  });
});

it('handles longest-road ties and transfers after a road is broken', () => {
  const g = makeLobby(); g.roads = {}; g.buildings = {};
  const loops = [g.board.hexes[0], g.board.hexes.at(-1)!];
  loops.forEach((h,i) => g.board.edges.filter(e => h.vertexIds.includes(e.a) && h.vertexIds.includes(e.b)).forEach(e => { g.roads[e.id] = `p${i}`; }));
  g.longestRoadId = 'p0'; updateAwards(g); expect(g.longestRoadId).toBe('p0');
  g.longestRoadId = 'p2'; updateAwards(g); expect(g.longestRoadId).toBeNull();
  g.longestRoadId = 'p0';
  for (const id of [loops[0].vertexIds[0], loops[0].vertexIds[3]]) g.buildings[id] = { playerId:'p2', kind:'settlement' };
  updateAwards(g); expect(g.longestRoadId).toBe('p1');
});

it('Road Building uses the last available piece and returns to the correct phase', () => {
  let g = settled(); g.phase='build'; g.roads={};
  g.board.edges.slice(0,14).forEach(e => { g.roads[e.id]='p0'; }); card(g,'road-building');
  g=act(g,'p0',{type:'play-road-building',cardId:'test-card'}); expect(g.freeRoads).toBe(1);
  g=act(g,'p0',{type:'build-road',edgeId:getView(g,'p0').legal.roads[0]});
  expect(g.phase).toBe('build'); expect(getView(g,'p0').players[0].roadsLeft).toBe(0);
});

it('friendly robber protects low-score opponents and custom discard limits affect only resources', () => {
  let g = settled(); g.settings.friendlyRobber = true; g.phase = 'robber';
  const protectedHex = g.board.hexes.find(h => h.id !== g.robber && h.vertexIds.some(id => g.buildings[id]?.playerId === 'p1'))!;
  expect(getView(g,'p0').legal.robberHexes).not.toContain(protectedHex.id);
  expect(() => act(g,'p0',{type:'move-robber',hexId:protectedHex.id})).toThrow(/different hex/);
  g = settled(); g.settings.discardLimit=10; for (const p of g.players) for (const r of RESOURCES) {g.bank[r]+=p.resources[r]; p.resources[r]=0;}
  grant(g,'p0',{wood:10}); grant(g,'p1',{ore:11});
  const dice=[0, .999]; g=applyAction(g,'p0',{type:'roll'},()=>dice.shift()!,now);
  expect(g.pendingDiscards).toEqual({p1:5});
});
