import { useCallback, useEffect, useState } from 'react';
import type { BoardLibrary } from '../../shared/maps';
import { apiRequest } from '../lib/api';
import { loadAccount } from './useAccount';

/** Shared across components so opening the picker twice doesn't refetch. */
let cached: BoardLibrary | null = null;
/** Who the cached library was fetched for: admins also get admin-only boards. */
let cachedFor: string | null = null;
const listeners = new Set<(library: BoardLibrary) => void>();

const currentUser = () => loadAccount()?.username ?? null;

/** Replace the cached library everywhere (after the editor saves). */
export function publishLibrary(library: BoardLibrary): void {
  cached = library;
  cachedFor = currentUser();
  for (const listener of listeners) listener(library);
}

/** The board library (maps and categories) from the server, as the signed-in account may see it. */
export function useBoardLibrary() {
  const [library, setLibrary] = useState<BoardLibrary | null>(cachedFor === currentUser() ? cached : null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async (): Promise<BoardLibrary | null> => {
    try {
      const fresh = await apiRequest<BoardLibrary>('/api/boards', {}, loadAccount());
      publishLibrary(fresh);
      setError(null);
      return fresh;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load maps.');
      return null;
    }
  }, []);
  useEffect(() => {
    listeners.add(setLibrary);
    if (!cached || cachedFor !== currentUser()) void reload();
    return () => {
      listeners.delete(setLibrary);
    };
  }, [reload]);
  return { library, error, reload };
}
