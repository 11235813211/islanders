import { AlertTriangle } from 'lucide-react';
import { type BoardDesign, type FillKind, type LandMix, POOL_PRESETS, type Pool, tileKey } from '../../../shared/maps';
import { designWarnings, islandOf } from '../../../shared/maps/edit';
import { allHaveMix, landMixOf, setIslandMix } from '../../../shared/maps/land-mix';
import { islandSet } from '../../../shared/maps/numbers';
import { POOL_KINDS } from '../../../shared/maps/validate';
import CopyTo, { LAND_SETS } from './CopyTo';
import type { EditorSelection } from './EditorCanvas';
import FogSettings from './FogSettings';
import PoolRow from './PoolRow';
import { KIND_LABELS } from './tools';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;

const LAND_KINDS = POOL_KINDS.filter(k => k !== 'iceberg');
const PRESETS: { id: keyof typeof POOL_PRESETS; label: string; hint: string }[] = [
  { id: 'base', label: 'Base', hint: 'The base game: forest, pasture, fields, hills, mountains, one desert' },
  { id: 'tropic', label: 'Tropic', hint: 'Base terrains plus gold, jungles, and a volcano; no desert' },
  { id: 'polar', label: 'Polar', hint: 'Base terrains, with icebergs on a tenth of the sea' },
  { id: 'all', label: 'All', hint: 'Every terrain, including icebergs on the sea' },
];

/** The island the selected tile is on: its tile keys, size, and its own mix (if it has one). */
function selectedIsland(design: BoardDesign, selection: EditorSelection) {
  if (selection?.kind !== 'tile') return null;
  const tiles = islandOf(design, selection.q, selection.r);
  if (!tiles.length) return null;
  return { keys: new Set(tiles.map(t => tileKey(t.q, t.r))), size: tiles.length, mix: landMixOf(tiles) };
}

/** The terrains the board's mix gives as exact counts. */
const boardExact = (design: BoardDesign) => design.exactMix?.[''] ?? [];

/** Set which terrains of the board's mix are exact counts. */
function setBoardExact(design: BoardDesign, kinds: FillKind[]): BoardDesign {
  const { exactMix: _all, ...base } = design;
  return kinds.length ? { ...base, exactMix: { '': kinds } } : base;
}

/** `kinds` with one terrain marked exact or not. */
const markExact = (kinds: FillKind[], kind: FillKind, on: boolean) => [
  ...kinds.filter(k => k !== kind),
  ...(on ? [kind] : []),
];

/** What the mix panel says it is editing, so an edit never lands on the wrong mix unnoticed. */
function MixScope({ own, others }: { own: boolean; others: boolean }) {
  return (
    <p className="inspector-hint">
      <strong>{own ? 'This island.' : 'Whole board.'}</strong>{' '}
      {own
        ? 'Only random land on this island draws from this mix.'
        : `Random land draws from this mix${others ? ', except islands with their own.' : '.'}`}
    </p>
  );
}

/** Says which terrains are exact counts and that the rest share what's left. */
function ExactNote({ pool, exact }: { pool: Pool; exact: Set<FillKind> }) {
  const listed = [...exact].map(k => `${pool[k] ?? 0} ${KIND_LABELS[k]}`).join(', ');
  return (
    <p className="pool-exact-note" role="note">
      Red checks are exact counts: {listed}. The other terrains share the remaining tiles.
    </p>
  );
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
  const own: LandMix | undefined = island?.mix;
  const pool: Pool = own?.pool ?? design.pool;
  const exactKinds = own ? (own.exact ?? []) : boardExact(design);
  const exact = new Set(exactKinds);
  const group = `pool-${own ? [...island!.keys][0] : 'board'}`;
  /** Write the mix being shown: the island's own, or the board's. */
  const writeMix = (d: BoardDesign, next: Pool, kinds: FillKind[]) =>
    own ? setIslandMix(d, island!.keys, { pool: next, exact: kinds }) : setBoardExact({ ...d, pool: next }, kinds);
  const setPool = (next: Pool) => edit(d => writeMix(d, next, exactKinds), group);
  /** One terrain's share or exact count, saved with whether it is exact in one edit. */
  const setKind = (kind: FillKind, n: number, isExact = false) =>
    edit(d => writeMix(d, { ...pool, [kind]: n }, markExact(exactKinds, kind, isExact && n > 0)), group);
  const othersOwn = design.tiles.some(t => t.landMix);
  const hasFog = counts.has('fog');
  return (
    <section className="inspector-section" aria-label="Random land mix">
      <h3>Random land mix</h3>
      {island && (
        <label className="check-row island-mix">
          <input
            type="checkbox"
            checked={!!own}
            onChange={e =>
              edit(d => setIslandMix(d, island.keys, e.target.checked ? { pool: d.pool, exact: boardExact(d) } : null))
            }
          />
          Own mix for this island ({island.size} tile{island.size === 1 ? '' : 's'})
        </label>
      )}
      <MixScope own={!!own} others={othersOwn} />
      <fieldset className="chip-row pool-presets" aria-label="Presets">
        {PRESETS.map(p => (
          <button key={p.id} type="button" data-tip={p.hint} onClick={() => setPool({ ...POOL_PRESETS[p.id] })}>
            {p.label}
          </button>
        ))}
      </fieldset>
      <div className="pool-grid">
        {LAND_KINDS.map(kind => (
          <PoolRow
            key={kind}
            kind={kind}
            value={pool[kind] ?? 0}
            exact={exact.has(kind)}
            set={(n, isExact) => setKind(kind, n, isExact)}
          />
        ))}
      </div>
      {exact.size > 0 && <ExactNote pool={pool} exact={exact} />}
      {own && (
        <CopyTo
          design={design}
          sets={LAND_SETS}
          done={targets => allHaveMix(design, targets, own)}
          copy={which => edit(d => setIslandMix(d, islandSet(d, which), own))}
        />
      )}
      {!own && (
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
