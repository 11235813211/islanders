import { AlertTriangle } from 'lucide-react';
import type { BoardDesign, FillKind } from '../../../shared/maps';
import { designWarnings } from '../../../shared/maps/edit';
import { POOL_KINDS } from '../../../shared/maps/validate';
import { TileIcon } from './BrushPicker';
import { KIND_LABELS } from './tools';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;

/** Round to tenths, so the 0.1 steps don't drift (0.30000000000000004). */
const tenths = (n: number) => Math.round(n * 10) / 10;

/**
 * The terrain mix random land is drawn from, the board's counts, and warnings about unplayable
 * boards. The fills themselves are in the top bar (FillBar).
 */
export default function BoardSettings({ design, edit }: { design: BoardDesign; edit: Edit }) {
  const counts = new Map<string, number>();
  for (const t of design.tiles) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
  const numbered = design.tiles.filter(t => t.number !== undefined).length;
  const warnings = designWarnings(design);
  return (
    <section className="inspector-section" aria-label="Random land mix">
      <h3>Random land mix</h3>
      <div className="pool-grid">
        {POOL_KINDS.map((kind: FillKind) => (
          <label key={kind} className="pool-row" title="Share of random land tiles. 0 leaves this terrain out.">
            <TileIcon kind={kind} size={22} />
            <span>{KIND_LABELS[kind]}</span>
            <input
              type="number"
              min={0}
              max={20}
              step={0.1}
              aria-label={`${KIND_LABELS[kind]} share`}
              value={design.pool[kind] ?? 0}
              onChange={e => {
                const n = tenths(Math.max(0, Math.min(20, Number(e.target.value) || 0)));
                edit(d => ({ ...d, pool: { ...d.pool, [kind]: n } }), `pool-${kind}`);
              }}
            />
          </label>
        ))}
      </div>
      <p className="inspector-stats">
        {design.tiles.length} tiles · {counts.get('land') ?? 0} random land · {counts.get('sea') ?? 0} sea ·{' '}
        {design.harbors.length} harbors · {numbered} fixed numbers
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
