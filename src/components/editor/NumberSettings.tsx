import { Check, Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { type BoardDesign, type FillKind, NUMBER_KINDS, type NumberLevels } from '../../../shared/maps';
import { NUMBER_LEVELS } from '../../../shared/maps/balance';
import {
  fogIslandsOf,
  islandLevels,
  islandSet,
  islandsOf,
  randomTerrains,
  regionOf,
  sameLevels,
  setIslandLevels,
} from '../../../shared/maps/numbers';
import { type DesignTile, tileKey } from '../../../shared/maps/types';
import { TileIcon } from './BrushPicker';
import type { EditorSelection } from './EditorCanvas';
import { levelHint, levelName, levelTone } from './levels';
import { KIND_LABELS } from './tools';
import './numbers.css';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;

const SETS = [
  { which: 'all', label: 'All islands' },
  { which: 'closed', label: 'Closed islands' },
  { which: 'open', label: 'Open islands' },
  { which: 'fog', label: 'Fog' },
] as const;

/** One labeled − value + control. A null value shows "Mixed" and steps from `from`. */
function Stepper({
  icon,
  label,
  value,
  from = value ?? 0,
  noEnds,
  set,
}: {
  icon?: ReactNode;
  label: string;
  value: number | null;
  from?: number;
  noEnds: boolean;
  set: (value: number) => void;
}) {
  return (
    <div className="stepper-row">
      {icon ?? <span aria-hidden="true" />}
      <span className="stepper-name">{label}</span>
      <div className="stepper" role="group" aria-label={label}>
        <button
          type="button"
          aria-label={`${label} poorer`}
          disabled={value !== null && value <= -NUMBER_LEVELS}
          onClick={() => set(Math.max(-NUMBER_LEVELS, from - 1))}
        >
          <Minus size={14} />
        </button>
        <output
          className={`stepper-value ${value === null ? '' : levelTone(value)}`}
          title={value === null ? 'Terrains differ' : levelHint(value, noEnds)}
        >
          {value === null ? 'Mixed' : levelName(value, noEnds)}
        </output>
        <button
          type="button"
          aria-label={`${label} richer`}
          disabled={value !== null && value >= NUMBER_LEVELS}
          onClick={() => set(Math.min(NUMBER_LEVELS, from + 1))}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

/** The selected tile's island (land, or a patch of fog), if one is selected. */
function selectedIsland(design: BoardDesign, selection: EditorSelection): DesignTile[] | null {
  if (selection?.kind !== 'tile') return null;
  const island = regionOf(design, selection.q, selection.r);
  return island.length ? island : null;
}

/** Whether every island holding `keys` already has these levels. */
function allHave(design: BoardDesign, keys: Set<string>, levels: NumberLevels): boolean {
  const islands = [...islandsOf(design), ...fogIslandsOf(design)].filter(island =>
    island.some(t => keys.has(tileKey(t.q, t.r))),
  );
  return islands.length > 0 && islands.every(island => sameLevels(islandLevels(island), levels));
}

/** The "All numbers" row: the level every listed terrain shares, or null (with a rounded middle to step from). */
function overall(levels: NumberLevels, kinds: FillKind[]): { value: number | null; from: number } {
  const values = kinds.map(k => levels[k] ?? 0);
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  return { value: values.every(v => v === values[0]) ? (values[0] ?? 0) : null, from: Math.round(mean) };
}

/** No 2s or 12s anywhere: a board-wide switch. */
function NoEndsToggle({ design, edit }: { design: BoardDesign; edit: Edit }) {
  return (
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
  );
}

/**
 * Random numbers for the selected island: one level per terrain it may hold (All numbers sets
 * them all at once), copying those levels to other islands, and no 2s or 12s.
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
  const island = selectedIsland(design, selection);
  const noEnds = !!design.noTwoTwelve;
  const kinds = island ? randomTerrains(design, island) : [];
  const levels = island ? islandLevels(island) : {};
  const keys = new Set(island?.map(t => tileKey(t.q, t.r)));
  const group = `numbers-${island ? tileKey(island[0]!.q, island[0]!.r) : ''}`;
  const write = (next: NumberLevels) => edit(d => setIslandLevels(d, keys, next), group);
  const all = overall(levels, kinds);
  const fog = island?.[0]?.kind === 'fog';
  const randomCount = island?.filter(t => t.number === undefined).length ?? 0;

  return (
    <section className="inspector-section number-settings" aria-label="Random numbers">
      <h3>Random numbers</h3>
      {!island && <p className="inspector-hint">Select an island or fog to set how rich its random numbers are.</p>}
      {island && !kinds.length && <p className="inspector-hint">Every number on this island is set.</p>}
      {island && kinds.length > 0 && (
        <div className="number-profile">
          <div className="number-profile-head">
            <strong>{fog ? 'This fog' : 'This island'}</strong>
            <span>
              {fog
                ? `${randomCount} fog tile${randomCount === 1 ? '' : 's'}`
                : `${randomCount} random number${randomCount === 1 ? '' : 's'}`}
            </span>
            <button
              type="button"
              className="text-button"
              disabled={!Object.keys(levels).length}
              onClick={() => write({})}
            >
              Reset
            </button>
          </div>
          <Stepper
            label="All numbers"
            value={all.value}
            from={all.from}
            noEnds={noEnds}
            set={value => write(Object.fromEntries(NUMBER_KINDS.map(k => [k, value])))}
          />
          <div className="stepper-list">
            {kinds.map(kind => (
              <Stepper
                key={kind}
                icon={<TileIcon kind={kind} size={22} />}
                label={KIND_LABELS[kind]}
                value={levels[kind] ?? 0}
                noEnds={noEnds}
                set={value => write({ ...levels, [kind]: value })}
              />
            ))}
          </div>
          <div className="number-apply">
            <span className="inspector-label">Copy to</span>
            <div className="chip-row wrap">
              {SETS.map(({ which, label }) => {
                const targets = islandSet(design, which);
                const done = Object.keys(levels).length > 0 && allHave(design, targets, levels);
                return (
                  <button
                    key={which}
                    type="button"
                    aria-pressed={done}
                    disabled={!targets.size}
                    onClick={() => edit(d => setIslandLevels(d, islandSet(d, which), levels))}
                  >
                    {done && <Check size={14} />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {island && kinds.length > 0 && (
        <p className="inspector-hint">
          {levelName(NUMBER_LEVELS, noEnds)} and {levelName(-NUMBER_LEVELS, noEnds)} use only those numbers. The steps
          between lean toward them.
        </p>
      )}
      <NoEndsToggle design={design} edit={edit} />
    </section>
  );
}
