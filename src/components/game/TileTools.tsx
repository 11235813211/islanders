// Cartographers tools on the board's tiles: chart and split pick a tile; a survey ship, once picked,
// shows the tiles it will chart around the nearest town. Confirm in a small corner panel.
import { Check } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { affordsSplit, BUILD_COSTS, chartHexes } from '../../../shared/engine';
import { chartedNumbers, hexNumbers } from '../../../shared/rules';
import { terrainResource } from '../../../shared/seafaring';
import {
  type GameAction,
  type GameView,
  type Hex,
  RESOURCES,
  type Resource,
  type Terrain,
} from '../../../shared/types';
import { TERRAIN } from '../../art';
import type { BoardMode } from '../Board';
import { Palette, Panel } from './CornerPanels';
import type { TilePicking } from './TileTargets';
import { tradableLabel } from './tradables';
import './tiles.css';

export type TileTool = 'chart' | 'split' | 'survey';
export const isTileTool = (mode: BoardMode): mode is TileTool =>
  mode === 'chart' || mode === 'split' || mode === 'survey';

/** A tile as you know it: a peeked fog tile shows what it hides. */
function known(view: GameView, hex: Hex): { terrain: Terrain; numbers: number[] } {
  const peek = view.fogPeeks[hex.id];
  if (peek) return { terrain: peek.terrain, numbers: peek.number === null ? [] : [peek.number] };
  return { terrain: hex.terrain, numbers: hexNumbers(hex) };
}

/** "Fields 9", "Fields or Mountains 6, 2", "Fog: Fields 9": the tile's short name and numbers. */
function tileName(view: GameView, hex: Hex): string {
  const { terrain, numbers } = known(view, hex);
  const short = (t: Terrain) => TERRAIN[t].name.split(' · ')[0];
  const name = hex.split ? `${short(terrain)} or ${short(hex.split)}` : short(terrain);
  const fog = view.fogPeeks[hex.id] ? 'Fog: ' : '';
  return `${fog}${numbers.length ? `${name} ${numbers.join(', ')}` : name}`;
}

/** What a chart does to a tile: "5 → 6", or "6 → 6, 2" when a new number joins. */
function chartPreview(hex: Hex): string {
  const now = hexNumbers(hex);
  return `${now.join(', ')} → ${(chartedNumbers(now) ?? now).join(', ')}`;
}

const TITLES: Record<TileTool, string> = { chart: 'Chart a tile', split: 'Split a tile', survey: 'Survey ship' };

/** The tile targets for the board and the confirm panel for the corner, for whichever tool is on. */
export function useTileTools(
  view: GameView,
  mode: BoardMode,
  setMode: (mode: BoardMode) => void,
  send: (action: GameAction) => void,
  busy: boolean,
): { ship: string | null; pickShip: (edgeId: string) => void; picking: TilePicking | null; panel: ReactNode } {
  const tool = isTileTool(mode) ? mode : null;
  const [ship, setShip] = useState<string | null>(null);
  const [hexId, setHexId] = useState<string | null>(null);
  const [resource, setResource] = useState<Resource | null>(null);
  const [town, setTown] = useState<string | null>(null);
  useEffect(() => {
    setHexId(null);
    setResource(null);
    setTown(null);
    if (tool !== 'survey') setShip(null);
  }, [tool]);
  const { legal } = view;
  const towns = tool === 'survey' && ship ? (legal.surveyTowns[ship] ?? []) : [];
  const chosen = town && towns.includes(town) ? town : (towns[0] ?? null);
  const hexes = useMemo(() => {
    if (tool === 'chart') return legal.chartHexes;
    if (tool === 'split') return legal.splitHexes;
    return chosen ? townTiles(view, chosen) : [];
  }, [tool, legal, chosen, view]);
  const picked = tool !== 'survey' && hexId && hexes.includes(hexId) ? hexId : null;
  // Stable between renders, so the memoized board only redraws when the pick changes.
  const picking = useMemo(
    () =>
      tool && hexes.length
        ? {
            hexes,
            picked,
            onPick: (id: string) => {
              setHexId(id);
              setResource(null);
              // A survey ship's tiles: tapping one picks the tied town it belongs to.
              const other = towns.find(v => v !== chosen && townTiles(view, v).includes(id));
              if (tool === 'survey' && other) setTown(other);
            },
            label: (hex: Hex) => `${TITLES[tool]}: ${tileName(view, hex)}`,
          }
        : null,
    [tool, hexes, picked, view, towns, chosen],
  );
  const hex = picked ? view.board.hexes.find(h => h.id === picked) : undefined;
  const close = () => setMode(null);
  const confirm = (action: GameAction) => {
    send(action);
    setMode(null);
  };
  let panel: ReactNode = null;
  if (tool === 'survey' && ship && chosen)
    panel = (
      <SurveyPanel
        view={view}
        towns={towns}
        chosen={chosen}
        setTown={setTown}
        busy={busy}
        close={close}
        confirm={() => confirm({ type: 'build-survey', edgeId: ship, vertexId: chosen })}
      />
    );
  else if (tool && tool !== 'survey' && hex)
    panel = (
      <TilePanel
        view={view}
        tool={tool}
        hex={hex}
        resource={resource}
        setResource={setResource}
        busy={busy}
        close={close}
        confirm={() => {
          if (tool === 'chart') confirm({ type: 'chart-hex', hexId: hex.id });
          else if (tool === 'split' && resource) confirm({ type: 'split-hex', hexId: hex.id, resource });
        }}
      />
    );
  return { ship, pickShip: setShip, picking, panel };
}

/** The resources a split may add to this tile: any but its own, and never lodestone. */
const splitOptions = (hex: Hex): Resource[] =>
  RESOURCES.filter(r => r !== terrainResource(hex.terrain) && r !== 'lodestone');

/** The tiles around a town that a survey ship would chart. */
function townTiles(view: GameView, vertexId: string): string[] {
  const chartable = new Set(chartHexes(view));
  return view.board.vertices.find(v => v.id === vertexId)!.hexIds.filter(id => chartable.has(id));
}

/** "City by Fields, Hills": a town named by its kind and the land around it. */
function townName(view: GameView, vertexId: string): string {
  const kind = view.buildings[vertexId]?.kind === 'city' ? 'City' : 'Settlement';
  const land = view.board.vertices
    .find(v => v.id === vertexId)!
    .hexIds.map(id => view.board.hexes.find(h => h.id === id)!)
    .filter(h => h.number !== null)
    .map(h => TERRAIN[h.terrain].name.split(' · ')[0]);
  return land.length ? `${kind} by ${land.join(', ')}` : kind;
}

/** The survey ship panel: which town it charts (a choice only when tied), and each tile's change. */
function SurveyPanel({
  view,
  towns,
  chosen,
  setTown,
  busy,
  close,
  confirm,
}: {
  view: GameView;
  towns: string[];
  chosen: string;
  setTown: (vertexId: string) => void;
  busy: boolean;
  close: () => void;
  confirm: () => void;
}) {
  const tiles = townTiles(view, chosen).map(id => view.board.hexes.find(h => h.id === id)!);
  const cost = `${BUILD_COSTS.survey.lodestone} lodestone + 1 ore`;
  return (
    <Panel
      title={TITLES.survey}
      close={close}
      status={cost}
      action={
        <button className="button primary" disabled={busy} onClick={confirm}>
          <Check size={17} />
          Fit out
        </button>
      }
    >
      {towns.length > 1 ? (
        <div className="survey-towns" role="group" aria-label="Nearest towns">
          {towns.map(v => (
            <button key={v} className="survey-town" aria-pressed={v === chosen} onClick={() => setTown(v)}>
              {townName(view, v)}
            </button>
          ))}
        </div>
      ) : (
        <div className="tile-pick">
          <span className="tile-pick-name">{townName(view, chosen)}</span>
          <span className="tile-pick-change">+1 point</span>
        </div>
      )}
      {tiles.length ? (
        tiles.map(hex => (
          <div className="tile-pick" key={hex.id}>
            <span className="tile-pick-name">{tileName(view, hex)}</span>
            <span className="tile-pick-change">{chartPreview(hex)}</span>
          </div>
        ))
      ) : (
        <div className="tile-pick">
          <span className="tile-pick-name">No tiles left to chart</span>
        </div>
      )}
    </Panel>
  );
}

/** The corner panel for a picked tile: what it is, what the tool does to it, and what it costs. */
function TilePanel({
  view,
  tool,
  hex,
  resource,
  setResource,
  busy,
  close,
  confirm,
}: {
  view: GameView;
  tool: TileTool;
  hex: Hex;
  resource: Resource | null;
  setResource: (resource: Resource) => void;
  busy: boolean;
  close: () => void;
  confirm: () => void;
}) {
  const ready = tool !== 'split' || resource !== null;
  const cost =
    tool === 'chart'
      ? `${BUILD_COSTS.chart.lodestone} lodestone`
      : `${BUILD_COSTS.split.lodestone} lodestone + 1 ${resource ? tradableLabel(resource).toLowerCase() : 'card'}`;
  const verb = tool === 'chart' ? 'Chart' : 'Split';
  return (
    <Panel
      title={TITLES[tool]}
      close={close}
      status={cost}
      action={
        <button className="button primary" disabled={busy || !ready} onClick={confirm}>
          <Check size={17} />
          {verb}
        </button>
      }
    >
      <div className="tile-pick">
        <span className="tile-pick-name">{tileName(view, hex)}</span>
        <span className="tile-pick-change">{tileChange(tool, hex)}</span>
      </div>
      {tool === 'split' && (
        <Palette
          items={splitOptions(hex)}
          label="Resource to add"
          name={r => `Add ${tradableLabel(r)}`}
          disabled={r => busy || r === 'discovery' || !affordsSplit(view.hand, r)}
          pressed={r => r === resource}
          pick={r => r !== 'discovery' && setResource(r)}
        />
      )}
    </Panel>
  );
}

/** One short line on what the tool will do. */
function tileChange(tool: TileTool, hex: Hex): string {
  if (tool === 'chart') return chartPreview(hex);
  return 'Pays either half';
}
