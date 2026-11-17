import { Check, Undo2, Vote } from 'lucide-react';
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
 * Propose a map, or take it back. Green and bold while this person backs it (pressing again takes
 * it back); disabled once they are at the limit. `full` is the large view's wide button.
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
  return (
    <button
      type="button"
      className={`button secondary${full ? ' full' : ''}${mine ? ' proposed' : ''}`}
      aria-pressed={mine}
      aria-label={full ? undefined : `${mine ? 'Unpropose' : 'Propose'} ${design.name}`}
      title={!mine && !propose.left ? 'You have proposed the most maps you can. Take one back first.' : undefined}
      disabled={!mine && !propose.left}
      onClick={() => propose.toggle(design, layoutFor)}
    >
      {buttonFace(mine, full, label)}
    </button>
  );
}

/** Icon and words: the large view offers to take a proposal back; a card shows it as done. */
function buttonFace(mine: boolean, full: boolean, label: string | undefined) {
  if (!mine)
    return (
      <>
        <Vote size={16} />
        {label ?? 'Propose'}
      </>
    );
  return full ? (
    <>
      <Undo2 size={16} />
      Unpropose
    </>
  ) : (
    <>
      <Check size={16} />
      Proposed
    </>
  );
}
