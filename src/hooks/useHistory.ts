import { useCallback, useState } from 'react';

const LIMIT = 200;

/**
 * A value with undo and redo. Changes sharing a `group` (one drag of the brush) merge into a
 * single undo step.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[], group: '' });
  const set = useCallback((change: (value: T) => T, group = '') => {
    setState(s => {
      const present = change(s.present);
      if (present === s.present) return s;
      if (group && group === s.group) return { ...s, present };
      return { past: [...s.past, s.present].slice(-LIMIT), present, future: [], group };
    });
  }, []);
  const undo = useCallback(() => {
    setState(s =>
      s.past.length
        ? { past: s.past.slice(0, -1), present: s.past.at(-1)!, future: [s.present, ...s.future], group: '' }
        : s,
    );
  }, []);
  const redo = useCallback(() => {
    setState(s =>
      s.future.length
        ? { past: [...s.past, s.present], present: s.future[0]!, future: s.future.slice(1), group: '' }
        : s,
    );
  }, []);
  const reset = useCallback((value: T) => setState({ past: [], present: value, future: [], group: '' }), []);
  return {
    value: state.present,
    set,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
