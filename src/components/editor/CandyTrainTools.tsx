import { ArrowLeftRight, FlipHorizontal2, Pause, Play, Plus, Trash2, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BoardDesign } from '../../../shared/maps';
import {
  CANDY_LIMITS,
  canFlipRail,
  DEFAULT_TRAIN_DOTS,
  numbersWithDots,
  replaceCandyRoute,
  TRAIN_DOTS,
} from '../../../shared/maps/candy-train';
import type { CandyRoute } from '../../../shared/maps/types';
import './candy.css';

export interface CandyTrainControls {
  route: number;
  select: (route: number) => void;
  paused: boolean;
  pause: () => void;
}

/** A square icon button whose name shows as its tooltip. */
function IconButton({
  label,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="candy-icon"
      aria-label={label}
      data-tip={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** What the hint line says about the selected route. */
function routeHint(route: CandyRoute | undefined, index: number): string {
  if (!route) return 'Add a route to begin.';
  if (!route.corners.length) return 'Tap a corner to start, then tap or drag along the highlighted edges.';
  return `Train ${index + 1} · ${Math.max(0, route.corners.length - 1)} edges. Drag along a highlighted edge to extend; tap an earlier corner to shorten.`;
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
  const dots = route?.dots ?? DEFAULT_TRAIN_DOTS;
  return (
    <section className="candy-train-tools" aria-label="Candy train routes">
      <div className="candy-train-row">
        <select
          aria-label="Candy train route"
          value={route ? controls.route : ''}
          onChange={e => controls.select(Number(e.target.value))}
          disabled={!routes.length}
        >
          {!routes.length && <option value="">No route</option>}
          {routes.map((_, i) => (
            <option key={i} value={i}>
              Train {i + 1}
            </option>
          ))}
        </select>
        <IconButton
          label="New train route"
          disabled={routes.length >= CANDY_LIMITS.routes}
          onClick={() => {
            edit(d => ({ ...d, candyRoutes: [...(d.candyRoutes ?? []), { corners: [], side: 1 }] }));
            controls.select(routes.length);
          }}
        >
          <Plus size={18} />
        </IconButton>
        <IconButton
          label="Delete route"
          disabled={!route}
          onClick={() => {
            edit(d => ({ ...d, candyRoutes: d.candyRoutes?.filter((_, i) => i !== controls.route) }));
            controls.select(Math.max(0, controls.route - 1));
          }}
        >
          <Trash2 size={18} />
        </IconButton>
        <fieldset className="dot-limit candy-dots" aria-label="Train number dots" disabled={!route}>
          {TRAIN_DOTS.map(n => (
            <button
              key={n}
              type="button"
              aria-pressed={route ? dots === n : false}
              aria-label={`${n} dot${n === 1 ? '' : 's'} (${numbersWithDots(n).join(' or ')})`}
              data-tip={numbersWithDots(n).join(' or ')}
              className={n === 5 ? 'hot' : ''}
              onClick={() => update(({ dots: _old, ...r }) => (n === DEFAULT_TRAIN_DOTS ? r : { ...r, dots: n }))}
            >
              {'•'.repeat(n)}
            </button>
          ))}
        </fieldset>
        <IconButton
          label="Remove last"
          disabled={!route?.corners.length}
          onClick={() => update(r => ({ ...r, corners: r.corners.slice(0, -1) }))}
        >
          <Undo2 size={18} />
        </IconButton>
        <IconButton
          label="Flip rail side"
          disabled={!canFlipRail(design, controls.route)}
          onClick={() => update(r => ({ ...r, side: r.side === 1 ? -1 : 1 }))}
        >
          <FlipHorizontal2 size={18} />
        </IconButton>
        <IconButton
          label="Reverse route"
          disabled={!route || route.corners.length < 2}
          onClick={() => update(r => ({ ...r, corners: [...r.corners].reverse(), side: r.side === 1 ? -1 : 1 }))}
        >
          <ArrowLeftRight size={18} />
        </IconButton>
        <IconButton
          label={controls.paused ? 'Play train' : 'Pause train'}
          pressed={controls.paused}
          onClick={controls.pause}
        >
          {controls.paused ? <Play size={18} /> : <Pause size={18} />}
        </IconButton>
      </div>
      <p>{routeHint(route, controls.route)}</p>
    </section>
  );
}
