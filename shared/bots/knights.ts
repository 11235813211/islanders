// Cities & Knights for every bot level, kept simple and cheap: defend against the barbarians when
// they are close, raise city improvements whenever it can, play progress cards that only help,
// and leave everything else to the level's own turn. The trained bots don't know the expansion.
import {
  activeStrength,
  barbarianStrength,
  KNIGHTS_COSTS,
  KNIGHTS_LIMITS,
  type ProgressCard,
  type Track,
} from '../knights';
import { hexNumbers } from '../rules';
import { boardIndex, terrainResource } from '../seafaring';
import {
  CLASSIC_RESOURCES,
  COMMODITIES,
  type GameAction,
  type GameView,
  RESOURCES,
  type Resource,
  type ResourceBag,
  type TradeBag,
  type TradeOffer,
} from '../types';

/** Dice combinations (out of 36) that roll this number. */
const dots = (n: number) => 6 - Math.abs(7 - n);

/** How much the bot would rather keep each card kind (higher keeps longer). */
function keepWeight(kind: Resource): number {
  if (COMMODITIES.includes(kind as never)) return 1.4;
  return kind === 'ore' || kind === 'wheat' ? 1.1 : 1;
}

/** Choose `count` cards to let go of: from the kinds held most, weighed by how useful they are. */
export function shedCards(view: GameView, count: number): TradeBag {
  const hand = { ...view.hand };
  const out = Object.fromEntries(RESOURCES.map(r => [r, 0])) as ResourceBag;
  for (let i = 0; i < count; i++) {
    const kind = [...RESOURCES]
      .filter(r => hand[r] > 0)
      .sort((a, b) => hand[b] / keepWeight(b) - hand[a] / keepWeight(a))[0];
    if (!kind) break;
    hand[kind]--;
    out[kind]++;
  }
  return out;
}

/** Can the hand pay this cost? */
const affords = (hand: ResourceBag, cost: ResourceBag) => RESOURCES.every(r => hand[r] >= cost[r]);

/** The barbarians will land within a few rolls and the island's knights can't hold them. */
function underThreat(view: GameView): boolean {
  const ck = view.ck!;
  const defense = view.players.reduce((n, p) => n + activeStrength(ck, p.id), 0);
  const ownsCity = Object.values(view.buildings).some(b => b.playerId === view.selfId && b.kind === 'city');
  return (
    ownsCity && ck.barbarian >= KNIGHTS_LIMITS.barbarianDistance - 3 && defense < barbarianStrength(view.buildings)
  );
}

/** Your own production of each tile resource, in dots, for picking tiles and dice. */
function production(view: GameView): Record<string, number> {
  const out: Record<string, number> = {};
  for (const hex of view.board.hexes) {
    const resource = terrainResource(hex.terrain);
    if (!resource) continue;
    for (const v of hex.vertexIds) {
      const b = view.buildings[v];
      if (b?.playerId !== view.selfId) continue;
      for (const n of hexNumbers(hex)) out[resource] = (out[resource] ?? 0) + dots(n) * (b.kind === 'city' ? 2 : 1);
    }
  }
  return out;
}

/** Alchemist: the roll that pays this seat most (never a 7), with the red die low to still draw cards. */
function alchemistDice(view: GameView): { red: number; yellow: number } {
  let best = { total: 8, value: -1 };
  for (let total = 2; total <= 12; total++) {
    if (total === 7) continue;
    let value = 0;
    for (const hex of view.board.hexes) {
      if (!hexNumbers(hex).includes(total) || hex.id === view.robber) continue;
      for (const v of hex.vertexIds) {
        const b = view.buildings[v];
        if (b?.playerId === view.selfId) value += b.kind === 'city' ? 2 : 1;
      }
    }
    if (value > best.value) best = { total, value };
  }
  const red = Math.max(1, best.total - 6);
  return { red, yellow: best.total - red };
}

/** The progress card play worth making now, or null. */
function progressPlay(view: GameView, card: ProgressCard): GameAction | null {
  const ck = view.ck!;
  const t = ck.legal.targets;
  const play = (fields: Partial<Extract<GameAction, { type: 'play-progress' }>> = {}): GameAction => ({
    type: 'play-progress',
    cardId: card.id,
    ...fields,
  });
  const leader = (ids: string[]) =>
    [...ids].sort(
      (a, b) =>
        (view.players.find(p => p.id === b)?.publicPoints ?? 0) -
        (view.players.find(p => p.id === a)?.publicPoints ?? 0),
    )[0];
  switch (card.kind) {
    case 'alchemist':
      return play(alchemistDice(view));
    case 'irrigation':
    case 'mining':
    case 'saboteur':
    case 'wedding':
    case 'road-building':
      return play();
    case 'warlord':
      return underThreat(view) ? play() : null;
    case 'smith':
      return ck.legal.promote.length ? play() : null;
    case 'crane':
      return ck.legal.improve.length ? null : play();
    case 'bishop':
      return play();
    case 'merchant': {
      const made = production(view);
      const index = boardIndex(view.board);
      const hexId = [...t.merchant].sort((a, b) => {
        const ra = terrainResource(index.hex.get(a)!.terrain)!;
        const rb = terrainResource(index.hex.get(b)!.terrain)!;
        return (made[rb] ?? 0) - (made[ra] ?? 0);
      })[0];
      return hexId ? play({ hexId }) : null;
    }
    case 'resource-monopoly':
      return play({ resource: 'ore' });
    case 'trade-monopoly':
      return play({ resource: 'coin' });
    case 'commercial-harbor': {
      const give = [...CLASSIC_RESOURCES].sort((a, b) => view.hand[b] - view.hand[a])[0]!;
      return view.hand[give] >= view.players.length - 1 ? play({ resource: give }) : null;
    }
    case 'merchant-fleet':
      return null;
    case 'medicine':
      return t.medicine.length && affords(view.hand, KNIGHTS_COSTS.medicine) ? play({ vertexId: t.medicine[0] }) : null;
    case 'engineer':
      return t.engineer.length ? play({ vertexId: t.engineer[0] }) : null;
    case 'master-merchant':
      return t.richer.length ? play({ playerId: leader(t.richer) }) : null;
    case 'spy':
      return t.spy.length ? play({ playerId: leader(t.spy) }) : null;
    case 'deserter':
      return t.deserter.length ? play({ playerId: leader(t.deserter) }) : null;
    case 'intrigue':
      return t.intrigue.length ? play({ vertexId: t.intrigue[0] }) : null;
    case 'diplomat': {
      const theirs = t.diplomat.filter(e => view.roads[e] !== view.selfId);
      return theirs.length ? play({ edgeId: theirs[0] }) : null;
    }
    case 'inventor':
      return inventorPlay(view, play);
    default:
      return null;
  }
}

/** Inventor: give your weakest numbered tile the best number from a tile you aren't on. */
function inventorPlay(
  view: GameView,
  play: (fields: Partial<Extract<GameAction, { type: 'play-progress' }>>) => GameAction,
): GameAction | null {
  const index = boardIndex(view.board);
  const tiles = view.ck!.legal.targets.inventor.map(id => index.hex.get(id)!);
  const mine = (id: string) => index.hex.get(id)!.vertexIds.some(v => view.buildings[v]?.playerId === view.selfId);
  const own = tiles.filter(h => mine(h.id)).sort((a, b) => dots(a.number!) - dots(b.number!))[0];
  const other = tiles.filter(h => !mine(h.id)).sort((a, b) => dots(b.number!) - dots(a.number!))[0];
  if (!own || !other || dots(other.number!) <= dots(own.number!)) return null;
  return play({ hexId: own.id, otherHexId: other.id });
}

/** The track to raise: the one already highest (toward a metropolis), else the one with most commodities. */
function improvementPick(view: GameView): Track | null {
  const ck = view.ck!;
  const levels = ck.improvements[view.selfId]!;
  const options = ck.legal.improve;
  return (
    [...options].sort(
      (a, b) => levels[b] - levels[a] || view.hand[trackCommodity(b)] - view.hand[trackCommodity(a)],
    )[0] ?? null
  );
}

const TRACK_COMMODITY: Record<Track, Resource> = { trade: 'cloth', politics: 'coin', science: 'paper' };
const trackCommodity = (track: Track) => TRACK_COMMODITY[track];

/** A knight move on the bot's own turn: defense when the barbarians come, improvements, cards. */
function buildMove(view: GameView): GameAction | null {
  const ck = view.ck!;
  const legal = ck.legal;
  for (const card of ck.hand) {
    if (!legal.playable.includes(card.id)) continue;
    const action = progressPlay(view, card);
    if (action) return action;
  }
  // The robber on one of your tiles: chase it off with a knight beside it.
  if (legal.chase.length) {
    const robber = boardIndex(view.board).hex.get(view.robber);
    if (robber?.vertexIds.some(v => view.buildings[v]?.playerId === view.selfId))
      return { type: 'chase-robber', vertexId: legal.chase[0]! };
  }
  if (underThreat(view)) {
    if (legal.activate.length) return { type: 'activate-knight', vertexId: legal.activate[0]! };
    if (legal.build.length) return { type: 'build-knight', vertexId: legal.build[0]! };
    if (legal.promote.length) return { type: 'promote-knight', vertexId: legal.promote[0]! };
  }
  const track = improvementPick(view);
  if (track) return { type: 'improve-city', track };
  // A first knight is cheap insurance and blocks a rival's road.
  const own = Object.values(ck.knights).filter(k => k.playerId === view.selfId).length;
  if (!own && legal.build.length) return { type: 'build-knight', vertexId: legal.build[0]! };
  if (ck.smith > 0 && legal.promote.length) return { type: 'promote-knight', vertexId: legal.promote[0]! };
  // Walls when the hand is big enough to fear a 7.
  const cards = RESOURCES.reduce((n, r) => n + view.hand[r], 0);
  if (legal.walls.length && cards >= view.settings.discardLimit)
    return { type: 'build-wall', vertexId: legal.walls[0]! };
  return null;
}

/** A trade with the bank that turns spare commodities into something useful, when no track can use them. */
function commodityTrade(view: GameView): GameAction | null {
  const levels = view.ck!.improvements[view.selfId]!;
  for (const track of ['trade', 'politics', 'science'] as Track[]) {
    const c = trackCommodity(track);
    if (levels[track] < KNIGHTS_LIMITS.maxLevel) continue;
    if (view.hand[c] >= view.tradeRates[c]) {
      const want = [...CLASSIC_RESOURCES].filter(r => view.bank[r]).sort((a, b) => view.hand[a] - view.hand[b])[0];
      if (want) return { type: 'trade', give: c, receive: want };
    }
  }
  return null;
}

/**
 * Cities & Knights phases and moves for any bot, or null to let the level's own brain decide.
 * `planned` is what the brain would do on its turn (asked only when this layer has nothing).
 */
export function knightsAct(view: GameView, planned: () => GameAction): GameAction | null {
  const ck = view.ck;
  if (!ck) return null;
  if (view.phase === 'discard')
    return { type: 'discard', resources: shedCards(view, view.pendingDiscards[view.selfId] ?? 0) };
  if (view.phase === 'gift') return { type: 'give-cards', resources: shedCards(view, ck.gifts[view.selfId] ?? 0) };
  if (view.phase === 'place-knight') return { type: 'place-knight', vertexId: ck.legal.placeKnight[0]! };
  if (view.activePlayerId !== view.selfId) return null;
  if (view.phase === 'roll') {
    const alchemist = ck.hand.find(c => c.kind === 'alchemist' && ck.legal.playable.includes(c.id));
    return alchemist ? progressPlay(view, alchemist) : null;
  }
  if (view.phase !== 'build') return null;
  // Offers waiting on this seat (or its own) are the level's to handle.
  if (view.tradeOffers.some(o => o.fromId === view.selfId || o.to.includes(view.selfId))) return null;
  const move = buildMove(view) ?? commodityTrade(view);
  if (move) return move;
  const next = planned();
  // The base bots value commodities at nothing: never let them trade one away.
  return givesCommodity(next) ? { type: 'end-turn' } : next;
}

/** Does this move give commodities away? */
function givesCommodity(action: GameAction): boolean {
  if (action.type === 'trade') return COMMODITIES.includes(action.give as never);
  if (action.type === 'bank-trade' || action.type === 'offer-trade') return COMMODITIES.some(c => action.give[c] > 0);
  return false;
}

/** Turn down offers for commodities (the base bots can't judge them). */
export function declinesCommodities(view: GameView, offer: TradeOffer): boolean {
  return !!view.ck && COMMODITIES.some(c => (offer.give[c] ?? 0) > 0 || (offer.want[c] ?? 0) > 0);
}
