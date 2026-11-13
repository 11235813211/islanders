// Cartographers charting after a 7: pick tiles on the board (from the 7 on, so a choice can be lined
// up while the robber moves), then confirm once charting opens.
import { Check } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { chartedNumbers, hexNumbers } from '../../../shared/rules';
import type { GameAction, GameView } from '../../../shared/types';
import type { ChartPicking } from './ChartTargets';
import { Panel } from './CornerPanels';

/** How many charts this seat owes after this 7 (0 when none, or when it can't act). */
export function chartsOwed(view: GameView): number {
  if (view.role !== 'player' || view.pausedAt !== null) return 0;
  // The roller places the robber first; their own tiles open once it is down.
  if (view.phase === 'robber' && view.activePlayerId === view.selfId) return 0;
  return view.legal.chartHexes.length ? (view.pendingCharts[view.selfId] ?? 0) : 0;
}

/** This seat's picks: a tap adds a tile while there is room, else takes one back off it or swaps the last. */
export function useChartPicks(view: GameView): { picks: string[]; clear: () => void; picking: ChartPicking | null } {
  const owed = chartsOwed(view);
  const [picks, setPicks] = useState<string[]>([]);
  useEffect(() => {
    if (!owed) setPicks([]);
  }, [owed]);
  const onPick = useCallback(
    (hexId: string) =>
      setPicks(current => {
        if (current.length < owed) return [...current, hexId];
        const at = current.lastIndexOf(hexId);
        if (at >= 0) return current.filter((_, i) => i !== at);
        return [...current.slice(0, -1), hexId];
      }),
    [owed],
  );
  const hexes = view.legal.chartHexes;
  // Stable between renders, so the memoized board only redraws when the picks change.
  const picking = useMemo(() => (owed ? { hexes, picks, onPick } : null), [owed, hexes, picks, onPick]);
  return { picks, clear: () => setPicks([]), picking };
}

/** What a tile will pay on after these picks, e.g. "5 → 6" or "6 → 6, 2 or 12". */
function preview(view: GameView, hexId: string, times: number): string {
  const hex = view.board.hexes.find(h => h.id === hexId);
  if (!hex) return '';
  let low = hexNumbers(hex);
  let high = low;
  for (let i = 0; i < times; i++) {
    low = chartedNumbers(low, true) ?? low;
    high = chartedNumbers(high, false) ?? high;
  }
  const after = low.join(', ') === high.join(', ') ? low.join(', ') : `${low.join(', ')} or ${high.join(', ')}`;
  return `${hexNumbers(hex).join(', ')} → ${after}`;
}

/** The corner panel: picks so far, and Chart or Pass once charting opens. */
export function ChartPanel({
  view,
  picks,
  clear,
  busy,
  send,
  secondsLeft,
}: {
  view: GameView;
  picks: string[];
  clear: () => void;
  busy: boolean;
  send: (action: GameAction) => void;
  secondsLeft: number | null;
}) {
  const owed = chartsOwed(view);
  const open = view.phase === 'charting';
  const tiles = [...new Set(picks)];
  const status = open
    ? `${picks.length} / ${owed} picked${secondsLeft === null ? '' : ` · ${secondsLeft}s`}`
    : 'Pick now, confirm after the robber';
  return (
    <Panel
      title={owed === 1 ? 'Chart a tile' : `Chart ${owed} tiles`}
      status={status}
      action={
        <span className="chart-actions">
          <button
            className="button secondary"
            disabled={busy || !open}
            onClick={() => send({ type: 'chart-hexes', hexIds: [] })}
          >
            Pass
          </button>
          <button
            className="button primary"
            disabled={busy || !open || !picks.length}
            onClick={() => send({ type: 'chart-hexes', hexIds: picks })}
          >
            <Check size={18} />
            Chart
          </button>
        </span>
      }
    >
      {tiles.length ? (
        <ul className="chart-picks">
          {tiles.map(id => (
            <li key={id}>{preview(view, id, picks.filter(p => p === id).length)}</li>
          ))}
        </ul>
      ) : (
        <p className="chart-hint">Tap tiles on the board. Each step moves a number toward 6 or 8.</p>
      )}
      {!!picks.length && (
        <button type="button" className="button secondary chart-clear" disabled={busy} onClick={clear}>
          Clear
        </button>
      )}
    </Panel>
  );
}
