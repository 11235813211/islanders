import { useCallback, useEffect, useState } from 'react';
import type { BoardLibrary } from '../../shared/maps';
import { apiRequest } from '../lib/api';

/** Shared across components so opening the picker twice doesn't refetch. */
let cached: BoardLibrary | null = null;
const listeners = new Set<(library: BoardLibrary) => void>();

/** Replace the cached library everywhere (after the editor saves). */
export function publishLibrary(library: BoardLibrary): void {
  cached = library;
  for (const listener of listeners) listener(library);
}

/** The board library (maps and categories) from the server. */
export function useBoardLibrary() {
  const [library, setLibrary] = useState<BoardLibrary | null>(cached);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      publishLibrary(await apiRequest<BoardLibrary>('/api/boards'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load maps.');
    }
  }, []);
  useEffect(() => {
    listeners.add(setLibrary);
    if (!cached) void reload();
    return () => {
      listeners.delete(setLibrary);
    };
  }, [reload]);
  return { library, error, reload };
}
