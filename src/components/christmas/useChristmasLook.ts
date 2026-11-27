import { useEffect, useState } from 'react';
import type { GameView } from '../../../shared/types';

const STORAGE_KEY = 'islanders.christmasLook';

function remembered(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Whether the page wears the Christmas look. A game in play shows its room's setting. Everywhere
 * else (home, the editor, a room's lobby) it also follows the last game this player played,
 * remembered on this device, until a game without it or the account dialog's switch turns it off.
 * Returns the look and that switch.
 */
export function useChristmasLook(view: GameView | null | undefined): {
  on: boolean;
  sticky: boolean;
  setSticky: (on: boolean) => void;
} {
  const [sticky, setStickyState] = useState(remembered);
  const setSticky = (next: boolean) => {
    setStickyState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Storage may be blocked; the look just isn't remembered.
    }
  };
  const played = view && view.phase !== 'lobby' ? view.settings.christmas : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: setSticky only writes storage and state.
  useEffect(() => {
    if (played !== undefined && played !== sticky) setSticky(played);
  }, [played]);
  // A game in play shows its own setting; a lobby (or no room) also keeps the remembered look.
  const on = played !== undefined ? played : !!view?.settings.christmas || sticky;
  return { on, sticky, setSticky };
}
