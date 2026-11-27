import type { BoardDesign } from '../../../shared/maps';
import { CANDY_LIMITS, CANDY_NUMBERS, replaceCandyRoute } from '../../../shared/maps/candy-train';
import './candy.css';

export interface CandyTrainControls {
  route: number;
  select: (route: number) => void;
  paused: boolean;
  pause: () => void;
}

/** Route editing controls stay in the toolbar so phone users can draw without a settings drawer. */
export default function CandyTrainTools({
  design,
  edit,
  controls,
}: {
  design: BoardDesign;
  edit: (change: (d: BoardDesign) => BoardDesign) => void;
  controls: CandyTrainControls;
}) {
  const routes = design.candyRoutes ?? [];
  const route = routes[controls.route];
  const update = (change: (r: NonNullable<typeof route>) => NonNullable<typeof route>) =>
    edit(d => replaceCandyRoute(d, controls.route, change(d.candyRoutes![controls.route]!)));
  return (
    <section className="candy-train-tools" aria-label="Candy train routes">
      <div className="candy-train-row">
        <label>
          Route{' '}
          <select
            aria-label="Candy train route"
            value={route ? controls.route : ''}
            onChange={e => controls.select(Number(e.target.value))}
            disabled={!routes.length}
          >
            {!routes.length && <option value="">None</option>}
            {routes.map((_, i) => (
              <option key={i} value={i}>
                Train {i + 1}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={routes.length >= CANDY_LIMITS.routes}
          onClick={() => {
            edit(d => ({ ...d, candyRoutes: [...(d.candyRoutes ?? []), { corners: [], side: 1 }] }));
            controls.select(routes.length);
          }}
        >
          New train route
        </button>
        <button
          type="button"
          disabled={!route}
          onClick={() => {
            edit(d => ({ ...d, candyRoutes: d.candyRoutes?.filter((_, i) => i !== controls.route) }));
            controls.select(Math.max(0, controls.route - 1));
          }}
        >
          Delete route
        </button>
      </div>
      <div className="candy-train-row">
        <label>
          Number{' '}
          <select
            aria-label="Candy train number"
            value={route?.number ?? ''}
            disabled={!route}
            onChange={e => {
              const value = e.target.value;
              update(({ number: _old, ...r }) => (value ? { ...r, number: Number(value) } : r));
            }}
          >
            <option value="">4 or 10</option>
            {CANDY_NUMBERS.map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="candy-train-row">
        <button
          type="button"
          disabled={!route?.corners.length}
          onClick={() => update(r => ({ ...r, corners: r.corners.slice(0, -1) }))}
        >
          Remove last
        </button>
        <button type="button" disabled={!route} onClick={() => update(r => ({ ...r, side: r.side === 1 ? -1 : 1 }))}>
          Flip rail side
        </button>
        <button
          type="button"
          disabled={!route || route.corners.length < 2}
          onClick={() => update(r => ({ ...r, corners: [...r.corners].reverse(), side: r.side === 1 ? -1 : 1 }))}
        >
          Reverse route
        </button>
        <button type="button" aria-pressed={controls.paused} onClick={controls.pause}>
          {controls.paused ? 'Play train' : 'Pause train'}
        </button>
      </div>
      <p>
        {!route
          ? 'Add a route to begin.'
          : !route.corners.length
            ? 'Tap a corner for Start, then follow the highlighted corners.'
            : `Train ${controls.route + 1} · ${Math.max(0, route.corners.length - 1)} edges. Tap a highlighted corner to extend; an earlier corner to shorten.`}{' '}
        Picks go from the start station to the end. Played in Christmas Candy rooms.
      </p>
    </section>
  );
}
