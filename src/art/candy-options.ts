import { createContext, useSyncExternalStore } from 'react';
import type { ClassicResource } from '../../shared/types';

/** v21's A/B candy options; v22 draws one design per resource, so nothing provides choices now. */
export type CandyStyle = 'a' | 'b';
export const CandyChoices = createContext<Partial<Record<ClassicResource, CandyStyle>>>({});
export const CandyTheme = createContext(false);
const KEY = 'islanders.candy-art';
const EVENT = 'candy-art-change';
let cached = '';
let memoryOnly = false;
let snapshot: { look: 'default' | 'christmas' | 'candy' } = { look: 'default' };

function read() {
  if (memoryOnly) return snapshot;
  let raw = '';
  try {
    raw = localStorage.getItem(KEY) ?? '';
  } catch {
    return snapshot;
  }
  if (raw === cached) return snapshot;
  cached = raw;
  try {
    const value = JSON.parse(raw);
    snapshot = { look: ['christmas', 'candy'].includes(value.look) ? value.look : 'default' };
  } catch {
    snapshot = { look: 'default' };
  }
  return snapshot;
}
function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

/** The editor's preview look, remembered on this device. */
export function useCandyOptions() {
  const options = useSyncExternalStore(subscribe, read, () => snapshot);
  const save = (next: typeof snapshot) => {
    snapshot = next;
    cached = JSON.stringify(next);
    try {
      localStorage.setItem(KEY, cached);
    } catch {
      memoryOnly = true;
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return {
    ...options,
    setLook: (look: typeof snapshot.look) => save({ look }),
  };
}
