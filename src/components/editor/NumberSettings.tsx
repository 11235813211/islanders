import type { BoardDesign } from '../../../shared/maps';
import { closedTiles, islandRichness, setClosedRich } from '../../../shared/maps/edit';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;

/** How much richer an island's random numbers are, by level (0 is the normal mix). */
export const RICH_LABELS = ['Normal', 'Better', 'Rich', 'Richer', 'Mostly 6 & 8'];

/** One button per richness level; `value` null (a mix of levels) checks none. */
export function RichChips({
  label,
  value,
  set,
  disabled = false,
}: {
  label: string;
  value: number | null;
  set: (level: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="chip-row wrap" role="radiogroup" aria-label={label}>
      {RICH_LABELS.map((name, level) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={value === level}
          disabled={disabled}
          onClick={() => set(level)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

/** The level every closed island shares, or null when they differ or there are none. */
function closedLevel(design: BoardDesign): number | null {
  const rich = islandRichness(design);
  const levels = new Set([...closedTiles(design)].map(k => rich.get(k) ?? 0));
  return levels.size === 1 ? [...levels][0]! : null;
}

/** Board-wide random number rules: richness on every closed island at once, and no 2s or 12s. */
export default function NumberSettings({ design, edit }: { design: BoardDesign; edit: Edit }) {
  const hasClosed = design.tiles.some(t => t.noSetup);
  return (
    <section className="inspector-section" aria-label="Random numbers">
      <h3>Random numbers</h3>
      <p className="inspector-hint">
        Set one island’s numbers by selecting one of its tiles.
        {hasClosed ? ' Or set every island closed to starting settlements here:' : ''}
      </p>
      {hasClosed && (
        <RichChips
          label="Closed islands' numbers"
          value={closedLevel(design)}
          set={l => edit(d => setClosedRich(d, l))}
        />
      )}
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
