import { hexCenter, hexCorner } from '../../shared/board';
import { type RouteZone, SIDE_DIRECTIONS, tileKey } from '../../shared/maps/types';

/** Each route area's name and color: start amber, second blue, finish green (the finish line). */
export const ZONE_STYLE: Record<RouteZone, { name: string; color: string }> = {
  start: { name: 'Start', color: '#f0a400' },
  next: { name: 'Second', color: '#2f8ce0' },
  finish: { name: 'Finish', color: '#1fa83c' },
};
/** Draw order: the wide second areas under the start areas they usually contain, finish on top. */
const ZONE_ORDER: RouteZone[] = ['next', 'start', 'finish'];

/** One area to outline: its tiles (`q,r` keys), which kind it is, and its route number when there are several. */
export interface ZoneOutline {
  tiles: string[];
  zone: RouteZone;
  route?: number;
  /** Drawn faint: an area that matters later (a finish line during setup). */
  faint?: boolean;
}

/** Boundary segments of a set of tiles, inset toward each tile's center so touching areas stay apart. */
function outlinePath(tiles: string[], inset: number): string {
  const set = new Set(tiles);
  const parts: string[] = [];
  for (const key of set) {
    const [q, r] = key.split(',').map(Number) as [number, number];
    const c = hexCenter(q, r);
    SIDE_DIRECTIONS.forEach(([dq, dr], side) => {
      if (set.has(tileKey(q + dq, r + dr))) return;
      const pull = (p: { x: number; y: number }) => ({ x: c.x + (p.x - c.x) * inset, y: c.y + (p.y - c.y) * inset });
      const a = pull(hexCorner(c.x, c.y, side));
      const b = pull(hexCorner(c.x, c.y, (side + 1) % 6));
      parts.push(`M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
    });
  }
  return parts.join('');
}

/** The tile of an area nearest its middle, where the area's label goes. */
function labelTile(tiles: string[]): { x: number; y: number } {
  const points = tiles.map(k => {
    const [q, r] = k.split(',').map(Number) as [number, number];
    return hexCenter(q, r);
  });
  const mx = points.reduce((n, p) => n + p.x, 0) / points.length;
  const my = points.reduce((n, p) => n + p.y, 0) / points.length;
  return points.reduce((best, p) => (Math.hypot(p.x - mx, p.y - my) < Math.hypot(best.x - mx, best.y - my) ? p : best));
}

/** Insets per kind, so a start area inside a second area shows both lines. */
const INSET: Record<RouteZone, number> = { next: 0.97, start: 0.84, finish: 0.92 };

/**
 * Outlines of route areas on a board or design: a tinted fill, a colored line, and a label such as
 * "Finish" (or "2 Finish" when a board has several routes).
 */
export default function RouteZones({ zones, labels = true }: { zones: ZoneOutline[]; labels?: boolean }) {
  const shown = zones.filter(z => z.tiles.length);
  if (!shown.length) return null;
  const sorted = [...shown].sort((a, b) => ZONE_ORDER.indexOf(a.zone) - ZONE_ORDER.indexOf(b.zone));
  return (
    <g className="route-zones" aria-hidden="true" pointerEvents="none">
      {sorted.map((z, i) => {
        const { color } = ZONE_STYLE[z.zone];
        const d = outlinePath(z.tiles, INSET[z.zone]);
        const opacity = z.faint ? 0.55 : 1;
        return (
          <g key={`${z.route ?? 0}-${z.zone}-${i}`} className={`route-zone zone-${z.zone}`} opacity={opacity}>
            {z.tiles.map(k => {
              const [q, r] = k.split(',').map(Number) as [number, number];
              const c = hexCenter(q, r);
              return (
                <circle key={k} cx={c.x} cy={c.y} r="44" fill={color} fillOpacity={z.zone === 'finish' ? 0.2 : 0.12} />
              );
            })}
            <path d={d} stroke="#fff" strokeOpacity=".75" strokeWidth="9" strokeLinecap="round" fill="none" />
            <path
              d={d}
              stroke={color}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={z.zone === 'start' ? '10 7' : undefined}
              fill="none"
            />
          </g>
        );
      })}
      {labels && sorted.map((z, i) => <ZoneLabel key={`label-${i}`} zone={z} />)}
    </g>
  );
}

/** A pill naming an area, above the tile nearest its middle. */
function ZoneLabel({ zone }: { zone: ZoneOutline }) {
  const at = labelTile(zone.tiles);
  const { name, color } = ZONE_STYLE[zone.zone];
  const text = zone.route === undefined ? name : `${zone.route + 1} ${name}`;
  const width = 12 + text.length * 8.6;
  // Start and second labels sit at different heights so one area inside another keeps both readable.
  const y = at.y + (zone.zone === 'start' ? -34 : zone.zone === 'next' ? 34 : -6);
  return (
    <g className="route-zone-label" transform={`translate(${at.x} ${y})`} opacity={zone.faint ? 0.7 : 1}>
      <rect x={-width / 2} y="-11" width={width} height="22" rx="11" fill={color} stroke="#fff" strokeWidth="2" />
      <text textAnchor="middle" y="5" fontSize="14" fontWeight="800" fill="#fff">
        {text}
      </text>
    </g>
  );
}

/** Every area of every route, for previews and the editor. */
export function allZones(routes: { start: string[]; next: string[]; finish: string[] }[] | undefined): ZoneOutline[] {
  const several = (routes?.length ?? 0) > 1;
  return (routes ?? []).flatMap((r, i) =>
    (['next', 'start', 'finish'] as RouteZone[]).map(zone => ({
      tiles: r[zone],
      zone,
      ...(several ? { route: i } : {}),
    })),
  );
}
