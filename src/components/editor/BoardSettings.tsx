import { AlertTriangle, Anchor, Dices, Eraser, Hash, Mountain } from 'lucide-react';
import type { BoardCategory, BoardDesign, FillKind } from '../../../shared/maps';
import { autoHarbors } from '../../../shared/maps';
import { clearNumbers, designWarnings, fillLand, fillNumbers } from '../../../shared/maps/edit';
import { POOL_KINDS } from '../../../shared/maps/validate';
import { VICTORY_POINT_RANGE } from '../../../shared/settings';
import { RESOURCES } from '../../../shared/types';
import { RESOURCE_LABELS } from '../ResourceHand';
import { KIND_LABELS, KindSwatch } from './Inspector';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;

/** Harbors to place automatically: about one per two land tiles of coast, like the base game's 9 for 19. */
const harborTarget = (design: BoardDesign) =>
  Math.max(3, Math.round(design.tiles.filter(t => t.kind !== 'sea' && t.kind !== 'iceberg').length / 2.1));

/** Everything about the board as a whole: name, players, random mix, and one-click fills. */
export default function BoardSettings({
  design,
  categories,
  edit,
}: {
  design: BoardDesign;
  categories: BoardCategory[];
  edit: Edit;
}) {
  const set = (patch: Partial<BoardDesign>, group?: string) => edit(d => ({ ...d, ...patch }), group);
  const counts = new Map<string, number>();
  for (const t of design.tiles) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
  const numbered = design.tiles.filter(t => t.number !== undefined).length;
  const warnings = designWarnings(design);
  return (
    <section className="inspector-section" aria-label="Board settings">
      <h3>Board</h3>
      <label className="inspector-field">
        <span className="inspector-label">Name</span>
        <input value={design.name} maxLength={40} onChange={e => set({ name: e.target.value }, 'name')} />
      </label>
      <label className="inspector-field">
        <span className="inspector-label">Description</span>
        <textarea
          rows={2}
          maxLength={120}
          value={design.description}
          onChange={e => set({ description: e.target.value }, 'description')}
        />
      </label>
      <div className="inspector-columns">
        <label className="inspector-field">
          <span className="inspector-label">Category</span>
          <select value={design.categoryId} onChange={e => set({ categoryId: e.target.value })}>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="inspector-field">
          <span className="inspector-label">Points to win</span>
          <input
            type="number"
            min={VICTORY_POINT_RANGE.min}
            max={VICTORY_POINT_RANGE.max}
            value={design.victoryPoints}
            onChange={e => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= VICTORY_POINT_RANGE.min && n <= VICTORY_POINT_RANGE.max)
                set({ victoryPoints: n });
            }}
          />
        </label>
      </div>
      <div className="inspector-field">
        <span className="inspector-label">Players</span>
        <div className="inspector-columns">
          {(['min', 'max'] as const).map(end => (
            <select
              key={end}
              aria-label={end === 'min' ? 'Fewest players' : 'Most players'}
              value={design.players[end]}
              onChange={e => {
                const n = Number(e.target.value);
                const players = { ...design.players, [end]: n };
                if (players.min > players.max) players[end === 'min' ? 'max' : 'min'] = n;
                set({ players });
              }}
            >
              {[2, 3, 4].map(n => (
                <option key={n} value={n}>
                  {end === 'min' ? `From ${n}` : `To ${n}`}
                </option>
              ))}
            </select>
          ))}
        </div>
      </div>

      <div className="inspector-field">
        <span className="inspector-label">Random land mix</span>
        <div className="pool-grid">
          {POOL_KINDS.map((kind: FillKind) => (
            <label key={kind} className="pool-row" title="Share of random land tiles. 0 leaves this terrain out.">
              <KindSwatch kind={kind} />
              <span>{KIND_LABELS[kind]}</span>
              <input
                type="number"
                min={0}
                max={20}
                aria-label={`${KIND_LABELS[kind]} share`}
                value={design.pool[kind] ?? 0}
                onChange={e => {
                  const n = Math.max(0, Math.min(20, Math.round(Number(e.target.value) || 0)));
                  set({ pool: { ...design.pool, [kind]: n } });
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
                set({
                  harborExclude: design.harborExclude.includes(r)
                    ? design.harborExclude.filter(x => x !== r)
                    : [...design.harborExclude, r],
                })
              }
            >
              {RESOURCE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <div className="inspector-actions">
        <button type="button" className="button secondary" onClick={() => edit(d => fillLand(d))}>
          <Mountain size={16} />
          Fill land
        </button>
        <button type="button" className="button secondary" onClick={() => edit(d => fillNumbers(d))}>
          <Dices size={16} />
          Fill numbers
        </button>
        <button type="button" className="button secondary" onClick={() => edit(clearNumbers)}>
          <Hash size={16} />
          Random numbers
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            edit(d => ({
              ...d,
              harbors: [...d.harbors, ...autoHarbors(d.tiles, harborTarget(d) - d.harbors.length, d.harbors)],
            }))
          }
        >
          <Anchor size={16} />
          Place harbors
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
