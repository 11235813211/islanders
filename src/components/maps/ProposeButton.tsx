import { Check, Vote } from 'lucide-react';
import type { BoardDesign } from '../../../shared/maps';

/** The host uses a map; `layoutFor` picks the layout made for this many players (maps with several). */
export type Choose = (design: BoardDesign, layoutFor?: number) => void;

/** Putting maps forward in the lobby (everyone seated, the host too). */
export interface Proposing {
  /** Propose this map at this layout, or take the proposal back. */
  toggle: Choose;
  /** This person already proposes or backs this map at this layout. */
  backs: (mapId: string, layoutFor: number | null) => boolean;
  /** How many more maps this person may propose. */
  left: number;
}

/**
 * Propose a map, or take it back. Pressed while this person backs it; disabled once they are
 * at the limit. `full` is the large view's wide button with the layout named.
 */
export default function ProposeButton({
  design,
  propose,
  layoutFor,
  label,
  full = false,
}: {
  design: BoardDesign;
  propose: Proposing;
  layoutFor?: number;
  /** The words on a full-width button (default "Propose"). */
  label?: string;
  full?: boolean;
}) {
  const mine = propose.backs(design.id, layoutFor ?? null);
  const word = mine ? 'Proposed' : (label ?? 'Propose');
  return (
    <button
      type="button"
      className={`button ${full ? 'secondary full' : 'secondary'}`}
      aria-pressed={mine}
      aria-label={full ? undefined : `Propose ${design.name}`}
      title={!mine && !propose.left ? 'You have proposed the most maps you can. Take one back first.' : undefined}
      disabled={!mine && !propose.left}
      onClick={() => propose.toggle(design, layoutFor)}
    >
      {mine ? <Check size={16} /> : <Vote size={16} />}
      {word}
    </button>
  );
}
