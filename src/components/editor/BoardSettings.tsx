import { AlertTriangle } from 'lucide-react';
import { type BoardDesign, type FillKind, POOL_PRESETS } from '../../../shared/maps';
import { RICH_LEVELS } from '../../../shared/maps/balance';
import { designWarnings } from '../../../shared/maps/edit';
import { ICEBERG_MAX_PERCENT, POOL_KINDS } from '../../../shared/maps/validate';
import { TileIcon } from './BrushPicker';
import { KIND_LABELS } from './tools';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;

/** Round to tenths, so the 0.1 steps don't drift (0.30000000000000004). */
const tenths = (n: number) => Math.round(n * 10) / 10;
const LAND_KINDS = POOL_KINDS.filter(k => k !== 'iceberg');
const PRESETS: { id: keyof typeof POOL_PRESETS; label: string; hint: string }[] = [
  { id: 'base', label: 'Base', hint: 'The base game: forest, pasture, fields, hills, mountains, one desert' },
  { id: 'tropic', label: 'Tropic', hint: 'Base terrains plus gold, jungles, and a volcano; no desert' },
  { id: 'polar', label: 'Polar', hint: 'Base terrains, with icebergs on a tenth of the sea' },
  { id: 'all', label: 'All', hint: 'Every terrain, including icebergs on the sea' },
];
const RICH_LABELS = ['Normal', 'Better', 'Rich', 'Richer', 'Mostly 6 & 8'];

/** A share to turn a terrain back on with: its share in the All preset. */
const defaultShare = (kind: FillKind) => POOL_PRESETS.all[kind] ?? 1;

/** One terrain's row: on/off, then its share (or, for icebergs, the percent of sea). */
function PoolRow({ kind, design, edit }: { kind: FillKind; design: BoardDesign; edit: Edit }) {
  const iceberg = kind === 'iceberg';
  const value = design.pool[kind] ?? 0;
  const set = (n: number) => edit(d => ({ ...d, pool: { ...d.pool, [kind]: n } }), `pool-${kind}`);
  return (
    <div
      className={`pool-row${value ? '' : ' off'}`}
      title={iceberg ? 'Percent of sea tiles that become icebergs' : 'Share of random land tiles'}
    >
      <input
        type="checkbox"
        aria-label={`Use ${KIND_LABELS[kind]}`}
        checked={value > 0}
        onChange={e => set(e.target.checked ? defaultShare(kind) : 0)}
      />
      <TileIcon kind={kind} size={22} />
      <span>{KIND_LABELS[kind]}</span>
      <input
        type="number"
        min={0}
        max={iceberg ? ICEBERG_MAX_PERCENT : 20}
        step={iceberg ? 1 : 0.1}
        aria-label={iceberg ? 'Iceberg percent of sea' : `${KIND_LABELS[kind]} share`}
        value={value}
        onChange={e => {
          const n = Number(e.target.value) || 0;
          set(
            iceberg ? Math.round(Math.max(0, Math.min(ICEBERG_MAX_PERCENT, n))) : tenths(Math.max(0, Math.min(20, n))),
          );
        }}
      />
      {iceberg && <small>% sea</small>}
    </div>
  );
}

/**
 * The terrain mix random land is drawn from, icebergs on the sea, numbers on closed islands, the
 * board's counts, and warnings about unplayable boards. The fills themselves are in the top bar.
 */
export default function BoardSettings({ design, edit }: { design: BoardDesign; edit: Edit }) {
  const counts = new Map<string, number>();
  for (const t of design.tiles) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
  const numbered = design.tiles.filter(t => t.number !== undefined).length;
  const warnings = designWarnings(design);
  const closed = design.tiles.some(t => t.noSetup);
  return (
    <section className="inspector-section" aria-label="Random land mix">
      <h3>Random land mix</h3>
      <fieldset className="chip-row pool-presets" aria-label="Presets">
        {PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            data-tip={p.hint}
            onClick={() => edit(d => ({ ...d, pool: { ...POOL_PRESETS[p.id] } }))}
          >
            {p.label}
          </button>
        ))}
      </fieldset>
      <div className="pool-grid">
        {LAND_KINDS.map(kind => (
          <PoolRow key={kind} kind={kind} design={design} edit={edit} />
        ))}
      </div>
      <div className="pool-grid single">
        <PoolRow kind="iceberg" design={design} edit={edit} />
      </div>
      <label className="pool-rich" title="How much better random numbers are on islands closed to setup settlements">
        <span>Numbers on closed islands</span>
        <select
          value={design.richIslands ?? 0}
          disabled={!closed}
          onChange={e => {
            const level = Number(e.target.value);
            edit(d => {
              const { richIslands: _r, ...rest } = d;
              return level ? { ...rest, richIslands: level } : rest;
            });
          }}
        >
          {RICH_LABELS.slice(0, RICH_LEVELS + 1).map((label, level) => (
            <option key={label} value={level}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p className="inspector-stats">
        {design.tiles.length} tiles · {counts.get('land') ?? 0} random land · {counts.get('sea') ?? 0} sea ·{' '}
        {design.harbors.length ? `${design.harbors.length} harbors` : 'harbors placed at random'} · {numbered} fixed
        numbers
        {design.swapNumbers ? ' (swapped each game)' : ''}
      </p>
      {warnings.map(w => (
        <p key={w} className="map-warning" role="note">
          <AlertTriangle size={16} />
          {w}
        </p>
      ))}
    </section>
  );
}
