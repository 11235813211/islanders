import { AlertTriangle } from 'lucide-react';
import { type BoardDesign, POOL_PRESETS, type Pool, tileKey } from '../../../shared/maps';
import { designWarnings, islandOf } from '../../../shared/maps/edit';
import { POOL_KINDS } from '../../../shared/maps/validate';
import type { EditorSelection } from './EditorCanvas';
import FogSettings from './FogSettings';
import PoolRow from './PoolRow';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;

const LAND_KINDS = POOL_KINDS.filter(k => k !== 'iceberg');
const PRESETS: { id: keyof typeof POOL_PRESETS; label: string; hint: string }[] = [
  { id: 'base', label: 'Base', hint: 'The base game: forest, pasture, fields, hills, mountains, one desert' },
  { id: 'tropic', label: 'Tropic', hint: 'Base terrains plus gold, jungles, and a volcano; no desert' },
  { id: 'polar', label: 'Polar', hint: 'Base terrains, with icebergs on a tenth of the sea' },
  { id: 'all', label: 'All', hint: 'Every terrain, including icebergs on the sea' },
];

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
 * icebergs on the sea, the board's counts, and warnings about unplayable
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
      {hasFog && <FogSettings design={design} edit={edit} selection={selection} />}
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
