import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_SETTINGS } from '../../../shared/settings';
import type { GameView } from '../../../shared/types';
import { CATEGORIES, type Category, type SettingDef } from './settings';

const STORAGE_KEY = 'islanders.allSettings';

/** Whether this viewer shows every setting, remembered on this device (best effort). */
export function useAllSettings(): [boolean, (all: boolean) => void] {
  const [all, setAll] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const change = (next: boolean) => {
    setAll(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Storage may be blocked; the choice just isn't remembered.
    }
  };
  return [all, change];
}

/** The settings a category shows now: those that apply, and the advanced ones only with `all`. */
export function shownSettings(category: Category, view: GameView, all: boolean): SettingDef[] {
  return category.settings.filter(def => (def.when?.(view) ?? true) && (all || !def.advanced));
}

/** Hidden settings that differ from a new room's, so a folded list still says something changed. */
function changedHidden(view: GameView): number {
  return CATEGORIES.flatMap(c => c.settings).filter(
    def => def.advanced && (def.when?.(view) ?? true) && view.settings[def.key] !== DEFAULT_SETTINGS[def.key],
  ).length;
}

/** Shows or hides the less used settings, in their own categories. Anyone in the room may use it. */
export default function AllSettingsButton({
  view,
  all,
  setAll,
}: {
  view: GameView;
  all: boolean;
  setAll: (all: boolean) => void;
}) {
  const changed = all ? 0 : changedHidden(view);
  return (
    <button type="button" className="button secondary all-settings" aria-pressed={all} onClick={() => setAll(!all)}>
      {all ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      <span>{all ? 'Fewer settings' : 'All settings'}</span>
      {changed > 0 && <span className="subtle-badge">{changed} changed</span>}
    </button>
  );
}
