import { useEffect, useRef, useState } from 'react';
import type { AccountSession } from '../../shared/types';
import { ApiError } from '../lib/api';
import { lockBoard, releaseBoard } from '../lib/boardsApi';

/** How often an open board's hold is renewed (the server lets it lapse after 90 s). */
const RENEW_MS = 30_000;

/**
 * Hold a board while it is open in the editor. Returns the message naming who else is editing it
 * (null while this account holds it, or when signed out). `gained` runs when a board that someone
 * else held becomes free, so the editor can load their saved changes before editing.
 */
export function useBoardLock(account: AccountSession | null, id: string | null, gained: () => void): string | null {
  const [blocked, setBlocked] = useState<string | null>(null);
  const onGained = useRef(gained);
  onGained.current = gained;
  useEffect(() => {
    if (!account || !id) {
      setBlocked(null);
      return;
    }
    let wasBlocked = false;
    let stopped = false;
    const attempt = async () => {
      try {
        await lockBoard(account, id);
        if (stopped) return;
        if (wasBlocked) onGained.current();
        wasBlocked = false;
        setBlocked(null);
      } catch (error) {
        if (stopped || !(error instanceof ApiError) || error.status !== 409) return;
        wasBlocked = true;
        setBlocked(error.message);
      }
    };
    void attempt();
    const timer = setInterval(() => void attempt(), RENEW_MS);
    const leave = () => releaseBoard(account, id);
    window.addEventListener('pagehide', leave);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('pagehide', leave);
      if (!wasBlocked) leave();
    };
  }, [account, id]);
  return blocked;
}
