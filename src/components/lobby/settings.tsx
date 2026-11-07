import { BarChart3, Dices, Hash, Minus, Plus, Shield, Timer, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { VICTORY_POINT_RANGE } from '../../../shared/settings';
import type { GameSettings } from '../../../shared/types';

/**
 * Lobby settings are data. To add a setting: add the field to GameSettings,
 * validate it in shared/settings.ts, then add one entry to a category below.
 * New categories (expansions, custom boards) are new entries in CATEGORIES.
 */
export type Control =
  | { kind: 'select'; options: { value: string | number; label: string }[] }
  | { kind: 'toggle' }
  | { kind: 'stepper'; min: number; max: number }
  | { kind: 'seconds'; min: number; max: number };
export interface SettingDef {
  key: keyof GameSettings;
  label: string;
  hint: string;
  icon: ReactNode;
  control: Control;
}
export interface Category {
  id: string;
  title: string;
  tone: 'sea' | 'sand' | 'brick' | 'forest' | 'ore';
  settings: SettingDef[];
}

/** Game modes shown at the top of the settings. Only the base game exists today. */
export const GAME_MODES = [{ id: 'base', name: 'Base game', board: 'Standard island', players: '2–4 players' }];

export const CATEGORIES: Category[] = [
  {
    id: 'board',
    title: 'Board',
    tone: 'sand',
    settings: [
      {
        key: 'numberLayout',
        label: 'Number layout',
        hint: 'Standard follows the printed spiral; random keeps 6s and 8s apart.',
        icon: <Hash size={20} />,
        control: {
          kind: 'select',
          options: [
            { value: 'ordered', label: 'Standard' },
            { value: 'random', label: 'Random' },
          ],
        },
      },
    ],
  },
  {
    id: 'rules',
    title: 'Rules',
    tone: 'brick',
    settings: [
      {
        key: 'victoryPoints',
        label: 'Points to win',
        hint: 'The first player to reach this on their turn wins.',
        icon: <Trophy size={20} />,
        control: { kind: 'stepper', min: VICTORY_POINT_RANGE.min, max: VICTORY_POINT_RANGE.max },
      },
      {
        key: 'discardLimit',
        label: 'Discard limit',
        hint: 'On a 7, anyone holding more than this discards half.',
        icon: <Shield size={20} />,
        control: { kind: 'select', options: [7, 8, 9, 10, 12].map(n => ({ value: n, label: `${n} cards` })) },
      },
      {
        key: 'friendlyRobber',
        label: 'Friendly robber',
        hint: 'The robber skips players with 2 or fewer visible points.',
        icon: <Shield size={20} />,
        control: { kind: 'toggle' },
      },
    ],
  },
  {
    id: 'timing',
    title: 'Timing',
    tone: 'forest',
    settings: [
      {
        key: 'autoRollSeconds',
        label: 'Automatic dice roll',
        hint: 'Rolls for the player if they wait this long.',
        icon: <Dices size={20} />,
        control: {
          kind: 'select',
          options: [0, 5, 10, 15, 30].map(n => ({ value: n, label: n ? `${n} seconds` : 'Off' })),
        },
      },
      {
        key: 'turnSeconds',
        label: 'Turn time limit',
        hint: 'Seconds per turn. A bot finishes the turn when time runs out.',
        icon: <Timer size={20} />,
        control: { kind: 'seconds', min: 15, max: 900 },
      },
    ],
  },
  {
    id: 'table',
    title: 'Table',
    tone: 'ore',
    settings: [
      {
        key: 'trackDice',
        label: 'Dice results tracker',
        hint: 'Shows how often each number has been rolled.',
        icon: <BarChart3 size={20} />,
        control: { kind: 'toggle' },
      },
    ],
  },
];

export function SettingControl({
  def,
  settings,
  disabled,
  change,
}: {
  def: SettingDef;
  settings: GameSettings;
  disabled: boolean;
  change: (next: Partial<GameSettings>) => void;
}) {
  const value = settings[def.key];
  const { control } = def;
  if (control.kind === 'toggle')
    return (
      <input
        className="switch-input"
        type="checkbox"
        aria-label={def.label}
        checked={value as boolean}
        disabled={disabled}
        onChange={e => change({ [def.key]: e.target.checked })}
      />
    );
  if (control.kind === 'select')
    return (
      <select
        aria-label={def.label}
        value={String(value)}
        disabled={disabled}
        onChange={e => {
          const option = control.options.find(o => String(o.value) === e.target.value)!;
          change({ [def.key]: option.value });
        }}
      >
        {control.options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  if (control.kind === 'stepper') {
    const n = value as number;
    return (
      <span className="setting-stepper" role="group" aria-label={def.label}>
        <button
          type="button"
          aria-label={`Fewer ${def.label.toLowerCase()}`}
          disabled={disabled || n <= control.min}
          onClick={() => change({ [def.key]: n - 1 })}
        >
          <Minus size={16} />
        </button>
        <output aria-live="polite">{n}</output>
        <button
          type="button"
          aria-label={`More ${def.label.toLowerCase()}`}
          disabled={disabled || n >= control.max}
          onClick={() => change({ [def.key]: n + 1 })}
        >
          <Plus size={16} />
        </button>
      </span>
    );
  }
  return (
    <input
      className="setting-number"
      aria-label={def.label}
      type="number"
      min={control.min}
      max={control.max}
      defaultValue={value as number}
      key={value as number}
      disabled={disabled}
      onBlur={e => {
        const n = Number(e.target.value);
        if (n !== value && Number.isInteger(n) && n >= control.min && n <= control.max) change({ [def.key]: n });
      }}
    />
  );
}
