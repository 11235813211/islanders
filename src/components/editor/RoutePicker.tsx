import type { CSSProperties } from 'react';
import type { BoardDesign, RouteZone } from '../../../shared/maps';
import { SPECIAL_LIMITS } from '../../../shared/maps/special';
import type { RouteTarget } from '../../../shared/maps/special-edit';
import { ZONE_STYLE } from '../RouteZones';

const ZONES: RouteZone[] = ['start', 'next', 'finish'];

/** The Route tool's target in the toolbar: which route (or a new one), and which of its areas to paint. */
export default function RoutePicker({
  design,
  target,
  setTarget,
}: {
  design: BoardDesign;
  target: RouteTarget;
  setTarget: (target: RouteTarget) => void;
}) {
  const count = design.routes?.length ?? 0;
  const numbers = Array.from({ length: Math.min(SPECIAL_LIMITS.routes, count + 1) }, (_, i) => i);
  return (
    <div className="editor-route-target">
      <span className="chip-row" role="radiogroup" aria-label="Route">
        {numbers.map(i => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={target.route === i}
            title={i === count ? 'Start a new route' : `Route ${i + 1}`}
            onClick={() => setTarget({ ...target, route: i })}
          >
            {i === count ? 'New' : i + 1}
          </button>
        ))}
      </span>
      <span className="chip-row" role="radiogroup" aria-label="Route area">
        {ZONES.map(zone => (
          <button
            key={zone}
            type="button"
            role="radio"
            className="zone-chip"
            aria-checked={target.zone === zone}
            style={{ '--zone-color': ZONE_STYLE[zone].color } as CSSProperties}
            onClick={() => setTarget({ ...target, zone })}
          >
            {ZONE_STYLE[zone].name}
          </button>
        ))}
      </span>
    </div>
  );
}
