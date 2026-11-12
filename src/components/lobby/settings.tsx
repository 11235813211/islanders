import {
  ArrowLeftRight,
  BarChart3,
  Compass,
  Dices,
  Flame,
  Hash,
  House,
  Landmark,
  Minus,
  Mountain,
  Plus,
  Route,
  Sailboat,
  Shield,
  Timer,
  Trophy,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { AUTO_ROLL_SECONDS, DISCOVERY_RULES, TRADE_SECONDS, VICTORY_POINT_RANGE } from '../../../shared/settings';
import type { DiscoveryRule, GameSettings, GameView } from '../../../shared/types';

/**
 * Lobby settings are data. To add a setting: add the field to GameSettings,
 * validate it in shared/settings.ts, then add one entry to a category below.
 * The map itself is chosen above the settings (MapChoice.tsx).
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
  /** Show the setting only when this holds (default: always). */
  when?: (view: GameView) => boolean;
  /** A question to confirm before this change, or null to apply it straight away. */
  confirm?: (view: GameView, value: GameSettings[keyof GameSettings]) => string | null;
}
export interface Category {
  id: string;
  title: string;
  tone: 'sea' | 'sand' | 'brick' | 'forest' | 'ore';
  settings: SettingDef[];
}

export const CATEGORIES: Category[] = [
  {
    id: 'variations',
    title: 'Variations',
    tone: 'sea',
    settings: [
      {
        key: 'seafarers',
        label: 'Seafarers',
        hint: 'Ships and the pirate. On the standard island, this adds a ring of sea around it.',
        icon: <Sailboat size={20} />,
        control: { kind: 'toggle' },
        confirm: (view, on) =>
          !on && view.features.sea
            ? 'This map is made for Seafarers. Without it there are no ships or pirate, so other islands can’t be reached. Turn Seafarers off anyway?'
            : null,
      },
      {
        key: 'routeLinks',
        label: 'Roads meet ships',
        hint: 'Anywhere along your route, or only at your settlement or city (the published rule).',
        icon: <Route size={20} />,
        when: view => view.seafaring,
        control: {
          kind: 'select',
          options: [
            { value: 'anywhere', label: 'Anywhere' },
            { value: 'settlement', label: 'At a settlement' },
          ],
        },
      },
      {
        key: 'volcanoStart',
        label: 'Start next to volcanoes',
        hint: 'Whether setup settlements may touch a volcano.',
        icon: <Mountain size={20} />,
        when: view => view.features.volcano,
        control: { kind: 'toggle' },
      },
      {
        key: 'volcanoDice',
        label: 'Eruption dice',
        hint: 'Random, or balanced: each volcano draws from its own deck of 12 with every corner twice.',
        icon: <Dices size={20} />,
        when: view => view.features.volcano,
        control: {
          kind: 'select',
          options: [
            { value: 'random', label: 'Random' },
            { value: 'balanced', label: 'Balanced' },
          ],
        },
      },
      {
        key: 'volcanoGold',
        label: 'Volcanoes pay',
        hint: 'On: a volcano pays a resource of your choice, then erupts. Off: it only erupts.',
        icon: <Flame size={20} />,
        when: view => view.features.volcano,
        control: { kind: 'toggle' },
      },
    ],
  },
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
        // Designed maps always draw balanced numbers.
        when: view => !view.map,
        control: {
          kind: 'select',
          options: [
            { value: 'ordered', label: 'Standard' },
            { value: 'random', label: 'Random' },
          ],
        },
      },
      {
        key: 'pieceStyle',
        label: 'Piece style',
        hint: 'How settlements and cities look. The rules are the same.',
        icon: <House size={20} />,
        control: {
          kind: 'select',
          options: [
            { value: 'classic', label: 'Classic' },
            { value: 'chalet', label: 'Mountain chalet' },
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
        key: 'discoveries',
        label: 'Jungle discoveries',
        hint: 'Kept safe is the published rule. Tradable: also traded and discarded on a 7. Like a card: also stolen and taken by Monopoly.',
        icon: <Compass size={20} />,
        when: view => view.jungle,
        control: {
          kind: 'select',
          options: (Object.keys(DISCOVERY_RULES) as DiscoveryRule[]).map(value => ({
            value,
            label: DISCOVERY_RULES[value].label,
          })),
        },
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
          options: AUTO_ROLL_SECONDS.map(n => ({ value: n, label: n ? `${n} seconds` : 'Off' })),
        },
      },
      {
        key: 'turnSeconds',
        label: 'Turn time limit',
        hint: 'Seconds per turn. A bot finishes the turn when time runs out.',
        icon: <Timer size={20} />,
        control: { kind: 'seconds', min: 15, max: 900 },
      },
      {
        key: 'tradeSeconds',
        label: 'Trade offers last',
        hint: 'How long other players have to answer a trade offer.',
        icon: <ArrowLeftRight size={20} />,
        control: { kind: 'select', options: TRADE_SECONDS.map(n => ({ value: n, label: `${n} seconds` })) },
      },
    ],
  },
  {
    id: 'table',
    title: 'Table',
    tone: 'ore',
    settings: [
      {
        key: 'diceMode',
        label: 'Dice',
        hint: 'Balanced: rolls come from a shuffled deck of all 36 combinations, with fewer repeats in a row.',
        icon: <Dices size={20} />,
        control: {
          kind: 'select',
          options: [
            { value: 'balanced', label: 'Balanced' },
            { value: 'random', label: 'Random' },
          ],
        },
      },
      {
        key: 'trackDice',
        label: 'Dice results tracker',
        hint: 'Shows how often each number has been rolled.',
        icon: <BarChart3 size={20} />,
        control: { kind: 'toggle' },
      },
      {
        key: 'showBank',
        label: 'Show bank cards',
        hint: 'Everyone sees how many cards of each resource the bank has left. With two players the counts give away the other player’s hand.',
        icon: <Landmark size={20} />,
        control: {
          kind: 'select',
          options: [
            { value: 'auto', label: 'Except 2 players' },
            { value: 'always', label: 'Always' },
            { value: 'never', label: 'Never' },
          ],
        },
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
