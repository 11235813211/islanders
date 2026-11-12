/** Average dot count (1–5) of the numbers a random token may take, as one short word. */
export function oddsLabel(pips: number[] | undefined): string | null {
  if (!pips?.length || pips.length >= 5) return null;
  const average = pips.reduce((sum, p) => sum + p, 0) / pips.length;
  if (average <= 1.5) return 'Poor';
  if (average <= 2.5) return 'Low';
  if (average < 3.5) return 'Mid';
  if (average < 4.5) return 'High';
  return 'Rich';
}
