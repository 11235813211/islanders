// Cartographers tools on the board's tiles: chart and split pick a tile. A chart is confirmed on a
// card above the tile; a split (which needs a resource) in a small corner panel.
import { Check } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { affordsSplit, BUILD_COSTS } from '../../../shared/engine';
import { chartedNumbers, hexNumbers, MEGACITY_NUMBERS, megacityTile } from '../../../shared/rules';
import { terrainResource } from '../../../shared/seafaring';
import {
  type GameAction,
  type GameView,
  type Hex,
  type Resource,
  type Terrain,
  TILE_RESOURCES,
} from '../../../shared/types';
import { TERRAIN } from '../../art';
import type { BoardMode } from '../Board';
import { Palette, Panel } from './CornerPanels';
import type { TilePicking } from './TileTargets';
import { tradableLabel } from './tradables';
import './tiles.css';

export type TileTool = 'chart' | 'split';
export const isTileTool = (mode: BoardMode): mode is TileTool => mode === 'chart' || mode === 'split';

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

/** What a chart does to a tile: "5 → 6", "6 → 6, 2", and whether it opens megacities beside it. */
function chartPreview(hex: Hex): string {
  const now = hexNumbers(hex);
  const next = chartedNumbers(now) ?? now;
  const change = `${now.join(', ')} → ${next.join(', ')}`;
  return !megacityTile(hex) && next.length >= MEGACITY_NUMBERS ? `${change}: megacities` : change;
}

const TITLES: Record<TileTool, string> = { chart: 'Chart a tile', split: 'Split a tile' };

/** The tile targets for the board and the confirm panel for the corner, for whichever tool is on. */
export function useTileTools(
  view: GameView,
  mode: BoardMode,
  setMode: (mode: BoardMode) => void,
  send: (action: GameAction) => void,
  busy: boolean,
): {
  /** Turn on the chart tool with this tile already picked (a tap on the board with no tool on). */
  startChart: (hexId: string) => void;
  picking: TilePicking | null;
  panel: ReactNode;
} {
  const tool = isTileTool(mode) ? mode : null;
  const [hexId, setHexId] = useState<string | null>(null);
  const [resource, setResource] = useState<Resource | null>(null);
  // Set by startChart so switching to the chart tool keeps the tile it was started from.
  const keepPick = useRef(false);
  useEffect(() => {
    if (keepPick.current) {
      keepPick.current = false;
      return;
    }
    setHexId(null);
    setResource(null);
  }, [tool]);
  const { legal } = view;
  const hexes = useMemo(() => {
    if (tool === 'chart') return legal.chartHexes;
    return tool === 'split' ? legal.splitHexes : [];
  }, [tool, legal]);
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
            confirm: tool === 'chart' && picked ? chartConfirm(view, picked, send, setMode) : null,
          }
        : null,
    [tool, hexes, picked, view, send, setMode],
  );
  const hex = picked ? view.board.hexes.find(h => h.id === picked) : undefined;
  const close = () => setMode(null);
  const confirm = (action: GameAction) => {
    send(action);
    setMode(null);
  };
  let panel: ReactNode = null;
  // A chart is confirmed on the board, above the tile (see chartConfirm).
  if (tool === 'split' && hex)
    panel = (
      <SplitPanel
        view={view}
        hex={hex}
        resource={resource}
        setResource={setResource}
        busy={busy}
        close={close}
        confirm={() => {
          if (resource) confirm({ type: 'split-hex', hexId: hex.id, resource });
        }}
      />
    );
  const startChart = (id: string) => {
    keepPick.current = tool !== 'chart';
    setHexId(id);
    setMode('chart');
  };
  return { startChart, picking, panel };
}

/** The card above a tile picked to chart: what the chart does to its numbers, then confirm or cancel. */
function chartConfirm(
  view: GameView,
  hexId: string,
  send: (action: GameAction) => void,
  setMode: (mode: BoardMode) => void,
): NonNullable<TilePicking['confirm']> {
  const hex = view.board.hexes.find(h => h.id === hexId)!;
  return {
    text: chartPreview(hex),
    onConfirm: yes => {
      if (yes) send({ type: 'chart-hex', hexId });
      setMode(null);
    },
  };
}

/** The resources a split may add to this tile: any but its own, and never lodestone. */
const splitOptions = (hex: Hex): Resource[] =>
  TILE_RESOURCES.filter(r => r !== terrainResource(hex.terrain) && r !== 'lodestone');

/** The corner panel for a tile picked to split: what it is, the resource to add, and what it costs. */
function SplitPanel({
  view,
  hex,
  resource,
  setResource,
  busy,
  close,
  confirm,
}: {
  view: GameView;
  hex: Hex;
  resource: Resource | null;
  setResource: (resource: Resource) => void;
  busy: boolean;
  close: () => void;
  confirm: () => void;
}) {
  const cost = `${BUILD_COSTS.split.lodestone} lodestone + 1 ${resource ? tradableLabel(resource).toLowerCase() : 'card'}`;
  return (
    <Panel
      title={TITLES.split}
      close={close}
      status={cost}
      action={
        <button className="button primary" disabled={busy || resource === null} onClick={confirm}>
          <Check size={17} />
          Split
        </button>
      }
    >
      <div className="tile-pick">
        <span className="tile-pick-name">{tileName(view, hex)}</span>
        <span className="tile-pick-change">Pays either half</span>
      </div>
      <Palette
        items={splitOptions(hex)}
        label="Resource to add"
        name={r => `Add ${tradableLabel(r)}`}
        disabled={r => busy || r === 'discovery' || !affordsSplit(view.hand, r)}
        pressed={r => r === resource}
        pick={r => r !== 'discovery' && setResource(r)}
      />
    </Panel>
  );
}
