import { type BoardDesign, FOG_POOL, type FogKind } from '../../../shared/maps';
import { TileIcon } from '../editor/BrushPicker';
import { KIND_LABELS } from '../editor/tools';

/** What a map's fog tiles hold: exact counts, or how many of each to expect on average. */
export function fogOutlook(design: BoardDesign): { total: number; exact: boolean; kinds: [FogKind, number][] } | null {
  const total = design.tiles.filter(t => t.kind === 'fog').length;
  if (!total) return null;
  const mix = Object.entries(design.fogPool ?? FOG_POOL).filter(([, n]) => (n ?? 0) > 0) as [FogKind, number][];
  const sum = mix.reduce((n, [, w]) => n + w, 0) || 1;
  const exact = !!design.fogExact;
  const kinds = mix
    .map(([k, w]): [FogKind, number] => [k, exact ? Math.round(w) : (total * w) / sum])
    .sort((a, b) => b[1] - a[1]);
  return { total, exact, kinds };
}

/** "Under the fog" in a map's details: what players can expect to find when exploring. */
export default function FogSummary({ design }: { design: BoardDesign }) {
  const outlook = fogOutlook(design);
  if (!outlook) return null;
  const amount = (n: number) => (outlook.exact ? `${n}` : `about ${Math.round(n * 10) / 10}`);
  return (
    <section className="fog-summary" aria-label="Under the fog">
      <h4>Under the fog</h4>
      <p>
        {outlook.total} fog tile{outlook.total === 1 ? '' : 's'}
        {outlook.exact ? ', holding exactly:' : ', each drawn at random. Expect:'}
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
      <p className="map-note">A road or ship reaching a fog tile reveals it; land pays its finder one card.</p>
    </section>
  );
}
