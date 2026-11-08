import type { CSSProperties } from 'react';
import type { BoardDesign } from '../../../shared/maps';
import { nextLink } from '../../../shared/maps/edit';
import { linkColor } from './EditorLayer';

/** Letters in use, sorted. */
export const usedLinks = (design: BoardDesign) =>
  [...new Set([...design.tiles, ...design.harbors].map(t => t.link).filter(Boolean) as string[])].sort();

/** Pick a link letter: none, one already in use, or a new one. Used by the inspector and the Link tool. */
export default function LinkPicker({
  design,
  value,
  change,
  noneLabel = 'None',
}: {
  design: BoardDesign;
  value: string | null | undefined;
  change: (link: string | null) => void;
  noneLabel?: string;
}) {
  const used = usedLinks(design);
  const fresh = nextLink(design);
  const letters = [...used, ...(used.includes(fresh) || value === fresh ? [] : [fresh])];
  if (value && !letters.includes(value)) letters.push(value);
  return (
    <div className="chip-row" role="radiogroup" aria-label="Link">
      <button type="button" role="radio" aria-checked={!value} onClick={() => change(null)}>
        {noneLabel}
      </button>
      {letters.map(letter => (
        <button
          key={letter}
          type="button"
          role="radio"
          aria-checked={value === letter}
          style={{ '--chip': linkColor(letter) } as CSSProperties}
          className="link-chip"
          title={used.includes(letter) ? `Same resource as the other ${letter} pieces` : 'Start a new link'}
          onClick={() => change(letter)}
        >
          {used.includes(letter) ? letter : `+ ${letter}`}
        </button>
      ))}
    </div>
  );
}
