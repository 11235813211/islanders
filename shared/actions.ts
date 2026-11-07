import { isPlayerColor } from './colors';
import { GameError } from './engine/core';
import { validSettings } from './settings';
import { BOT_LEVELS, type BotLevel, type GameAction, RESOURCES, type Resource, type ResourceBag } from './types';

/**
 * The one place that defines every action's fields. The server uses it to parse
 * client messages (dropping unknown fields) and the engine uses it strictly
 * (rejecting unknown fields). Rules about *when* an action is allowed live in
 * the engine handlers, not here.
 */
type Field =
  | 'id'
  | 'resource'
  | 'bag'
  | 'bool'
  | 'text'
  | 'color'
  | 'botLevel'
  | 'proposalKind'
  | 'settings'
  | 'players';
type FieldSpec = Field | `${Field}?`;

const SPEC = {
  start: {},
  roll: {},
  'end-turn': {},
  'buy-development': {},
  'finish-free-roads': {},
  leave: {},
  'switch-role': {},
  'play-again': {},
  configure: { settings: 'settings' },
  'choose-color': { color: 'color' },
  'remove-player': { playerId: 'id' },
  'transfer-host': { playerId: 'id' },
  'add-bot': { level: 'botLevel' },
  'set-bot-level': { playerId: 'id', level: 'botLevel' },
  'offer-trade': { give: 'bag', want: 'bag', to: 'players?' },
  'counter-trade': { offerId: 'id', give: 'bag', want: 'bag' },
  'accept-counter': { offerId: 'id', counterId: 'id' },
  'accept-trade': { offerId: 'id' },
  'decline-trade': { offerId: 'id' },
  'cancel-trade': { offerId: 'id' },
  'place-settlement': { vertexId: 'id' },
  'build-settlement': { vertexId: 'id' },
  'build-city': { vertexId: 'id' },
  'place-road': { edgeId: 'id' },
  'build-road': { edgeId: 'id' },
  trade: { give: 'resource', receive: 'resource' },
  discard: { resources: 'bag' },
  'move-robber': { hexId: 'id' },
  steal: { playerId: 'id' },
  'play-knight': { cardId: 'id' },
  'play-road-building': { cardId: 'id' },
  'play-monopoly': { cardId: 'id', resource: 'resource' },
  'play-plenty': { cardId: 'id', resources: 'bag' },
  chat: { text: 'text' },
  propose: { kind: 'proposalKind' },
  vote: { proposalId: 'id', accept: 'bool' },
} as const satisfies Record<GameAction['type'], Record<string, FieldSpec>>;

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 100 && /^[\w:.,-]+$/.test(value);
}

export function isResourceBag(value: unknown): value is ResourceBag {
  return (
    record(value) &&
    Object.keys(value).length === RESOURCES.length &&
    RESOURCES.every(r => Number.isInteger(value[r]) && (value[r] as number) >= 0 && (value[r] as number) <= 19)
  );
}

function bagLabel(type: string, key: string): string {
  if (type === 'discard') return 'Discard amounts';
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
    case 'resource':
      if (!RESOURCES.includes(value as Resource)) fail('Choose valid resources.');
      return;
    case 'bag':
      if (!isResourceBag(value))
        fail(`${bagLabel(type, key)} must be whole numbers from zero to nineteen for all five resources.`);
      return;
    case 'bool':
      if (typeof value !== 'boolean') fail('Choose accept or reject.');
      return;
    case 'text':
      if (typeof value !== 'string' || !value.trim() || value.length > 280 || /[\p{Cc}\p{Cf}]/u.test(value))
        fail('Use 1–280 characters without control characters.');
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
      if (!Array.isArray(value) || value.length < 1 || value.length > 3 || !value.every(isIdentifier))
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
    action[key] = record(value[key]) ? structuredClone(value[key]) : value[key];
  }
  return action as GameAction;
}
