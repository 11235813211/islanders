import type { ReactNode } from 'react';
import type { PlaceKind } from '../Board';
import PieceIcon from '../PieceIcon';

/** Piece names in help text. */
const WORDS = /\b(relay stations?|relays?|settlements?|cities|city|roads?|ships?)\b/gi;

/** The piece a matched word names. */
function kindOf(word: string): PlaceKind {
  const w = word.toLowerCase();
  if (w.startsWith('relay')) return 'relay';
  if (w.startsWith('settlement')) return 'settlement';
  if (w.startsWith('cit')) return 'city';
  if (w.startsWith('road')) return 'road';
  return 'ship';
}

/**
 * A help line with a small red piece icon after the first mention of each piece, so the words
 * point at what is drawn on the board. Red for everyone, whatever their seat.
 */
export default function PieceWords({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const seen = new Set<PlaceKind>();
  let at = 0;
  for (const match of text.matchAll(WORDS)) {
    const kind = kindOf(match[0]);
    if (seen.has(kind)) continue;
    seen.add(kind);
    const end = match.index + match[0].length;
    out.push(text.slice(at, end), <PieceIcon key={end} kind={kind} size={18} />);
    at = end;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}
