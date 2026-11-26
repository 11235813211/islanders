import { payingNumbers } from '../../../shared/rules';
import type { GameLog, GameView } from '../../../shared/types';

/**
 * Tiles that just paid out on the latest roll (its number, not blocked, with a building beside
 * them), for the Christmas tiles' one-time motion. `rollId` tells one roll from the next.
 */
export function paidTiles(view: GameView, rolled: GameLog[]): { hexIds: Set<string>; rollId: number } | null {
  const roll = rolled.find(entry => entry.event?.kind === 'roll');
  if (roll?.event?.kind !== 'roll') return null;
  const total = roll.event.dice[0] + roll.event.dice[1];
  if (total === 7) return null;
  const hexIds = new Set(
    view.board.hexes
      .filter(
        hex => payingNumbers(hex, hex.id === view.robber).includes(total) && hex.vertexIds.some(v => view.buildings[v]),
      )
      .map(hex => hex.id),
  );
  return { hexIds, rollId: roll.id };
}
