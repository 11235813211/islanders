import { describe, expect, it } from 'vitest';
import { advanceTime, applyAction, getActivePlayerId, getView, normalizeGame, resourceCount } from '../shared/engine';
import { chooseBotAction } from '../shared/bot';
import { RESOURCES, type GameState, type Phase } from '../shared/types';
import { conserved, grant, makeLobby, seeded, settled, TEST_NOW as now } from './fixtures';
function clearHands(g: GameState) { for (const p of g.players) for (const r of RESOURCES) { g.bank[r]+=p.resources[r]; p.resources[r]=0; } }
function consent(g: GameState, at: number) {
  g=applyAction(g,g.undo!.actorId,{type:'propose',kind:'undo'},seeded(),at);
  for (const id of g.proposal!.required.filter(id=>!g.proposal!.accepted.includes(id))) g=applyAction(g,id,{type:'vote',proposalId:g.proposal!.id,accept:true},seeded(),at);
  return g;
}
describe('server-side turn completion',()=>{
  it('finishes just one setup placement, including the last placement, when alarms are late',()=>{
    let g=applyAction(makeLobby(4),'p0',{type:'start'},seeded(),now);
    const random=seeded(51);
    for(let i=0;i<8;i++) {
      const at=g.turnDeadline!+90_000;
      g=advanceTime(g,at,random);
      expect(g.setupIndex).toBe(i+1); expect(Object.keys(g.buildings)).toHaveLength(i+1); expect(Object.keys(g.roads)).toHaveLength(i+1);
      expect(g.turnDeadline).toBe(at+g.settings.turnSeconds*1000); expect(conserved(g)).toBe(true);
    }
    expect(g.phase).toBe('roll'); expect(g.turn).toBe(1);
  });
  it.each<Phase>(['roll','discard','robber','steal','free-roads','build'])('resolves %s and passes to the next player',phase=>{
    let g=settled(); clearHands(g); g.phase=phase; g.turnDeadline=now; g.rollDeadline=null;
    grant(g,'p0',{wood:5,brick:5,sheep:3,wheat:4,ore:5}); grant(g,'p1',{wood:9}); grant(g,'p2',{brick:9});
    if(phase==='discard') g.pendingDiscards={p0:11,p1:4,p2:4};
    if(phase==='free-roads') {g.freeRoads=2;g.resumePhase='roll';}
    if(phase==='steal') {
      const hex=g.board.hexes.find(h=>h.vertexIds.some(v=>g.buildings[v]?.playerId==='p1'))!;g.robber=hex.id;
    }
    const before=g.turn;g=advanceTime(g,now+1,seeded(1));
    expect(g.turn).toBe(before+1);expect(getActivePlayerId(g)).toBe('p1');expect(g.phase).toBe('roll');expect(g.pendingDiscards).toEqual({});expect(g.undo).toBeNull();expect(conserved(g)).toBe(true);
  });
  it('resolves a seven and every opponent discard even when all clients are offline',()=>{
    let g=settled();clearHands(g);grant(g,'p0',{wood:9});grant(g,'p1',{ore:9});grant(g,'p2',{wheat:9});g.turnDeadline=now;
    const values=[0,.999,0];g=advanceTime(g,now,()=>values.shift()??0);
    expect(g.diceCounts[7]).toBe(1);expect(g.pendingDiscards).toEqual({});expect(g.turnIndex).toBe(1);expect(conserved(g)).toBe(true);
    expect(g.players.every(p=>resourceCount(p.resources)<=6)).toBe(true);
  });
  it('never runs while paused and migrates already-expired clocks',()=>{
    let g=settled();g.turnDeadline=now;g.pausedAt=now-1000;
    expect(advanceTime(g,now+10_000)).toBe(g);
    g.pausedAt=null;g.turnExpired=true;
    g=advanceTime(normalizeGame(g,now),now+10_000,seeded());expect(g.turn).toBe(2);expect(g.turnExpired).toBe(false);
  });
  it('finishes many seeded games without illegal choices, stalled turns, or lost resources',()=>{
    let winners=0;
    for(let seed=1;seed<=6;seed++){
      const random=seeded(seed);let g=applyAction(makeLobby(seed%2?3:4),'p0',{type:'start'},random,now);
      g.settings.friendlyRobber=seed%2===0;
      for(let step=0;step<250 && g.phase!=='finished';step++){
        const before=[g.turn,g.setupIndex];g=advanceTime(g,g.turnDeadline!,random);
        expect(conserved(g),`seed ${seed}, turn ${g.turn}`).toBe(true);
        if(g.phase!=='finished') expect([g.turn,g.setupIndex]).not.toEqual(before);
      }
      if(g.winnerId) winners++;
      expect(g.turn).toBeGreaterThan(10);
    }
    expect(winners).toBe(6);
  },30_000);
  it('chooses the same action regardless of hidden opponent cards',()=>{
    const g=settled();g.phase='build';grant(g,'p0',{wood:3,brick:3});
    const first=chooseBotAction(getView(g,'p0'));g.players[1].development.push({id:'private',kind:'victory-point',boughtTurn:0});
    expect(chooseBotAction(getView(g,'p0'))).toEqual(first);
  });
});
it('automatically steals a weighted random resource from a sole victim and returns to pre-roll after a knight',()=>{
  const initial=settled();clearHands(initial);initial.phase='robber';initial.resumePhase='roll';initial.buildings={};
  const hex=initial.board.hexes.find(h=>h.id!==initial.robber)!;
  initial.buildings[hex.vertexIds[0]]={playerId:'p1',kind:'settlement'};grant(initial,'p1',{wood:1,ore:3});
  for(const [random,resource] of [[0,'wood'],[.249,'wood'],[.25,'ore'],[.999,'ore']] as const){
    const g=applyAction(initial,'p0',{type:'move-robber',hexId:hex.id},()=>random,now);
    expect(g.phase).toBe('roll');expect(g.players[0].resources[resource]).toBe(1);expect(conserved(g)).toBe(true);
    expect(g.log.at(-1)?.text).not.toMatch(/wood|ore/);
  }
});
it('requires an explicit victim choice only for multiple eligible players',()=>{
  let g=settled();clearHands(g);g.phase='robber';g.buildings={};
  const hex=g.board.hexes.find(h=>h.id!==g.robber)!;
  g.buildings[hex.vertexIds[0]]={playerId:'p1',kind:'settlement'};g.buildings[hex.vertexIds[3]]={playerId:'p2',kind:'city'};
  grant(g,'p1',{wood:1});grant(g,'p2',{ore:1});
  g=applyAction(g,'p0',{type:'move-robber',hexId:hex.id},seeded(),now);expect(g.phase).toBe('steal');expect(getView(g,'p0').legal.stealTargets.sort()).toEqual(['p1','p2']);
  expect(()=>applyAction(g,'p0',{type:'steal',playerId:'p0'},seeded(),now)).toThrow(/bordering/);
});
it('preserves public points while exposing the total only to its owner until the game ends',()=>{
  const g=settled();g.players[0].development.push({id:'vp',kind:'victory-point',boughtTurn:0});
  expect(getView(g,'p0').players[0]).toMatchObject({publicPoints:2,points:3});
  expect(getView(g,'p1').players[0]).toMatchObject({publicPoints:2,points:2});
  expect(getView(g,'p1')).not.toHaveProperty('undoHistory');
});
it('supports repeated undo proposals, multiple successive undos, and restores time without duplicating resources',()=>{
  let g=applyAction(settled(),'p0',{type:'roll'},()=>0,now);clearHands(g);grant(g,'p0',{wood:5,brick:5});
  const initial=structuredClone(g);
  for(let i=0;i<3;i++)g=applyAction(g,'p0',{type:'build-road',edgeId:getView(g,'p0').legal.roads[0]},seeded(),now+1000*(i+1));
  const last=g.undo!.description;
  g=applyAction(g,'p0',{type:'propose',kind:'undo'},seeded(),now+4000);
  g=applyAction(g,'p1',{type:'vote',proposalId:g.proposal!.id,accept:false},seeded(),now+4000);
  expect(g.proposal?.rejected).toEqual(['p1']);expect(g.undo?.description).toBe(last);
  for(let i=0;i<3;i++) {g=consent(g,now+5000+1000*i);expect(conserved(g)).toBe(true);}
  expect(g.roads).toEqual(initial.roads);expect(g.players).toEqual(initial.players);expect(g.undo).toBeNull();expect(g.undoHistory).toEqual([]);
  expect(g.turnDeadline).toBe(initial.turnDeadline!+6000);
  g=applyAction(g,'p0',{type:'build-road',edgeId:getView(g,'p0').legal.roads[0]},seeded(),now+8000);
  expect(consent(g,now+9000).roads).toEqual(initial.roads);
});

it('the last opponent discard leaves robber movement to the active player',()=>{
  let g=settled();clearHands(g);grant(g,'p1',{ore:9});
  const dice=[0,.999];g=applyAction(g,'p0',{type:'roll'},()=>dice.shift()!,now);
  expect(g.phase).toBe('discard');
  g=applyAction(g,'p1',{type:'discard',resources:{wood:0,brick:0,sheep:0,wheat:0,ore:4}},seeded(),now);
  expect(g.phase).toBe('robber');expect(getView(g,'p0').legal.robberHexes.length).toBeGreaterThan(0);
  expect(getView(g,'p1').legal.robberHexes).toEqual([]);
  const before=g.robber;g.turnDeadline=now;g=advanceTime(g,now,seeded());
  expect(g.robber).not.toBe(before);expect(g.turn).toBe(2);expect(conserved(g)).toBe(true);
});
