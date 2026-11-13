import { Check, Compass, Eye, House, Move, Route, Sailboat, SplitSquareHorizontal, TrendingUp, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BUILD_COSTS } from '../../../shared/engine';
import { type GameAction, type GameView, type PublicPlayer, RESOURCES, type Resource } from '../../../shared/types';
import { ResourceIcon } from '../../art';
import { useDismiss } from '../../hooks/useDismiss';
import type { BoardMode, PlaceKind } from '../Board';
import { RESOURCE_LABELS } from '../ResourceHand';
import { CityIcon, RelayIcon } from './icons';

export type BuildKind = PlaceKind;
/** Everything with a recipe on the bar: pieces, a development card, and the lodestone tile moves. */
type ButtonKind = BuildKind | 'development' | 'peek' | 'chart' | 'split';
/** A piece's cost as one icon per card (a split's extra card, of the resource it adds, isn't shown). */
const recipe = (kind: ButtonKind): Resource[] => RESOURCES.flatMap(r => Array<Resource>(BUILD_COSTS[kind][r]).fill(r));
/** Names on the buttons and in their tooltips. */
const LABELS: Record<ButtonKind, { short: string; long: string }> = {
  road: { short: 'road', long: 'Build road' },
  ship: { short: 'ship', long: 'Build ship' },
  settlement: { short: 'settlement', long: 'Build settlement' },
  city: { short: 'city', long: 'Build city' },
  relay: { short: 'relay', long: 'Build relay station' },
  survey: { short: 'survey', long: 'Make a ship a survey ship' },
  development: { short: 'Dev Card', long: 'Buy development card' },
  peek: { short: 'peek', long: 'Peek at a fog tile (only you see it)' },
  chart: { short: 'chart', long: 'Chart a tile: its number steps toward 7' },
  split: { short: 'split', long: 'Split a tile: pay 1 of a resource and it pays that too' },
};
const ICONS: Record<ButtonKind, ReactNode> = {
  road: <Route size={23} />,
  ship: <Sailboat size={23} />,
  settlement: <House size={23} />,
  city: <CityIcon size={23} />,
  relay: <RelayIcon size={23} />,
  survey: <Compass size={23} />,
  development: <span className="development-icon">✦</span>,
  peek: <Eye size={23} />,
  chart: <TrendingUp size={23} />,
  split: <SplitSquareHorizontal size={23} />,
};

/** Build button. Press and hold (or hover) shows its recipe. */
function BuildButton({
  kind,
  remaining,
  disabled,
  selected,
  onClick,
  children,
}: {
  kind: ButtonKind;
  /** How many are left, or null for moves with no limit. */
  remaining: number | null;
  disabled: boolean;
  selected?: boolean;
  onClick: () => void;
  /** A popover shown above the button (the buy confirmation). */
  children?: ReactNode;
}) {
  const [tip, setTip] = useState(false);
  const held = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const label = LABELS[kind].long;
  const hideTip = () => {
    clearTimeout(timer.current);
    setTip(false);
  };
  return (
    <span
      className={`recipe-control ${tip ? 'show-recipe' : ''}${children ? ' confirming' : ''}`}
      onMouseLeave={() => setTip(false)}
      onPointerDown={() => {
        clearTimeout(timer.current);
        held.current = false;
        timer.current = setTimeout(() => {
          held.current = true;
          setTip(true);
        }, 420);
      }}
      onPointerUp={hideTip}
      onPointerCancel={hideTip}
      onContextMenu={e => e.preventDefault()}
    >
      <button
        aria-label={label}
        aria-pressed={!!selected}
        className={`build-compact ${selected ? 'selected' : ''}`}
        disabled={disabled}
        onClick={() => {
          if (held.current) {
            held.current = false;
            return;
          }
          setTip(false);
          onClick();
        }}
      >
        {ICONS[kind]}
        <span className="build-label">{LABELS[kind].short}</span>
        {remaining !== null && <small>{remaining}</small>}
      </button>
      <span className="recipe-tooltip" role="tooltip">
        {label}
        <span>
          {recipe(kind).map((r, i) => (
            <span key={i} title={RESOURCE_LABELS[r]}>
              <ResourceIcon resource={r} size={20} />
            </span>
          ))}
        </span>
      </span>
      {children}
    </span>
  );
}

/** "Buy a development card?" with its cost, just above the Dev Card button. */
function BuyConfirm({ buy, close }: { buy: () => void; close: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  // Presses on the Dev Card button itself toggle the card, so they don't count as "outside".
  const scope = useMemo(
    () => ({
      get current() {
        return root.current?.parentElement ?? null;
      },
    }),
    [],
  );
  useDismiss(true, close, scope);
  return (
    <div className="buy-confirm" ref={root} role="dialog" aria-label="Buy a development card?">
      Buy a development card?
      <span className="buy-confirm-recipe">
        {recipe('development').map(r => (
          <ResourceIcon key={r} resource={r} size={20} />
        ))}
      </span>
      <span className="buy-confirm-buttons">
        <button type="button" className="button primary" aria-label="Confirm buy" onClick={buy}>
          <Check size={20} />
        </button>
        <button type="button" className="button secondary" aria-label="Cancel buy" onClick={close}>
          <X size={20} />
        </button>
      </span>
    </div>
  );
}

/** The purchase buttons. Road, ship, settlement, and city toggle a placement mode on the board. */
export default function BuildBar({
  view,
  self,
  blocked,
  mode,
  setMode,
  send,
  buyWithDiscoveries,
}: {
  view: GameView;
  self: PublicPlayer;
  blocked: boolean;
  mode: BoardMode;
  setMode: (mode: BoardMode) => void;
  send: (action: GameAction) => void;
  /** With discoveries in hand, the Dev Card button asks which resources they pay for. */
  buyWithDiscoveries: () => void;
}) {
  const toggle = (kind: Exclude<BoardMode, null>) => setMode(mode === kind ? null : kind);
  const [confirming, setConfirming] = useState(false);
  const closeConfirm = useCallback(() => setConfirming(false), []);
  const movable = Object.keys(view.legal.shipMoves).length > 0;
  const fogLeft = view.board.hexes.filter(h => h.terrain === 'fog').length;
  return (
    <>
      <BuildButton
        kind="road"
        remaining={self.roadsLeft}
        selected={mode === 'road'}
        disabled={blocked || !view.legal.roads.length}
        onClick={() => toggle('road')}
      />
      {view.seafaring && (
        <BuildButton
          kind="ship"
          remaining={self.shipsLeft}
          selected={mode === 'ship'}
          disabled={blocked || !view.legal.ships.length}
          onClick={() => toggle('ship')}
        />
      )}
      {view.seafaring && movable && (
        <button
          className={`build-compact move-ship ${mode === 'move-ship' ? 'selected' : ''}`}
          aria-label="Move a ship"
          aria-pressed={mode === 'move-ship'}
          disabled={blocked}
          onClick={() => toggle('move-ship')}
        >
          <Move size={21} />
          <span className="build-label">Move</span>
        </button>
      )}
      <BuildButton
        kind="settlement"
        remaining={self.settlementsLeft}
        selected={mode === 'settlement'}
        disabled={blocked || !view.legal.settlements.length}
        onClick={() => toggle('settlement')}
      />
      <BuildButton
        kind="city"
        remaining={self.citiesLeft}
        selected={mode === 'city'}
        disabled={blocked || !view.legal.cities.length}
        onClick={() => toggle('city')}
      />
      {view.cartographers && (
        <>
          <BuildButton
            kind="relay"
            remaining={self.relaysLeft}
            selected={mode === 'relay'}
            disabled={blocked || !view.legal.relays.length}
            onClick={() => toggle('relay')}
          />
          <BuildButton
            kind="survey"
            remaining={self.surveysLeft}
            selected={mode === 'survey'}
            disabled={blocked || !view.legal.surveys.length}
            onClick={() => toggle('survey')}
          />
          <BuildButton
            kind="chart"
            remaining={null}
            selected={mode === 'chart'}
            disabled={blocked || !view.legal.chartHexes.length}
            onClick={() => toggle('chart')}
          />
          <BuildButton
            kind="split"
            remaining={null}
            selected={mode === 'split'}
            disabled={blocked || !view.legal.splitHexes.length}
            onClick={() => toggle('split')}
          />
          {fogLeft > 0 && (
            <BuildButton
              kind="peek"
              remaining={fogLeft}
              selected={mode === 'peek'}
              disabled={blocked || !view.legal.peekHexes.length}
              onClick={() => toggle('peek')}
            />
          )}
        </>
      )}
      <BuildButton
        kind="development"
        remaining={view.developmentRemaining}
        disabled={blocked || !view.legal.development}
        // With discoveries, the panel that picks what they pay for is the confirmation.
        onClick={() => (self.discoveries > 0 ? buyWithDiscoveries() : setConfirming(open => !open))}
      >
        {confirming && !blocked && view.legal.development && (
          <BuyConfirm
            close={closeConfirm}
            buy={() => {
              setConfirming(false);
              send({ type: 'buy-development' });
            }}
          />
        )}
      </BuildButton>
    </>
  );
}
