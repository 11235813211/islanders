import { RESOURCES, type Resource, type ResourceBag, type SplitChoice, TILE_RESOURCES } from './types';

/**
 * Cards a player picks after a roll: gold fields and volcanoes pay any resource, and split tiles
 * (Cartographers) pay one of their two. `pendingGold` holds the total owed and `pendingSplit` the
 * part of it that split tiles limit. Shared by the engine, the bots, and the gold panel.
 */
export interface ChoiceGroup {
  options: readonly Resource[];
  count: number;
}

/** The owed picks as groups: split tiles first (they are the tighter ones), then any free picks. */
export function choiceGroups(total: number, splits: readonly SplitChoice[] = []): ChoiceGroup[] {
  const limited = splits.reduce((n, s) => n + s.count, 0);
  const free = Math.max(0, total - limited);
  return [...splits.filter(s => s.count > 0), ...(free ? [{ options: TILE_RESOURCES, count: free }] : [])];
}

/** Every set of tile resources (gold never pays a commodity), as bit masks over TILE_RESOURCES (64 of them). */
const SUBSETS: Resource[][] = Array.from({ length: 1 << TILE_RESOURCES.length }, (_, mask) =>
  TILE_RESOURCES.filter((_, i) => mask & (1 << i)),
);

/**
 * The most cards these groups can take from `stock` (how many of each resource are there). A
 * max flow worked out by its cut: for every set of resources, the stock of those plus every group
 * that could also take something outside them.
 */
export function choiceLimit(groups: readonly ChoiceGroup[], stock: Record<Resource, number>): number {
  let best = Number.POSITIVE_INFINITY;
  for (const set of SUBSETS) {
    let cut = set.reduce((n, r) => n + stock[r], 0);
    for (const group of groups) if (group.options.some(r => !set.includes(r))) cut += group.count;
    best = Math.min(best, cut);
  }
  return best;
}

/** Can every card in `bag` be dealt to a group that allows it (Hall's condition over resource sets)? */
export function choiceFits(bag: ResourceBag, groups: readonly ChoiceGroup[]): boolean {
  return SUBSETS.every(set => {
    const wanted = set.reduce((n, r) => n + bag[r], 0);
    const room = groups.filter(g => g.options.some(r => set.includes(r))).reduce((n, g) => n + g.count, 0);
    return wanted <= room;
  });
}

/**
 * A pick that fits and that `stock` can pay, card by card in the order `rank` prefers (best first),
 * as many cards as can be paid (at most `cap`). Each card is kept only if the rest can still be
 * filled, so a greedy choice never strands a split tile whose other half is gone.
 */
export function fillChoice(
  groups: readonly ChoiceGroup[],
  stock: Record<Resource, number>,
  rank: (options: readonly Resource[], bag: ResourceBag) => Resource[],
  cap = Number.POSITIVE_INFINITY,
): ResourceBag {
  const bag = Object.fromEntries(RESOURCES.map(r => [r, 0])) as ResourceBag;
  const left = { ...stock };
  const target = Math.min(cap, choiceLimit(groups, stock));
  // Tight groups first: they have the fewest ways to be paid.
  const open = [...groups].sort((a, b) => a.options.length - b.options.length).map(g => ({ ...g }));
  let taken = 0;
  for (const group of open)
    while (group.count > 0 && taken < target) {
      group.count--;
      const pick = rank(group.options, bag).find(r => {
        if (left[r] <= 0) return false;
        left[r]--;
        const fits = taken + 1 + choiceLimit(open, left) >= target;
        left[r]++;
        return fits;
      });
      if (!pick) continue;
      left[pick]--;
      bag[pick]++;
      taken++;
    }
  return bag;
}
