import { AlertTriangle, Anchor, Dices, Eraser, Hash, Mountain, Ship } from 'lucide-react';
import type { BoardDesign, FillKind } from '../../../shared/maps';
import {
  clearNumbers,
  designWarnings,
  fillHarbors,
  fillLand,
  fillNumbers,
  placeHarbors,
} from '../../../shared/maps/edit';
import { POOL_KINDS } from '../../../shared/maps/validate';
import { RESOURCES } from '../../../shared/types';
import { RESOURCE_LABELS } from '../ResourceHand';
import { TileIcon } from './BrushPicker';
import { KIND_LABELS } from './tools';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;
/** A fill that draws again on each press (see BoardEditor's `refill`). */
export type Refill = (key: string, fill: (design: BoardDesign, random: () => number) => BoardDesign) => void;

/** Round to tenths, so the 0.1 steps don't drift (0.30000000000000004). */
const tenths = (n: number) => Math.round(n * 10) / 10;

/**
 * Random fill: the terrain mix for random land, harbor exclusions, and fills that draw again
 * each time they are pressed. Warnings about unplayable boards sit at the bottom.
 */
export default function BoardSettings({ design, edit, refill }: { design: BoardDesign; edit: Edit; refill: Refill }) {
  const counts = new Map<string, number>();
  for (const t of design.tiles) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
  const numbered = design.tiles.filter(t => t.number !== undefined).length;
  const warnings = designWarnings(design);
  return (
    <section className="inspector-section" aria-label="Random fill">
      <h3>Random fill</h3>
      <div className="inspector-field">
        <span className="inspector-label">Random land mix</span>
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
      </div>
      <div className="inspector-field">
        <span className="inspector-label">Random harbors never give</span>
        <div className="chip-row wrap">
          {RESOURCES.map(r => (
            <button
              key={r}
              type="button"
              aria-pressed={design.harborExclude.includes(r)}
              onClick={() =>
                edit(d => ({
                  ...d,
                  harborExclude: d.harborExclude.includes(r)
                    ? d.harborExclude.filter(x => x !== r)
                    : [...d.harborExclude, r],
                }))
              }
            >
              {RESOURCE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>
      <p className="inspector-hint">Fills draw again each time you press them, until you change something else.</p>
      <div className="inspector-actions">
        <button type="button" className="button secondary" onClick={() => refill('land', fillLand)}>
          <Mountain size={16} />
          Fill land
        </button>
        <button type="button" className="button secondary" onClick={() => refill('numbers', fillNumbers)}>
          <Dices size={16} />
          Fill numbers
        </button>
        <button type="button" className="button secondary" onClick={() => edit(clearNumbers)}>
          <Hash size={16} />
          Clear numbers
        </button>
        <button type="button" className="button secondary" onClick={() => refill('place-harbors', placeHarbors)}>
          <Anchor size={16} />
          Place harbors
        </button>
        <button type="button" className="button secondary" onClick={() => refill('fill-harbors', fillHarbors)}>
          <Ship size={16} />
          Fill harbors
        </button>
        <button type="button" className="button secondary" onClick={() => edit(d => ({ ...d, harbors: [] }))}>
          <Eraser size={16} />
          Clear harbors
        </button>
      </div>
      <p className="inspector-stats">
        {design.tiles.length} tiles · {counts.get('land') ?? 0} random land · {counts.get('sea') ?? 0} sea ·{' '}
        {design.harbors.length} harbors · {numbered} fixed numbers
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
