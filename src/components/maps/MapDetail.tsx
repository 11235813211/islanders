import { AlertTriangle, ArrowLeft, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { type BoardDesign, boardExpansions, EXPANSIONS, layoutsOf } from '../../../shared/maps';
import DesignView from './DesignView';
import FogSummary from './FogSummary';
import { playerRange, playersLabel, playersMismatch } from './mapInfo';

/** Small labels for the expansions a board needs. */
export function ExpansionTags({ design }: { design: Pick<BoardDesign, 'expansions' | 'tiles'> }) {
  const needs = boardExpansions(design);
  if (!needs.length) return null;
  return (
    <span className="expansion-tags" title="Needs these expansions">
      {needs.map(e => (
        <span key={e} className={`expansion-tag expansion-${e}`}>
          {EXPANSIONS[e]}
        </span>
      ))}
    </span>
  );
}

const fits = (layout: BoardDesign, players: number) => players >= layout.players.min && players <= layout.players.max;

/** Previous / next arrows between a map's layouts for different player counts. */
function LayoutSwitch({ index, count, go }: { index: number; count: number; go: (index: number) => void }) {
  return (
    <div className="map-layout-switch">
      <button
        type="button"
        className="icon-button"
        aria-label="Previous layout"
        disabled={index === 0}
        onClick={() => go(index - 1)}
      >
        <ChevronLeft />
      </button>
      <span>
        {index + 1} / {count}
      </span>
      <button
        type="button"
        className="icon-button"
        aria-label="Next layout"
        disabled={index === count - 1}
        onClick={() => go(index + 1)}
      >
        <ChevronRight />
      </button>
    </div>
  );
}

/**
 * One map, large, with its rules. Read-only; the host can choose it from here. A map with layouts
 * for other player counts shows one at a time (the one for this room first), with arrows between.
 */
export default function MapDetail({
  design,
  players,
  canChoose,
  current,
  currentLayout,
  choose,
  back,
}: {
  design: BoardDesign;
  players: number;
  canChoose: boolean;
  /** This map is the room's map. */
  current: boolean;
  /** The layout of the room's map the host picked, if any. */
  currentLayout: { min: number; max: number } | null;
  /** Choose this map; `layoutFor` picks the shown layout when the map has several. */
  choose: (layoutFor?: number) => void;
  back: () => void;
}) {
  const layouts = layoutsOf(design);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      layouts.findIndex(layout => fits(layout, players)),
    ),
  );
  const shown = layouts[index] ?? design;
  const several = layouts.length > 1;
  const range = playerRange(shown.players);
  const mismatch = playersMismatch(design, players);
  const inUse = current && (!several || currentLayout?.min === shown.players.min);
  const land = shown.tiles.filter(t => t.kind !== 'sea' && t.kind !== 'iceberg').length;
  return (
    <div className="map-detail">
      <div className="map-detail-view">
        <DesignView key={index} design={shown} />
        <span className="map-layout-players">{range} players</span>
        {several && <LayoutSwitch index={index} count={layouts.length} go={setIndex} />}
      </div>
      <aside className="map-info">
        <button type="button" className="text-button" onClick={back}>
          <ArrowLeft size={17} />
          All maps
        </button>
        <h3>{design.name}</h3>
        {design.description && <p>{design.description}</p>}
        <dl>
          <dt>Players</dt>
          <dd>{playersLabel(design)}</dd>
          <dt>Points to win</dt>
          <dd>{shown.victoryPoints}</dd>
          <dt>Land tiles</dt>
          <dd>{land}</dd>
          <dt>Harbors</dt>
          <dd>{shown.harbors.length || 'Random'}</dd>
          <dt>Needs</dt>
          <dd>
            <ExpansionTags design={design} />
            {!boardExpansions(design).length && 'Base game only'}
          </dd>
        </dl>
        {mismatch && (
          <p className="map-warning" role="note">
            <AlertTriangle size={17} />
            Made for {playersLabel(design)} players. This room has {players}.
          </p>
        )}
        {several && !mismatch && !fits(shown, players) && (
          <p className="map-warning" role="note">
            <AlertTriangle size={17} />
            This layout is made for {range} players. This room has {players}.
          </p>
        )}
        <p className="map-note">Tiles, numbers, and harbors marked “?” are drawn at random when the game starts.</p>
        <FogSummary design={shown} />
        {canChoose && (
          <button
            type="button"
            className="button primary full"
            disabled={inUse}
            onClick={() => choose(several ? shown.players.min : undefined)}
          >
            <Check size={18} />
            {inUse ? 'This room’s map' : several ? `Use this ${range} player map` : 'Use this map'}
          </button>
        )}
      </aside>
    </div>
  );
}
