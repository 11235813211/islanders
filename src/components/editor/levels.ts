import { NUMBER_LEVELS } from '../../../shared/maps/balance';

/** The name of a number level (-NUMBER_LEVELS to NUMBER_LEVELS); the ends name the only numbers used. */
export function levelName(level: number, noEnds: boolean): string {
  if (level <= -NUMBER_LEVELS) return noEnds ? '3/11' : '2/3/11/12';
  if (level >= NUMBER_LEVELS) return '6/8';
  return ['Poorer', 'Poor', 'Normal', 'Rich', 'Richer'][level + 2]!;
}

/** What a level means, for its tooltip. */
export function levelHint(level: number, noEnds: boolean): string {
  const edges = noEnds ? '3 or 11' : '2, 3, 11 or 12';
  if (level <= -NUMBER_LEVELS) return `Only ${edges}`;
  if (level >= NUMBER_LEVELS) return 'Only 6 or 8';
  if (level === 0) return 'The usual mix';
  const share = Math.abs(level) === 1 ? 'About half are' : 'About 3 in 4 are';
  return `${share} ${level > 0 ? '6 or 8' : edges}`;
}

/** Class for a level's color: poor (red), rich (green), or none. */
export const levelTone = (level: number) => (level < 0 ? 'poor' : level > 0 ? 'rich' : '');
