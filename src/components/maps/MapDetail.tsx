import { AlertTriangle, ArrowLeft, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { type BoardDesign, boardExpansions, EXPANSIONS, layoutsOf } from '../../../shared/maps';
import DesignView from './DesignView';
import FogSummary from './FogSummary';
import { BASE_MAP_ID, playerRange, playersLabel, playersMismatch } from './mapInfo';
import ProposeButton, { type Proposing } from './ProposeButton';
import SpecialRulesList from './SpecialRules';

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
 * One map, large, with its rules. Read-only; seated people can propose it and the host can use it from here. A map with layouts
 * for other player counts shows one at a time (the one for this room first), with arrows between.
 */
export default function MapDetail({
  design,
  players,
  layoutFor = players,
  current,
  currentLayout,
  choose,
  propose,
  back,
}: {
  design: BoardDesign;
  players: number;
  /** Show the layout for this many players first (default: the room's). */
  layoutFor?: number;
  /** This map is the room's map. */
  current: boolean;
  /** The layout of the room's map the host picked, if any. */
  currentLayout: { min: number; max: number } | null;
  /** The host uses this map; `layoutFor` picks the shown layout when the map has several. */
  choose?: (layoutFor?: number) => void;
  /** Seated people propose it (or take that back). */
  propose?: Proposing;
  back: () => void;
}) {
  const layouts = layoutsOf(design);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      layouts.findIndex(layout => fits(layout, layoutFor)),
    ),
  );
  const shown = layouts[index] ?? design;
  const several = layouts.length > 1;
  // The base game's island follows the table's size; there is no layout to pick.
  const pick = several && design.id !== BASE_MAP_ID;
  const range = playerRange(shown.players);
  const mismatch = playersMismatch(design, players);
  const inUse = current && (!pick || currentLayout?.min === shown.players.min);
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
        {pick && !mismatch && !fits(shown, players) && (
          <p className="map-warning" role="note">
            <AlertTriangle size={17} />
            This layout is made for {range} players. This room has {players}.
          </p>
        )}
        <SpecialRulesList layout={shown} design={design} />
        <p className="map-note">Tiles, numbers, and harbors marked “?” are drawn at random when the game starts.</p>
        <FogSummary design={shown} />
        {propose && (
          <ProposeButton
            design={design}
            propose={propose}
            layoutFor={pick ? shown.players.min : undefined}
            label={pick ? `Propose this ${range} player map` : 'Propose this map'}
            full
          />
        )}
        {choose && (
          <button
            type="button"
            className="button primary full"
            disabled={inUse}
            onClick={() => choose(pick ? shown.players.min : undefined)}
          >
            <Check size={18} />
            {inUse ? 'This room’s map' : pick ? `Use this ${range} player map` : 'Use this map'}
          </button>
        )}
      </aside>
    </div>
  );
}
