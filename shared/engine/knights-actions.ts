// Cities & Knights player moves: knights, city walls, city improvements, and the two choices other
// cards hand to a player (placing a Deserter's knight, giving Wedding cards).
import { KNIGHT_NAMES, KNIGHTS_COSTS, type KnightLevel, TRACK_INFO } from '../knights';
import { addBag, addLog, bagCount, canAfford, type Handlers, needPhase, pay, requireRule, tally } from './core';
import { chaseKnight, updateMetropolis } from './knights';
import { improvementCost, knightMoves } from './knights-legal';

type KnightAction =
  | 'build-knight'
  | 'activate-knight'
  | 'promote-knight'
  | 'move-knight'
  | 'chase-robber'
  | 'build-wall'
  | 'improve-city'
  | 'place-knight'
  | 'give-cards';

const needKnights = (next: Parameters<Handlers['build-knight']>[0]['next']) => {
  requireRule(next.ck, 'This game is played without Cities & Knights.');
  return next.ck;
};

export const knightHandlers: Pick<Handlers, KnightAction> = {
  'build-knight'({ next, player, playerId }, action) {
    const ck = needKnights(next);
    needPhase(next, 'build');
    requireRule(
      knightMoves(next, playerId).build.includes(action.vertexId),
      'Place a knight on an open corner beside your road, and make sure you can pay for it.',
    );
    pay(next, player, KNIGHTS_COSTS.knight);
    ck.knights[action.vertexId] = { playerId, level: 1, active: false, activeTurn: -1, promotedTurn: -1 };
    addLog(next, `${player.name} placed a basic knight.`);
  },

  'activate-knight'({ next, player, playerId }, action) {
    const ck = needKnights(next);
    needPhase(next, 'build');
    requireRule(knightMoves(next, playerId).activate.includes(action.vertexId), 'Choose one of your inactive knights.');
    pay(next, player, KNIGHTS_COSTS.activate);
    const knight = ck.knights[action.vertexId]!;
    knight.active = true;
    knight.activeTurn = next.turn;
    addLog(next, `${player.name} activated a ${KNIGHT_NAMES[knight.level].toLowerCase()}.`);
  },

  'promote-knight'({ next, player, playerId }, action) {
    const ck = needKnights(next);
    needPhase(next, 'build');
    requireRule(
      knightMoves(next, playerId).promote.includes(action.vertexId),
      'Choose a knight you can promote (a mighty knight needs politics level 3).',
    );
    if (ck.smith > 0) ck.smith--;
    else pay(next, player, KNIGHTS_COSTS.promote);
    const knight = ck.knights[action.vertexId]!;
    knight.level = (knight.level + 1) as KnightLevel;
    knight.promotedTurn = next.turn;
    addLog(next, `${player.name} promoted a knight to ${KNIGHT_NAMES[knight.level].toLowerCase()}.`);
  },

  /** An active knight moves along your roads and goes inactive; a weaker opponent knight there is chased away. */
  'move-knight'({ next, player, playerId }, action) {
    const ck = needKnights(next);
    needPhase(next, 'build');
    requireRule(
      knightMoves(next, playerId).moves[action.from]?.includes(action.to),
      'Move an active knight (not one activated this turn) along your roads to an open corner.',
    );
    const knight = ck.knights[action.from]!;
    delete ck.knights[action.from];
    knight.active = false;
    const chasing = !!ck.knights[action.to];
    if (chasing) chaseKnight(next, action.to);
    ck.knights[action.to] = knight;
    addLog(next, chasing ? `${player.name}'s knight chased away a weaker knight.` : `${player.name} moved a knight.`);
  },

  /** An active knight beside the robber chases it off: the robber moves and steals as after a 7. */
  'chase-robber'({ next, player, playerId }, action) {
    const ck = needKnights(next);
    needPhase(next, 'build');
    requireRule(
      knightMoves(next, playerId).chase.includes(action.vertexId),
      'Choose an active knight beside the robber (not one activated this turn).',
    );
    ck.knights[action.vertexId]!.active = false;
    next.resumePhase = 'build';
    next.phase = 'robber';
    addLog(next, `${player.name}'s knight chased away the robber.`);
  },

  'build-wall'({ next, player, playerId }, action) {
    const ck = needKnights(next);
    needPhase(next, 'build');
    requireRule(
      knightMoves(next, playerId).walls.includes(action.vertexId),
      'Build a wall around one of your cities without one (three at most), and make sure you can pay.',
    );
    pay(next, player, KNIGHTS_COSTS.wall);
    ck.walls.push(action.vertexId);
    addLog(next, `${player.name} built a city wall.`);
  },

  'improve-city'({ next, player, playerId }, action) {
    const ck = needKnights(next);
    needPhase(next, 'build');
    const track = action.track;
    requireRule(
      knightMoves(next, playerId).improve.includes(track),
      `Raise ${TRACK_INFO[track].name.toLowerCase()} with a city on the board and enough ${TRACK_INFO[track].commodity}.`,
    );
    pay(next, player, improvementCost(next, playerId, track));
    ck.crane = false;
    const level = ++ck.improvements[playerId]![track];
    addLog(next, `${player.name} raised ${TRACK_INFO[track].name.toLowerCase()} to level ${level}.`);
    updateMetropolis(next, playerId, track);
  },

  /** Deserter: place the knight won, of the strength the opponent lost. */
  'place-knight'({ next, player, playerId }, action) {
    const ck = needKnights(next);
    needPhase(next, 'place-knight');
    requireRule(
      knightMoves(next, playerId).placeKnight.includes(action.vertexId),
      'Choose an open corner beside your road.',
    );
    const level = ck.pendingKnight!;
    ck.knights[action.vertexId] = { playerId, level, active: false, activeTurn: -1, promotedTurn: -1 };
    ck.pendingKnight = null;
    next.phase = 'build';
    addLog(next, `${player.name} placed the deserting ${KNIGHT_NAMES[level].toLowerCase()}.`);
  },

  /** Wedding: a richer player gives the active player cards of their choice. */
  'give-cards'({ next, player, playerId }, action) {
    const ck = needKnights(next);
    needPhase(next, 'gift');
    const owed = ck.gifts[playerId];
    requireRule(owed, 'You do not owe any cards.');
    requireRule(!action.resources.discovery, 'Give cards, not discoveries.');
    requireRule(bagCount(action.resources) === owed, `Choose exactly ${owed} card${owed === 1 ? '' : 's'} to give.`);
    requireRule(canAfford(player, action.resources), 'You do not have those cards.');
    const to = next.players[next.turnIndex]!;
    addBag(player, action.resources, -1);
    addBag(to, action.resources);
    tally(next, playerId, 'cardsOut', 'trade', owed);
    tally(next, to.id, 'cardsIn', 'trade', owed);
    delete ck.gifts[playerId];
    addLog(next, `${player.name} gave ${to.name} ${owed} card${owed === 1 ? '' : 's'}.`);
    if (!Object.keys(ck.gifts).length) next.phase = 'build';
  },
};
