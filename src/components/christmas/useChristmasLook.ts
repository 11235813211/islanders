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

/** The signed-in account's copy of the look, kept on the server for every device: null until loaded, 'unset' if never kept. */
interface AccountLook {
  christmasLook: boolean | 'unset' | null;
  setChristmasLook: (on: boolean) => Promise<void>;
}

/**
 * Whether the page wears the Christmas look. A game in play shows its room's setting. Everywhere
 * else (home, the editor, a room's lobby) it also follows the last game this player played,
 * remembered on this device and on the account (so signing in elsewhere brings it), until a game
 * without it or the account dialog's switch turns it off.
 * Returns the look and that switch.
 */
export function useChristmasLook(
  view: GameView | null | undefined,
  account: AccountLook,
): {
  on: boolean;
  sticky: boolean;
  setSticky: (on: boolean) => void;
} {
  const [sticky, setStickyState] = useState(remembered);
  const remember = (next: boolean) => {
    setStickyState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Storage may be blocked; the look just isn't remembered.
    }
  };
  const setSticky = (next: boolean) => {
    remember(next);
    account.setChristmasLook(next).catch(() => {
      // Offline: this device still remembers it, and the next change tries again.
    });
  };
  // Signing in (or loading the account) brings the account's look to this device; an account that
  // never kept one takes this device's.
  // biome-ignore lint/correctness/useExhaustiveDependencies: remember and setSticky only write storage, state, and the account.
  useEffect(() => {
    if (account.christmasLook === 'unset') setSticky(sticky);
    else if (account.christmasLook !== null) remember(account.christmasLook);
  }, [account.christmasLook]);
  const played = view && view.phase !== 'lobby' ? view.settings.christmas : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: setSticky only writes storage, state, and the account.
  useEffect(() => {
    if (played !== undefined && played !== sticky) setSticky(played);
  }, [played]);
  // A game in play shows its own setting; a lobby (or no room) also keeps the remembered look.
  const on = played !== undefined ? played : !!view?.settings.christmas || sticky;
  return { on, sticky, setSticky };
}
