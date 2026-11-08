import { House, Move, Route, Sailboat } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { GameAction, GameView, PublicPlayer, Resource } from '../../../shared/types';
import { ResourceIcon } from '../../art';
import type { BoardMode, PlaceKind } from '../Board';
import { RESOURCE_LABELS } from '../ResourceHand';
import { CityIcon } from './icons';

export type BuildKind = PlaceKind;
const RECIPES: Record<BuildKind | 'development', Resource[]> = {
  road: ['wood', 'brick'],
  ship: ['wood', 'sheep'],
  settlement: ['wood', 'brick', 'sheep', 'wheat'],
  city: ['wheat', 'wheat', 'ore', 'ore', 'ore'],
  development: ['sheep', 'wheat', 'ore'],
};

/** Build button. Press and hold (or hover) shows its recipe. */
function BuildButton({
  kind,
  remaining,
  disabled,
  selected,
  onClick,
}: {
  kind: BuildKind | 'development';
  remaining: number;
  disabled: boolean;
  selected?: boolean;
  onClick: () => void;
}) {
  const [tip, setTip] = useState(false);
  const held = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const label = kind === 'development' ? 'Buy development card' : `Build ${kind}`;
  const icon =
    kind === 'road' ? (
      <Route size={23} />
    ) : kind === 'ship' ? (
      <Sailboat size={23} />
    ) : kind === 'settlement' ? (
      <House size={23} />
    ) : kind === 'city' ? (
      <CityIcon size={23} />
    ) : (
      <span className="development-icon">✦</span>
    );
  const hideTip = () => {
    clearTimeout(timer.current);
    setTip(false);
  };
  return (
    <span
      className={`recipe-control ${tip ? 'show-recipe' : ''}`}
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
        {icon}
        <span className="build-label">{kind === 'development' ? 'Dev Card' : kind}</span>
        <small>{remaining}</small>
      </button>
      <span className="recipe-tooltip" role="tooltip">
        {label}
        <span>
          {RECIPES[kind].map((r, i) => (
            <span key={i} title={RESOURCE_LABELS[r]}>
              <ResourceIcon resource={r} size={20} />
            </span>
          ))}
        </span>
      </span>
    </span>
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
}: {
  view: GameView;
  self: PublicPlayer;
  blocked: boolean;
  mode: BoardMode;
  setMode: (mode: BoardMode) => void;
  send: (action: GameAction) => void;
}) {
  const toggle = (kind: Exclude<BoardMode, null>) => setMode(mode === kind ? null : kind);
  const movable = Object.keys(view.legal.shipMoves).length > 0;
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
      <BuildButton
        kind="development"
        remaining={view.developmentRemaining}
        disabled={blocked || !view.legal.development}
        onClick={() => send({ type: 'buy-development' })}
      />
    </>
  );
}
