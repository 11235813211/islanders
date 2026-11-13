// Cartographers tools that pick a tile: chart, split, and a survey ship's target. Pick on the
// board, then confirm in a small corner panel.
import { Check } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { affordsSplit, BUILD_COSTS } from '../../../shared/engine';
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

/** What a chart does to a tile: "5 → 6", or "6 → 6, 2 or 6, 12" when a new number joins at random. */
function chartPreview(hex: Hex): string {
  const now = hexNumbers(hex);
  const low = chartedNumbers(now, true) ?? now;
  const high = chartedNumbers(now, false) ?? now;
  const after = low.join(', ') === high.join(', ') ? low.join(', ') : `${low.join(', ')} or ${high.join(', ')}`;
  return `${now.join(', ')} → ${after}`;
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
  useEffect(() => {
    setHexId(null);
    setResource(null);
    if (tool !== 'survey') setShip(null);
  }, [tool]);
  const { legal } = view;
  const hexes = useMemo(() => {
    if (tool === 'chart') return legal.chartHexes;
    if (tool === 'split') return legal.splitHexes;
    return tool === 'survey' && ship && legal.surveys.includes(ship) ? legal.surveyTargets : [];
  }, [tool, ship, legal]);
  const picked = hexId && hexes.includes(hexId) ? hexId : null;
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
            },
            label: (hex: Hex) => `${TITLES[tool]}: ${tileName(view, hex)}`,
          }
        : null,
    [tool, hexes, picked, view],
  );
  const hex = picked ? view.board.hexes.find(h => h.id === picked) : undefined;
  const close = () => setMode(null);
  const confirm = (action: GameAction) => {
    send(action);
    setMode(null);
  };
  let panel: ReactNode = null;
  if (tool && hex)
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
          else if (tool === 'survey' && ship) confirm({ type: 'build-survey', edgeId: ship, hexId: hex.id });
        }}
      />
    );
  return { ship, pickShip: setShip, picking, panel };
}

/** The resources a split may add to this tile: any but its own. */
const splitOptions = (hex: Hex): Resource[] => RESOURCES.filter(r => r !== terrainResource(hex.terrain));

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
      : tool === 'split'
        ? `${BUILD_COSTS.split.lodestone} lodestone + 1 ${resource ? tradableLabel(resource).toLowerCase() : 'card'}`
        : `${BUILD_COSTS.survey.lodestone} lodestone + 1 ore`;
  const verb = tool === 'chart' ? 'Chart' : tool === 'split' ? 'Split' : 'Fit out';
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
        <span className="tile-pick-change">{tileChange(view, tool, hex)}</span>
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
function tileChange(view: GameView, tool: TileTool, hex: Hex): string {
  if (tool === 'chart') return chartPreview(hex);
  if (tool === 'split') return 'Pays either half';
  return view.fogPeeks[hex.id] ? 'Only you know this tile' : '1 card when it rolls';
}
