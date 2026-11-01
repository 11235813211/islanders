import { RESOURCES, type GameAction, type GameView, type ResourceBag } from './types';

/** A deterministic policy using only this seat's projected view, never opponent hands or the deck. */
export function chooseBotAction(view: GameView, builds = 0): GameAction {
  const score = (id: string) => {
    const vertex = view.board.vertices.find(v => v.id === id)!;
    const hexes = vertex.hexIds.map(id => view.board.hexes.find(h => h.id === id)!);
    return hexes.reduce((n, h) => n + (h.number ? 6 - Math.abs(7 - h.number) : 0), 0)
      + new Set(hexes.filter(h => h.terrain !== 'desert').map(h => h.terrain)).size * 1.5
      + (view.board.harbors.some(h => h.vertices.includes(id)) ? 1.5 : 0);
  };
  const best = (ids: string[]) => [...ids].sort((a,b) => score(b)-score(a) || a.localeCompare(b))[0];
  if (view.phase === 'setup-settlement') return { type: 'place-settlement', vertexId: best(view.legal.settlements) };
  if (view.phase === 'setup-road') {
    const edges = view.legal.roads.map(id => view.board.edges.find(e => e.id === id)!);
    edges.sort((a,b) => Math.max(...[b.a,b.b].filter(id => !view.buildings[id]).map(score),0)-Math.max(...[a.a,a.b].filter(id => !view.buildings[id]).map(score),0));
    return { type:'place-road', edgeId:edges[0].id };
  }
  if (view.phase === 'roll') return { type:'roll' };
  if (view.phase === 'discard') {
    const hand = {...view.hand}, bag: ResourceBag = {wood:0,brick:0,sheep:0,wheat:0,ore:0};
    for (let i=0;i<view.pendingDiscards[view.selfId];i++) {
      const resource = [...RESOURCES].sort((a,b) => hand[b]-hand[a])[0]; hand[resource]--; bag[resource]++;
    }
    return {type:'discard',resources:bag};
  }
  if (view.phase === 'robber') {
    const hexes = view.board.hexes.filter(h => view.legal.robberHexes.includes(h.id));
    const pressure = (hex: typeof hexes[number]) => hex.vertexIds.reduce((n,id) => {
      const b=view.buildings[id]; if (!b) return n;
      const p=view.players.find(p=>p.id===b.playerId)!;
      return n + (b.playerId === view.selfId ? -5 : 1 + p.points/10) * (b.kind==='city'?2:1) * (hex.number ? 6-Math.abs(7-hex.number) : 0);
    },0);
    hexes.sort((a,b)=>pressure(b)-pressure(a)); return {type:'move-robber',hexId:hexes[0].id};
  }
  if (view.phase === 'steal') {
    const targets = view.players.filter(p=>view.legal.stealTargets.includes(p.id)).sort((a,b)=>b.resourceCount-a.resourceCount || b.points-a.points);
    return {type:'steal',playerId:targets[0].id};
  }
  if (view.phase === 'free-roads') return view.legal.roads.length ? {type:'build-road',edgeId:expansionRoad(view,score) ?? view.legal.roads[0]} : {type:'finish-free-roads'};
  if (view.phase !== 'build' || builds >= 2) return {type:'end-turn'};
  if (view.legal.cities.length) return {type:'build-city',vertexId:best(view.legal.cities)};
  if (view.legal.settlements.length) return {type:'build-settlement',vertexId:best(view.legal.settlements)};

  // Exchange only when the resulting set of maritime trades can pay for a useful purchase.
  const self=view.players.find(p=>p.id===view.selfId)!;
  const plans: ResourceBag[]=[];
  if (self.citiesLeft && Object.values(view.buildings).some(b=>b.playerId===view.selfId && b.kind==='settlement')) plans.push({wood:0,brick:0,sheep:0,wheat:2,ore:3});
  if (self.settlementsLeft) plans.push({wood:1,brick:1,sheep:1,wheat:1,ore:0});
  if (view.developmentRemaining) plans.push({wood:0,brick:0,sheep:1,wheat:1,ore:1});
  for (const cost of plans) {
    const missing=RESOURCES.filter(r=>view.hand[r]<cost[r]);
    const credits=RESOURCES.reduce((n,r)=>n+Math.floor(Math.max(0,view.hand[r]-cost[r])/view.tradeRates[r]),0);
    if (missing.length && missing.every(r=>view.bank[r]) && missing.reduce((n,r)=>n+cost[r]-view.hand[r],0)<=credits) {
      const give=RESOURCES.find(r=>view.hand[r]-cost[r]>=view.tradeRates[r])!;
      return {type:'trade',give,receive:missing[0]};
    }
  }
  if (view.developmentRemaining && view.hand.sheep && view.hand.wheat && view.hand.ore) return {type:'buy-development'};
  if (view.legal.roads.length) return {type:'build-road',edgeId:expansionRoad(view,score) ?? view.legal.roads[0]};
  return {type:'end-turn'};
}

function expansionRoad(view: GameView, score: (id:string)=>number): string | undefined {
  const vertices=new Map(view.board.vertices.map(v=>[v.id,v]));
  const distance=new Map<string,number>(), paths=new Map<string,string[]>();
  for (const v of view.board.vertices) {
    if (view.buildings[v.id]?.playerId === view.selfId || (!view.buildings[v.id] && v.edgeIds.some(id=>view.roads[id]===view.selfId))) { distance.set(v.id,0); paths.set(v.id,[]); }
  }
  const remaining=new Set(vertices.keys());
  while (remaining.size) {
    const id=[...remaining].sort((a,b)=>(distance.get(a)??Infinity)-(distance.get(b)??Infinity))[0];
    const d=distance.get(id); if (d===undefined) break; remaining.delete(id);
    if (view.buildings[id] && view.buildings[id].playerId!==view.selfId) continue;
    for (const edge of view.board.edges.filter(e=>e.a===id || e.b===id)) {
      if (view.roads[edge.id] && view.roads[edge.id]!==view.selfId) continue;
      const other=edge.a===id?edge.b:edge.a, cost=view.roads[edge.id]?0:1;
      if (d+cost < (distance.get(other)??Infinity)) { distance.set(other,d+cost); paths.set(other,[...(paths.get(id)??[]),...(cost?[edge.id]:[])]); }
    }
  }
  const targets=view.board.vertices.filter(v=>!view.buildings[v.id] && (paths.get(v.id)?.length ?? 0)>0 && !v.edgeIds.some(id=>{const e=view.board.edges.find(e=>e.id===id)!; return !!view.buildings[e.a===v.id?e.b:e.a];}));
  targets.sort((a,b)=>score(b.id)/(1+(distance.get(b.id)??99)**1.5)-score(a.id)/(1+(distance.get(a.id)??99)**1.5));
  return targets.map(v=>paths.get(v.id)?.[0]).find(id=>id && view.legal.roads.includes(id));
}
