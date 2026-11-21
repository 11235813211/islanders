// Public API of the rules engine. Import from 'shared/engine', not from the files inside.
export { DEFAULT_SETTINGS } from '../settings';
export { applyAction } from './apply';
export {
  BUILD_COSTS,
  bankFor,
  cartographersRules,
  emptyBag,
  GameError,
  getActivePlayerId,
  handSize,
  isLargeGame,
  MAX_PLAYERS,
  ownBoard,
  resourceCount,
} from './core';
export { barbarianAttack, knightReach, knightsRules, levelOf } from './knights';
export { improvementCost, knightSites, openRoads } from './knights-legal';
export { affordsSplit, chartHexes, splitCost } from './legal';
export { addPlayer, addSpectator, createGame, peekBoard } from './lobby';
export { normalizeGame, SCHEMA_VERSION } from './migrations';
export { boardPlayerCount, proposalsBy } from './proposals';
export { awayHostSuccessor, botSeatId, passHost } from './seats';
export { idlePause, idleResume, logPresence } from './social';
export {
  advanceTime,
  BOT_ANSWER_MS,
  BOT_ANSWER_SPREAD_MS,
  BOT_OFFER_WAIT_MS,
  BOT_THINK_MS,
  type BotThinking,
  botDueAt,
  nextDueAt,
  pendingBotActor,
  ROLL_SHOW_MS,
  thinkAhead,
  UNDO_GRACE_MS,
} from './time';
export { MAX_OPEN_OFFERS } from './trade';
export { getView } from './view';
