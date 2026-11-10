import type { CSSProperties } from 'react';
import type { BoardDesign, DesignHarbor, DesignTile } from '../../../shared/maps';
import { nextLink } from '../../../shared/maps/edit';
import { setLinks, setNotLinks } from '../../../shared/maps/fill';
import { linkColor } from './EditorLayer';

/**
 * A link choice as one string: a letter ("A": same resource as A), "!A" (any resource but A's),
 * or null (no link).
 */
export type LinkChoice = string | null;

/** Letters in use (linked or "not"), sorted. */
export const usedLinks = (design: BoardDesign) =>
  [
    ...new Set([...design.tiles, ...design.harbors].flatMap(t => [t.link, t.notLink]).filter(Boolean) as string[]),
  ].sort();

/** A tile's or harbor's current choice. */
export const linkChoice = (piece: Pick<DesignTile | DesignHarbor, 'link' | 'notLink'>): LinkChoice =>
  piece.link ?? (piece.notLink ? `!${piece.notLink}` : null);

/** Apply a link choice to tiles and harbors. */
export function applyLink(
  design: BoardDesign,
  tiles: { q: number; r: number }[],
  harbors: { q: number; r: number; side: number }[],
  choice: LinkChoice,
): BoardDesign {
  if (choice?.startsWith('!')) return setNotLinks(design, tiles, harbors, choice.slice(1));
  return setLinks(design, tiles, harbors, choice);
}

/**
 * Pick a link: none, a letter in use or a new one, and with "Not", any resource but that letter's.
 * Used by the inspector and the Link tool.
 */
export default function LinkPicker({
  design,
  value,
  change,
  noneLabel = 'None',
}: {
  design: BoardDesign;
  value: LinkChoice | undefined;
  change: (choice: LinkChoice) => void;
  noneLabel?: string;
}) {
  const not = !!value?.startsWith('!');
  const letter = value ? value.replace('!', '') : null;
  const used = usedLinks(design);
  const fresh = nextLink(design);
  const letters = [...used, ...(used.includes(fresh) || letter === fresh ? [] : [fresh])];
  if (letter && !letters.includes(letter)) letters.push(letter);
  return (
    <div className="chip-row" role="radiogroup" aria-label="Link">
      <button type="button" role="radio" aria-checked={!value} onClick={() => change(null)}>
        {noneLabel}
      </button>
      <button
        type="button"
        className="link-not"
        aria-pressed={not}
        disabled={!letter}
        title="Any resource but the letter's"
        onClick={() => letter && change(not ? letter : `!${letter}`)}
      >
        Not
      </button>
      {letters.map(l => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={letter === l}
          style={{ '--chip': linkColor(l) } as CSSProperties}
          className={`link-chip${letter === l && not ? ' not' : ''}`}
          title={
            used.includes(l)
              ? not
                ? `Any resource but ${l}'s`
                : `Same resource as the other ${l} pieces`
              : 'Start a new link'
          }
          onClick={() => change(not ? `!${l}` : l)}
        >
          {used.includes(l) ? (letter === l && not ? `≠ ${l}` : l) : `+ ${l}`}
        </button>
      ))}
    </div>
  );
}
