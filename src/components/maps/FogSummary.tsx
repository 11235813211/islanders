import type { BoardDesign, DesignTile, FogKind } from '../../../shared/maps';
import { exactFit, fogIslandsOf, fogKinds, fogMixOf, sameFogMix } from '../../../shared/maps/fog';
import { TileIcon } from '../editor/BrushPicker';
import { KIND_LABELS } from '../editor/tools';

/** How sure an outlook's amounts are: exactly, at least (counts topped up at random), or about (on average). */
export type FogCertainty = 'exactly' | 'at least' | 'about';

/** What one fog island, or several alike, holds. Amounts are per island. */
export interface FogOutlook {
  islands: number;
  size: number;
  certainty: FogCertainty;
  kinds: [FogKind, number][];
}

/**
 * What one fog island holds: exact counts when they fill it, at least the counts when they fall
 * short (the rest drawn from them as shares), otherwise how many of each to expect on average.
 */
function islandOutlook(island: DesignTile[]): Omit<FogOutlook, 'islands'> {
  const mix = fogMixOf(island);
  const fit = exactFit(island, mix);
  const kinds = fogKinds(mix);
  const sum = kinds.reduce((n, [, w]) => n + w, 0) || 1;
  const certainty: FogCertainty = fit === 'exact' ? 'exactly' : fit === 'short' ? 'at least' : 'about';
  const amounts = kinds
    .map(([k, w]): [FogKind, number] => [k, certainty === 'about' ? (island.length * w) / sum : Math.round(w)])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  return { size: island.length, certainty, kinds: amounts };
}

/** What a layout's fog holds, one entry per group of fog islands of the same size and mix. */
export function fogOutlooks(design: BoardDesign): FogOutlook[] {
  const groups: { island: DesignTile[]; count: number }[] = [];
  for (const island of fogIslandsOf(design)) {
    const alike = groups.find(
      g => g.island.length === island.length && sameFogMix(fogMixOf(g.island), fogMixOf(island)),
    );
    if (alike) alike.count++;
    else groups.push({ island, count: 1 });
  }
  return groups.map(g => ({ ...islandOutlook(g.island), islands: g.count }));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "3 fog tiles", "A fog island of 3 tiles", or "2 fog islands of 3 tiles". */
function groupName(outlook: FogOutlook, only: boolean): string {
  if (outlook.islands > 1) return `${outlook.islands} fog islands of ${plural(outlook.size, 'tile')}`;
  return only ? plural(outlook.size, 'fog tile') : `A fog island of ${plural(outlook.size, 'tile')}`;
}

/** What follows the name: how sure the amounts are, and that they are per island when there are several. */
function lead(outlook: FogOutlook): string {
  const each = outlook.islands > 1;
  if (outlook.certainty === 'about')
    return `each tile drawn at random. Expect about this many${each ? ' on each' : ''}:`;
  return `${each ? 'each ' : ''}holding ${outlook.certainty}:`;
}

/** One group's line and amounts. */
function OutlookList({ outlook, only }: { outlook: FogOutlook; only: boolean }) {
  const amount = (n: number) => `${Math.round(n * 10) / 10}`;
  return (
    <>
      <p>
        {groupName(outlook, only)}, {lead(outlook)}
      </p>
      <ul>
        {outlook.kinds.map(([kind, n]) => (
          <li key={kind}>
            <TileIcon kind={kind} size={20} />
            <span>{KIND_LABELS[kind]}</span>
            <strong>{amount(n)}</strong>
          </li>
        ))}
      </ul>
    </>
  );
}

/** "Under the fog" in a map's details: what players can expect to find when exploring each fog island. */
export default function FogSummary({ design }: { design: BoardDesign }) {
  const outlooks = fogOutlooks(design);
  if (!outlooks.length) return null;
  return (
    <section className="fog-summary" aria-label="Under the fog">
      <h4>Under the fog</h4>
      {outlooks.map((outlook, i) => (
        <OutlookList key={i} outlook={outlook} only={outlooks.length === 1} />
      ))}
      <p className="map-note">A road or ship reaching a fog tile reveals it; land pays its finder one card.</p>
    </section>
  );
}
