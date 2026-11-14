import { Check } from 'lucide-react';
import type { BoardDesign, DesignTile, FogMix } from '../../../shared/maps';
import { tidy } from '../../../shared/maps/edit';
import { exactFit, fogIslandOf, fogIslandsOf, fogMixOf, sameFogMix, setFogMix } from '../../../shared/maps/fog';
import { tileKey } from '../../../shared/maps/types';
import { FOG_POOL_KINDS } from '../../../shared/maps/validate';
import type { EditorSelection } from './EditorCanvas';
import PoolRow from './PoolRow';
import './numbers.css';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;

/** The fog island the selected tile is on, if a fog tile is selected. */
function selectedFog(design: BoardDesign, selection: EditorSelection): DesignTile[] | null {
  if (selection?.kind !== 'tile') return null;
  const island = fogIslandOf(design, selection.q, selection.r);
  return island.length ? island : null;
}

/** Every fog tile's key. */
const fogKeys = (design: BoardDesign) =>
  new Set(design.tiles.filter(t => t.kind === 'fog').map(t => tileKey(t.q, t.r)));

/** The same mix in whole counts, for switching a fog island to exact counts. */
const asCounts = (mix: FogMix): FogMix => ({
  pool: Object.fromEntries(Object.entries(mix.pool).map(([k, n]) => [k, Math.round(n ?? 0)])),
  exact: true,
});

/** What the selected fog island's exact counts say about its size, or its usual hint. */
function fogHint(island: DesignTile[], mix: FogMix): string {
  const fit = exactFit(island, mix);
  if (fit === 'exact') return 'Exactly this many of each, shuffled under this fog. Land also draws a number.';
  if (fit === 'short') return 'At least this many of each; the rest are drawn from these shares.';
  if (fit === 'over') return 'More than this fog holds: its tiles are drawn from these counts at random.';
  return 'What this fog may turn out to be, as shares. Land also draws a number.';
}

/** "Under the fog": what the selected fog island may hide, and copying that to the other fog islands. */
export default function FogSettings({
  design,
  edit,
  selection,
}: {
  design: BoardDesign;
  edit: Edit;
  selection: EditorSelection;
}) {
  const island = selectedFog(design, selection);
  const islands = fogIslandsOf(design);
  if (!island)
    return (
      <section aria-label="Under the fog">
        <h3 className="fog-heading">Under the fog</h3>
        <p className="inspector-hint">
          Select fog to set what it hides. Each fog island ({islands.length}) has its own mix.
        </p>
      </section>
    );
  const mix = fogMixOf(island);
  const keys = new Set(island.map(t => tileKey(t.q, t.r)));
  // tidy drops harbors on fog once that fog may turn out to be sea.
  const write = (next: FogMix) =>
    edit(d => tidy(setFogMix(d, keys, next)), `fog-${tileKey(island[0]!.q, island[0]!.r)}`);
  const others = islands.filter(other => !other.some(t => keys.has(tileKey(t.q, t.r))));
  const copied = others.length > 0 && others.every(other => sameFogMix(fogMixOf(other), mix));
  return (
    <section aria-label="Under the fog">
      <h3 className="fog-heading">Under the fog</h3>
      <div className="number-profile">
        <div className="number-profile-head">
          <strong>This fog</strong>
          <span>
            {island.length} fog tile{island.length === 1 ? '' : 's'}
          </span>
        </div>
        <label className="check-row island-mix">
          <input
            type="checkbox"
            checked={!!mix.exact}
            onChange={e => write(e.target.checked ? asCounts(mix) : { pool: mix.pool })}
          />
          Exact counts
        </label>
        <p className="inspector-hint">{fogHint(island, mix)}</p>
        <div className="pool-grid">
          {FOG_POOL_KINDS.map(kind => (
            <PoolRow
              key={kind}
              kind={kind}
              value={mix.pool[kind] ?? 0}
              whole={mix.exact}
              set={n => write({ ...mix, pool: { ...mix.pool, [kind]: n } })}
            />
          ))}
        </div>
        {others.length > 0 && (
          <div className="number-apply">
            <span className="inspector-label">Copy to</span>
            <div className="chip-row wrap">
              <button
                type="button"
                aria-pressed={copied}
                onClick={() => edit(d => tidy(setFogMix(d, fogKeys(d), mix)))}
              >
                {copied && <Check size={14} />}
                Other fog islands ({others.length})
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
