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

/**
 * Fresh entries from the latest roll on (the roll, then its icebergs, gold, and eruptions). Board
 * animations follow these rather than the turn number, so a roll still plays out in full when a
 * bot ends its turn straight after it.
 */
export function sinceLatestRoll(fresh: GameLog[]): GameLog[] {
  for (let at = fresh.length - 1; at >= 0; at--) if (fresh[at]!.event?.kind === 'roll') return fresh.slice(at);
  // The roll came before this screen opened (a reload before the volcano dice): all that's fresh.
  return fresh;
}
