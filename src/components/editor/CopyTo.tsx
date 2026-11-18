import { Check } from 'lucide-react';
import type { BoardDesign } from '../../../shared/maps';
import { islandSet } from '../../../shared/maps/numbers';
import './numbers.css';

/** The groups of islands a setting can be copied to. */
export const LAND_SETS = [
  { which: 'all', label: 'All islands' },
  { which: 'closed', label: 'Closed islands' },
  { which: 'open', label: 'Open islands' },
] as const;
const FOG_SET = { which: 'fog', label: 'Fog' } as const;
/** The same groups plus fog, for settings fog islands have too. */
export const LAND_AND_FOG_SETS = [...LAND_SETS, FOG_SET] as const;

type IslandGroup = (typeof LAND_AND_FOG_SETS)[number];

/** "Copy to" chips: each copies the selected island's setting to a group, checked once the group has it. */
export default function CopyTo({
  design,
  sets,
  done,
  copy,
}: {
  design: BoardDesign;
  sets: readonly IslandGroup[];
  /** Whether every island in these tiles already has the setting. */
  done: (targets: Set<string>) => boolean;
  copy: (which: IslandGroup['which']) => void;
}) {
  return (
    <div className="number-apply">
      <span className="inspector-label">Copy to</span>
      <div className="chip-row wrap">
        {sets.map(({ which, label }) => {
          const targets = islandSet(design, which);
          const applied = targets.size > 0 && done(targets);
          return (
            <button
              key={which}
              type="button"
              aria-pressed={applied}
              disabled={!targets.size}
              onClick={() => copy(which)}
            >
              {applied && <Check size={14} />}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
