import { useRef } from 'react';
import type { GameLog } from '../../shared/types';

/**
 * Log entries added since this screen opened, so animations play for moves as they happen and
 * not again after a reload.
 */
export function useFreshLog(log: GameLog[]): GameLog[] {
  const seen = useRef<number | null>(null);
  seen.current ??= log.at(-1)?.id ?? 0;
  return log.filter(entry => entry.id > seen.current!);
}
