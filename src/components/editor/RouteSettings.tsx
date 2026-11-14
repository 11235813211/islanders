import { AlertTriangle, Paintbrush, Plus, Trash2 } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { BoardDesign, RouteZone } from '../../../shared/maps';
import { SPECIAL_LIMITS } from '../../../shared/maps/special';
import {
  addRoute,
  type RouteTarget,
  removeRoute,
  routeGoalOf,
  routeWarnings,
  setRouteGoal,
} from '../../../shared/maps/special-edit';
import { ZONE_STYLE } from '../RouteZones';
import CountStepper from './CountStepper';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;

/** What the routes panel needs from the editor: the Route tool's target, and a way to pick it up. */
export interface RouteControls {
  target: RouteTarget;
  /** Switch to the Route tool, painting this route area. */
  paint: (target: RouteTarget) => void;
}

const ZONES: RouteZone[] = ['start', 'next', 'finish'];

/** One route: its area sizes (each a button that paints that area) and a delete button. */
function RouteRow({
  design,
  index,
  controls,
  edit,
}: {
  design: BoardDesign;
  index: number;
  controls: RouteControls;
  edit: Edit;
}) {
  const route = design.routes![index]!;
  return (
    <div className="route-row">
      <span className="special-name">Route {index + 1}</span>
      <span className="route-zone-buttons">
        {ZONES.map(zone => {
          const active = controls.target.route === index && controls.target.zone === zone;
          return (
            <button
              key={zone}
              type="button"
              className="route-zone-button"
              aria-pressed={active}
              style={{ '--zone-color': ZONE_STYLE[zone].color } as CSSProperties}
              title={`Paint the ${ZONE_STYLE[zone].name} area of route ${index + 1}`}
              onClick={() => controls.paint({ route: index, zone })}
            >
              {ZONE_STYLE[zone].name} {route[zone].length}
            </button>
          );
        })}
      </span>
      <button
        type="button"
        className="icon-button"
        aria-label={`Remove route ${index + 1}`}
        onClick={() => edit(d => removeRoute(d, index))}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

/**
 * Routes: each player's starting settlements must include one in a route's Start area and another
 * in its Second area, and that player must later build in its Finish area (needed to win, or for
 * bonus points). Areas are painted on the board with the Route tool.
 */
export default function RouteSettings({
  design,
  edit,
  controls,
}: {
  design: BoardDesign;
  edit: Edit;
  controls: RouteControls;
}) {
  const routes = design.routes ?? [];
  const goal = routeGoalOf(design);
  return (
    <div className="special-block">
      <span className="special-name">Routes</span>
      <p className="inspector-hint">
        Starting settlements go one in Start and another in Second; then build in Finish. Paint areas with the Route
        tool.
      </p>
      {routes.map((_, i) => (
        <RouteRow key={i} design={design} index={i} controls={controls} edit={edit} />
      ))}
      <div className="special-line">
        {routes.length < SPECIAL_LIMITS.routes && (
          <button
            type="button"
            className="button secondary special-add"
            onClick={() => {
              edit(addRoute);
              controls.paint({ route: routes.length, zone: 'start' });
            }}
          >
            <Plus size={15} />
            Add route
          </button>
        )}
        {routes.length > 0 && (
          <button
            type="button"
            className="button secondary special-add"
            onClick={() => controls.paint(controls.target)}
          >
            <Paintbrush size={15} />
            Route tool
          </button>
        )}
      </div>
      {routes.length > 0 && (
        <>
          <div className="special-line" role="radiogroup" aria-label="Finishing a route">
            <span className="chip-row">
              {[
                { required: true, label: 'Needed to win' },
                { required: false, label: 'Bonus points' },
              ].map(option => (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={goal.required === option.required}
                  onClick={() => edit(d => setRouteGoal(d, { ...routeGoalOf(d), required: option.required }))}
                >
                  {option.label}
                </button>
              ))}
            </span>
          </div>
          <div className="special-line">
            <span className="special-name">Points for finishing</span>
            <CountStepper
              label="route points"
              value={goal.points}
              min={goal.required ? 0 : 1}
              max={SPECIAL_LIMITS.routePoints}
              set={points => edit(d => setRouteGoal(d, { ...routeGoalOf(d), points }), 'route-points')}
            />
          </div>
        </>
      )}
      {routeWarnings(design).map(w => (
        <p key={w} className="map-warning" role="note">
          <AlertTriangle size={16} />
          {w}
        </p>
      ))}
    </div>
  );
}
