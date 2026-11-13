import { Check, Minus, Plus } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type { BoardDesign, FillKind, NumberProfile } from '../../../shared/maps';
import { BIAS_LEVELS, NUMBER_LEVELS } from '../../../shared/maps/balance';
import { islandOf } from '../../../shared/maps/edit';
import {
  assignGroup,
  followers,
  islandGroups,
  islandSet,
  profileOf,
  setProfile,
  splitGroup,
} from '../../../shared/maps/numbers';
import { tileKey } from '../../../shared/maps/types';
import { TileIcon } from './BrushPicker';
import type { EditorSelection } from './EditorCanvas';
import { KIND_LABELS } from './tools';
import './numbers.css';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;

/** Overall levels, -NUMBER_LEVELS to NUMBER_LEVELS. */
const LEVEL_LABELS = [
  'Worst',
  'Much worse',
  'Worse',
  'A bit worse',
  'Normal',
  'A bit better',
  'Better',
  'Much better',
  'Best',
];
/** Terrain bias, -BIAS_LEVELS to BIAS_LEVELS. */
const BIAS_LABELS = ['Poorer', 'Poor', 'Normal', 'Rich', 'Richer'];
/** Terrains that take numbers, in the order the mix lists them. */
const NUMBER_TERRAINS: FillKind[] = ['wood', 'sheep', 'wheat', 'brick', 'ore', 'gold', 'jungle', 'volcano'];
const SETS = [
  { which: 'all', label: 'All islands' },
  { which: 'closed', label: 'Closed islands' },
  { which: 'open', label: 'Open islands' },
] as const;

const groupName = (group: string | null) => (group ? `Group ${group}` : 'Board');
const toneOf = (value: number) => (value < 0 ? 'poor' : value > 0 ? 'rich' : '');

/** One labeled − value + control. */
function Stepper({
  icon,
  label,
  value,
  range,
  names,
  set,
}: {
  icon?: ReactNode;
  label: string;
  value: number;
  range: number;
  names: string[];
  set: (value: number) => void;
}) {
  return (
    <div className="stepper-row">
      {icon ?? <span aria-hidden="true" />}
      <span className="stepper-name">{label}</span>
      <div className="stepper" role="group" aria-label={label}>
        <button type="button" aria-label={`${label} worse`} disabled={value <= -range} onClick={() => set(value - 1)}>
          <Minus size={14} />
        </button>
        <output className={`stepper-value ${toneOf(value)}`}>{names[value + range]}</output>
        <button type="button" aria-label={`${label} better`} disabled={value >= range} onClick={() => set(value + 1)}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

/** Terrains worth a row: ones on the board, in a random mix, or already leaning. */
function shownTerrains(design: BoardDesign, profile: NumberProfile): FillKind[] {
  const pools = [design.pool, ...Object.values(design.islandPools ?? {})];
  return NUMBER_TERRAINS.filter(
    k =>
      profile.bias?.[k] ||
      design.tiles.some(t => t.kind === k) ||
      (design.tiles.some(t => t.kind === 'land') && pools.some(p => (p[k] ?? 0) > 0)),
  );
}

/** The selected tile's island (its tile keys), if a land tile is selected. */
function selectedIsland(design: BoardDesign, selection: EditorSelection): Set<string> | null {
  if (selection?.kind !== 'tile') return null;
  const island = islandOf(design, selection.q, selection.r);
  return island.length ? new Set(island.map(t => tileKey(t.q, t.r))) : null;
}

/**
 * Random numbers, all in one place: which profile the selected island follows (the board's, a
 * shared group, or its own), that profile's overall level and per-terrain leaning, which islands
 * use it, and no 2s or 12s.
 */
export default function NumberSettings({
  design,
  edit,
  selection,
}: {
  design: BoardDesign;
  edit: Edit;
  selection: EditorSelection;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const island = selectedIsland(design, selection);
  const groups = islandGroups(design);
  const counts = followers(design);
  const islandGroup = island ? (groups.get([...island][0]!) ?? null) : null;
  const active = island ? islandGroup : picked && design.numberGroups?.[picked] ? picked : null;
  const profile = profileOf(design, active);
  const choices = [null, ...Object.keys(design.numberGroups ?? {}).filter(g => counts.get(g) || g === active)];
  const following = counts.get(active) ?? 0;

  const choose = (group: string | null) => {
    if (island) edit(d => assignGroup(d, island, group));
    else setPicked(group);
  };
  const makeOwn = () => {
    if (!island) return;
    edit(d => splitGroup(d, island, profileOf(d, active)).design);
  };
  const change = (patch: NumberProfile) =>
    edit(d => setProfile(d, active, { ...profileOf(d, active), ...patch }), `numbers-${active ?? 'board'}`);
  const setBias = (kind: FillKind, value: number) => change({ bias: { ...profile.bias, [kind]: value } });
  const followsAll = (keys: Set<string>) => keys.size > 0 && [...keys].every(k => (groups.get(k) ?? null) === active);
  const empty = !profile.level && !Object.values(profile.bias ?? {}).some(Boolean);

  return (
    <section className="inspector-section number-settings" aria-label="Random numbers">
      <h3>Random numbers</h3>
      <div className="number-follow">
        <span className="inspector-label">{island ? `This island (${island.size} tiles) follows` : 'Edit'}</span>
        <div className="chip-row wrap" role="radiogroup" aria-label={island ? 'Island follows' : 'Profile to edit'}>
          {choices.map(group => (
            <button
              key={group ?? 'board'}
              type="button"
              role="radio"
              aria-checked={active === group}
              onClick={() => choose(group)}
            >
              {groupName(group)}
            </button>
          ))}
          {island && (
            <button
              type="button"
              data-tip="Give this island its own copy, to change without changing other islands"
              onClick={makeOwn}
            >
              <Plus size={14} />
              Own
            </button>
          )}
        </div>
      </div>
      <div className="number-profile">
        <div className="number-profile-head">
          <strong>{groupName(active)}</strong>
          <span>
            {following} island{following === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className="text-button"
            disabled={empty}
            onClick={() => edit(d => setProfile(d, active, {}))}
          >
            Reset
          </button>
        </div>
        <Stepper
          label="All numbers"
          value={profile.level ?? 0}
          range={NUMBER_LEVELS}
          names={LEVEL_LABELS}
          set={level => change({ level })}
        />
        <div className="stepper-list">
          {shownTerrains(design, profile).map(kind => (
            <Stepper
              key={kind}
              icon={<TileIcon kind={kind} size={22} />}
              label={KIND_LABELS[kind]}
              value={profile.bias?.[kind] ?? 0}
              range={BIAS_LEVELS}
              names={BIAS_LABELS}
              set={value => setBias(kind, value)}
            />
          ))}
        </div>
        <div className="number-apply">
          <span className="inspector-label">Use for</span>
          <div className="chip-row wrap">
            {SETS.map(({ which, label }) => {
              const keys = islandSet(design, which);
              const done = followsAll(keys);
              return (
                <button
                  key={which}
                  type="button"
                  aria-pressed={done}
                  disabled={!keys.size}
                  onClick={() => edit(d => assignGroup(d, islandSet(d, which), active))}
                >
                  {done && <Check size={14} />}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="inspector-hint">
        Islands that follow the same profile share it, so a change here changes all of them. Own gives one island a copy
        to change alone.
      </p>
      <div className="chip-row">
        <button
          type="button"
          aria-pressed={!!design.noTwoTwelve}
          onClick={() =>
            edit(d => {
              const { noTwoTwelve: _old, ...rest } = d;
              return d.noTwoTwelve ? rest : { ...rest, noTwoTwelve: true };
            })
          }
        >
          No 2s or 12s anywhere
        </button>
      </div>
    </section>
  );
}
