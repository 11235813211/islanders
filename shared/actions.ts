import { isPlayerColor } from './colors';
import { GameError, MAX_PLAYERS } from './engine/core';
import { TRACKS, type Track } from './knights';
import { cleanName, validSettings } from './settings';
import {
  BOT_LEVELS,
  type BotLevel,
  type GameAction,
  RESOURCES,
  type Resource,
  type ResourceBag,
  type TradeBag,
} from './types';

/**
 * The one place that defines every action's fields. The server uses it to parse
 * client messages (dropping unknown fields) and the engine uses it strictly
 * (rejecting unknown fields). Rules about *when* an action is allowed live in
 * the engine handlers, not here.
 */
type Field =
  | 'id'
  | 'track'
  | 'die'
  | 'resource'
  | 'bag'
  | 'tradeBag'
  | 'tradable'
  | 'count'
  | 'bool'
  | 'text'
  | 'name'
  | 'color'
  | 'botLevel'
  | 'proposalKind'
  | 'settings'
  | 'players';
type FieldSpec = Field | `${Field}?`;

const SPEC = {
  start: {},
  'new-board': {},
  'show-board': { board: 'count' },
  roll: {},
  'roll-volcanoes': {},
  'end-turn': {},
  'request-special-build': {},
  'cancel-special-build': {},
  'give-time': {},
  'hold-roll': { held: 'bool' },
  'set-name': { name: 'name' },
  'buy-development': { discoveries: 'bag?' },
  'finish-free-roads': {},
  'build-knight': { vertexId: 'id' },
  'activate-knight': { vertexId: 'id' },
  'promote-knight': { vertexId: 'id' },
  'move-knight': { from: 'id', to: 'id' },
  'chase-robber': { vertexId: 'id' },
  'build-wall': { vertexId: 'id' },
  'improve-city': { track: 'track' },
  'place-knight': { vertexId: 'id' },
  'give-cards': { resources: 'tradeBag' },
  'play-progress': {
    cardId: 'id',
    playerId: 'id?',
    hexId: 'id?',
    otherHexId: 'id?',
    vertexId: 'id?',
    edgeId: 'id?',
    resource: 'resource?',
    red: 'die?',
    yellow: 'die?',
  },
  leave: {},
  'switch-role': {},
  'play-again': {},
  configure: { settings: 'settings' },
  'choose-color': { color: 'color' },
  'ask-color-swap': { playerId: 'id' },
  'answer-color-swap': { playerId: 'id', accept: 'bool' },
  'remove-player': { playerId: 'id', watch: 'bool?' },
  'transfer-host': { playerId: 'id' },
  'seat-to-bot': { playerId: 'id', watch: 'bool' },
  'add-bot': { level: 'botLevel' },
  'set-bot-level': { playerId: 'id', level: 'botLevel' },
  'offer-trade': { give: 'tradeBag', want: 'tradeBag', to: 'players?' },
  'counter-trade': { offerId: 'id', give: 'tradeBag', want: 'tradeBag' },
  'accept-counter': { offerId: 'id', counterId: 'id' },
  'accept-trade': { offerId: 'id' },
  'confirm-trade': { offerId: 'id', playerId: 'id' },
  'decline-trade': { offerId: 'id' },
  'cancel-trade': { offerId: 'id' },
  'place-settlement': { vertexId: 'id' },
  'build-settlement': { vertexId: 'id' },
  'build-city': { vertexId: 'id' },
  'build-relay': { edgeId: 'id' },
  'peek-fog': { hexId: 'id' },
  'chart-hex': { hexId: 'id' },
  'split-hex': { hexId: 'id', resource: 'resource' },
  'place-road': { edgeId: 'id' },
  'build-road': { edgeId: 'id' },
  'place-ship': { edgeId: 'id' },
  'build-ship': { edgeId: 'id' },
  'move-ship': { from: 'id', to: 'id' },
  'choose-gold': { resources: 'bag' },
  'choose-map': { mapId: 'id', layoutFor: 'count?' },
  'propose-map': { mapId: 'id', layoutFor: 'count?' },
  'decline-map': { mapId: 'id' },
  'set-board-players': { players: 'count?' },
  'seat-spectator': { spectatorId: 'id', playerId: 'id?' },
  trade: { give: 'resource', receive: 'resource', count: 'count?' },
  'bank-trade': { give: 'bag', receive: 'bag' },
  discard: { resources: 'tradeBag' },
  'move-robber': { hexId: 'id' },
  steal: { playerId: 'id' },
  'play-knight': { cardId: 'id' },
  'play-road-building': { cardId: 'id' },
  'play-monopoly': { cardId: 'id', resource: 'tradable' },
  'play-plenty': { cardId: 'id', resources: 'tradeBag' },
  chat: { text: 'text' },
  propose: { kind: 'proposalKind' },
  vote: { proposalId: 'id', accept: 'bool' },
} as const satisfies Record<GameAction['type'], Record<string, FieldSpec>>;

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 100 && /^[\w:.,-]+$/.test(value);
}

/** Most of one resource in an action: above any hand, since large banks let a seat hold over 19. */
const MAX_BAG_COUNT = 99;

/** Card kinds an older client may leave out of a bag (they came later); parseAction fills them in as 0. */
const LATER_KINDS: readonly Resource[] = ['lodestone', 'paper', 'cloth', 'coin'];

/**
 * Every resource a whole number from 0 to MAX_BAG_COUNT. Lodestone and the commodities may be left
 * out (a bag from an older client); parseAction fills them in as 0.
 */
export function isResourceBag(value: unknown): value is ResourceBag {
  if (!record(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.every(key => RESOURCES.includes(key as Resource)) &&
    RESOURCES.every(
      r =>
        (LATER_KINDS.includes(r) && value[r] === undefined) ||
        (Number.isInteger(value[r]) && (value[r] as number) >= 0 && (value[r] as number) <= MAX_BAG_COUNT),
    )
  );
}

/** A bag that passed isResourceBag, with any missing later card kinds set to 0. */
function withLaterKinds(value: unknown): unknown {
  return record(value) && 'wood' in value ? { lodestone: 0, paper: 0, cloth: 0, coin: 0, ...value } : value;
}

/** A resource bag that may also carry jungle discoveries (whether they may move is a room rule). */
export function isTradeBag(value: unknown): value is TradeBag {
  if (!record(value)) return false;
  const { discovery, ...cards } = value;
  return (
    isResourceBag(cards) &&
    (discovery === undefined ||
      (Number.isInteger(discovery) && (discovery as number) >= 0 && (discovery as number) <= 99))
  );
}

function bagLabel(type: string, key: string): string {
  if (type === 'discard') return 'Discard amounts';
  if (type === 'choose-gold') return 'Gold choices';
  if (key === 'give' || key === 'want') return 'Trade amounts';
  return 'Resource amounts';
}

function checkField(type: string, key: string, field: Field, value: unknown): void {
  const fail = (message: string) => {
    throw new GameError(message);
  };
  switch (field) {
    case 'id':
      if (!isIdentifier(value)) fail('Invalid action selection.');
      return;
    case 'track':
      if (!TRACKS.includes(value as Track)) fail('Choose a city improvement.');
      return;
    case 'die':
      if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 6) fail('Choose a die from 1 to 6.');
      return;
    case 'resource':
      if (!RESOURCES.includes(value as Resource)) fail('Choose valid resources.');
      return;
    case 'bag':
      if (!isResourceBag(value))
        fail(`${bagLabel(type, key)} must be whole numbers from zero to nineteen for each resource.`);
      return;
    case 'tradeBag':
      if (!isTradeBag(value))
        fail(`${bagLabel(type, key)} must be whole numbers from zero to nineteen for each resource.`);
      return;
    case 'tradable':
      if (value !== 'discovery' && !RESOURCES.includes(value as Resource)) fail('Choose valid resources.');
      return;
    case 'count':
      if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 19)
        fail('Choose how many to trade.');
      return;
    case 'bool':
      if (typeof value !== 'boolean') fail('Choose accept or reject.');
      return;
    case 'text':
      if (typeof value !== 'string' || !value.trim() || value.length > 280 || /[\p{Cc}\p{Cf}]/u.test(value))
        fail('Use 1–280 characters without control characters.');
      return;
    case 'name':
      if (!cleanName(value)) fail('Use a name of 1–24 characters, without markup or control characters.');
      return;
    case 'color':
      if (!isPlayerColor(value)) fail('Choose one of the listed colors.');
      return;
    case 'botLevel':
      if (!BOT_LEVELS.includes(value as BotLevel)) fail('Choose a bot level.');
      return;
    case 'proposalKind':
      if (!['pause', 'resume', 'undo'].includes(value as string)) fail('Invalid proposal.');
      return;
    case 'settings':
      if (!validSettings(value)) fail('Choose valid room settings.');
      return;
    case 'players':
      if (!Array.isArray(value) || value.length < 1 || value.length >= MAX_PLAYERS || !value.every(isIdentifier))
        fail('Choose who receives the offer.');
      return;
  }
}

/**
 * Parse an untrusted value into a GameAction or throw GameError.
 * `strict` rejects unknown fields (engine); otherwise they are dropped (server).
 */
export function parseAction(value: unknown, { strict = true } = {}): GameAction {
  if (!record(value) || typeof value.type !== 'string' || !Object.hasOwn(SPEC, value.type))
    throw new GameError(record(value) ? 'Unknown game action.' : 'Invalid game action.');
  const type = value.type as GameAction['type'];
  const spec: Record<string, FieldSpec> = SPEC[type];
  if (strict && Object.keys(value).some(key => key !== 'type' && !Object.hasOwn(spec, key)))
    throw new GameError('Invalid action fields.');
  const action: Record<string, unknown> = { type };
  for (const [key, fieldSpec] of Object.entries(spec)) {
    const optional = fieldSpec.endsWith('?');
    if (optional && value[key] === undefined) continue;
    checkField(type, key, fieldSpec.replace('?', '') as Field, value[key]);
    const copied = record(value[key]) || Array.isArray(value[key]) ? structuredClone(value[key]) : value[key];
    action[key] = ['bag', 'tradeBag'].includes(fieldSpec.replace('?', '')) ? withLaterKinds(copied) : copied;
  }
  return action as GameAction;
}
