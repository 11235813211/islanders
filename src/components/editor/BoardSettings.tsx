import { AlertTriangle } from 'lucide-react';
import {
  type BoardDesign,
  type FillKind,
  FOG_POOL,
  type FogKind,
  POOL_PRESETS,
  type Pool,
  tileKey,
} from '../../../shared/maps';
import { designWarnings, islandOf, tidy } from '../../../shared/maps/edit';
import { FOG_POOL_KINDS, ICEBERG_MAX_PERCENT, POOL_KINDS } from '../../../shared/maps/validate';
import { TileIcon } from './BrushPicker';
import type { EditorSelection } from './EditorCanvas';
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

/** A share to turn a terrain back on with: its share in the All preset (or the fog stack). */
const defaultShare = (kind: FillKind | FogKind) =>
  (POOL_PRESETS.all as Record<string, number>)[kind] ?? FOG_POOL[kind as FogKind] ?? 1;

/** One terrain's row: on/off, then its share (or, for icebergs, the percent of sea). */
function PoolRow({
  kind,
  value,
  set,
  whole = false,
}: {
  kind: FillKind | FogKind;
  value: number;
  set: (n: number) => void;
  /** Whole numbers (exact counts) instead of shares in tenths. */
  whole?: boolean;
}) {
  const iceberg = kind === 'iceberg';
  const integer = iceberg || whole;
  return (
    <div
      className={`pool-row${value ? '' : ' off'}`}
      title={iceberg ? 'Percent of sea tiles that become icebergs' : 'Share of these tiles'}
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
        step={integer ? 1 : 0.1}
        aria-label={iceberg ? 'Iceberg percent of sea' : `${KIND_LABELS[kind]} ${whole ? 'count' : 'share'}`}
        value={value}
        onChange={e => {
          const n = Number(e.target.value) || 0;
          const top = iceberg ? ICEBERG_MAX_PERCENT : 20;
          set(integer ? Math.round(Math.max(0, Math.min(top, n))) : tenths(Math.max(0, Math.min(20, n))));
        }}
      />
      {iceberg && <small>% sea</small>}
    </div>
  );
}

/** The island the selected tile is on, and the key its own mix is stored under (if it has one). */
function selectedIsland(design: BoardDesign, selection: EditorSelection) {
  if (selection?.kind !== 'tile') return null;
  const tiles = islandOf(design, selection.q, selection.r);
  if (!tiles.length) return null;
  const keys = tiles.map(t => tileKey(t.q, t.r));
  const anchor = keys.find(k => design.islandPools?.[k]) ?? null;
  return { size: tiles.length, anchor, start: tileKey(selection.q, selection.r) };
}

/** Set (or with null, remove) one island's own mix. */
function setIslandPool(design: BoardDesign, key: string, pool: Pool | null): BoardDesign {
  const { [key]: _old, ...rest } = design.islandPools ?? {};
  const islandPools = pool ? { ...rest, [key]: pool } : rest;
  const { islandPools: _all, ...base } = design;
  return Object.keys(islandPools).length ? { ...base, islandPools } : base;
}

/**
 * The terrain mix random land is drawn from (the whole board's, or the selected island's own),
 * icebergs on the sea, what fog may hide, the board's counts, and warnings about unplayable
 * boards. The fills themselves are in the top bar.
 */
export default function BoardSettings({
  design,
  edit,
  selection,
}: {
  design: BoardDesign;
  edit: Edit;
  selection: EditorSelection;
}) {
  const counts = new Map<string, number>();
  for (const t of design.tiles) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
  const numbered = design.tiles.filter(t => t.number !== undefined).length;
  const warnings = designWarnings(design);
  const island = selectedIsland(design, selection);
  const ownKey = island?.anchor ?? null;
  const pool: Pool = ownKey ? design.islandPools![ownKey]! : design.pool;
  const setPool = (next: Pool) =>
    edit(d => (ownKey ? setIslandPool(d, ownKey, next) : { ...d, pool: next }), `pool-${ownKey ?? 'board'}`);
  const hasFog = counts.has('fog');
  const fog = design.fogPool ?? FOG_POOL;
  return (
    <section className="inspector-section" aria-label="Random land mix">
      <h3>Random land mix</h3>
      {island && (
        <label className="check-row island-mix">
          <input
            type="checkbox"
            checked={!!ownKey}
            onChange={e =>
              edit(d =>
                e.target.checked
                  ? setIslandPool(d, island.start, { ...d.pool, iceberg: undefined })
                  : setIslandPool(d, ownKey!, null),
              )
            }
          />
          Own mix for this island ({island.size} tile{island.size === 1 ? '' : 's'})
        </label>
      )}
      <p className="inspector-hint">
        {ownKey ? 'Random land on this island draws from this mix.' : 'Random land draws from this mix'}
        {!ownKey && design.islandPools ? ', except islands with their own.' : ownKey ? '' : '.'}
      </p>
      <fieldset className="chip-row pool-presets" aria-label="Presets">
        {PRESETS.map(p => (
          <button key={p.id} type="button" data-tip={p.hint} onClick={() => setPool({ ...POOL_PRESETS[p.id] })}>
            {p.label}
          </button>
        ))}
      </fieldset>
      <div className="pool-grid">
        {LAND_KINDS.map(kind => (
          <PoolRow key={kind} kind={kind} value={pool[kind] ?? 0} set={n => setPool({ ...pool, [kind]: n })} />
        ))}
      </div>
      {!ownKey && (
        <div className="pool-grid single">
          <PoolRow
            kind="iceberg"
            value={design.pool.iceberg ?? 0}
            set={n => edit(d => ({ ...d, pool: { ...d.pool, iceberg: n } }), 'pool-iceberg')}
          />
        </div>
      )}
      {hasFog && (
        <>
          <h3 className="fog-heading">Under the fog</h3>
          <label className="check-row island-mix">
            <input
              type="checkbox"
              checked={!!design.fogExact}
              onChange={e =>
                edit(d => {
                  const { fogExact: _old, ...rest } = d;
                  if (!e.target.checked) return rest;
                  // Whole counts from here on.
                  const counts = Object.fromEntries(
                    Object.entries(d.fogPool ?? FOG_POOL).map(([k, n]) => [k, Math.round(n ?? 0)]),
                  );
                  return { ...rest, fogExact: true, fogPool: counts };
                })
              }
            />
            Exact counts ({counts.get('fog')} fog tile{counts.get('fog') === 1 ? '' : 's'})
          </label>
          <p className="inspector-hint">
            {design.fogExact
              ? 'Exactly this many of each, shuffled under the fog. Land also draws a number.'
              : 'What fog tiles may turn out to be, as shares. Land also draws a number.'}
          </p>
          <div className="pool-grid">
            {FOG_POOL_KINDS.map(kind => (
              <PoolRow
                key={kind}
                kind={kind}
                value={fog[kind] ?? 0}
                whole={design.fogExact}
                // tidy drops harbors on fog once the fog may turn out to be sea.
                set={n => edit(d => tidy({ ...d, fogPool: { ...(d.fogPool ?? FOG_POOL), [kind]: n } }), 'fog-pool')}
              />
            ))}
          </div>
        </>
      )}
      <p className="inspector-stats">
        {design.tiles.length} tiles · {counts.get('land') ?? 0} random land · {counts.get('sea') ?? 0} sea ·{' '}
        {hasFog ? `${counts.get('fog')} fog · ` : ''}
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
