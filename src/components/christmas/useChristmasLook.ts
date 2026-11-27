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
 * Whether the page wears the Christmas look. In a room, the room's setting decides. Elsewhere (home,
 * the editor) it follows the last game this player played, remembered on this device, until a game
 * without it or the account dialog's switch turns it off. Returns the look and that switch.
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
  return { on: view ? !!view.settings.christmas : sticky, sticky, setSticky };
}
