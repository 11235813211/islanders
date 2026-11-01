import type { GameSettings } from './types';
export const DEFAULT_SETTINGS: GameSettings = {
  autoRollSeconds: 10, trackDice: true, numberLayout: 'random', turnSeconds: 120, friendlyRobber: false, discardLimit: 7,
};
export function validSettings(value: unknown): value is Partial<GameSettings> & Pick<GameSettings, 'autoRollSeconds' | 'trackDice'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const s = value as Record<string, unknown>;
  return Object.keys(s).every(key => Object.hasOwn(DEFAULT_SETTINGS, key))
    && [0, 5, 10, 15, 30].includes(s.autoRollSeconds as number) && typeof s.trackDice === 'boolean'
    && (s.numberLayout === undefined || ['random', 'ordered'].includes(s.numberLayout as string))
    && (s.turnSeconds === undefined || (Number.isInteger(s.turnSeconds) && Number(s.turnSeconds) >= 15 && Number(s.turnSeconds) <= 900))
    && (s.friendlyRobber === undefined || typeof s.friendlyRobber === 'boolean')
    && (s.discardLimit === undefined || (Number.isInteger(s.discardLimit) && Number(s.discardLimit) >= 3 && Number(s.discardLimit) <= 20));
}
