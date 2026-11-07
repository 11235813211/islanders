import { House, Route } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { GameAction, GameView, PublicPlayer, Resource } from '../../../shared/types';
import { ResourceIcon } from '../../art';
import { RESOURCE_LABELS } from '../ResourceHand';
import { CityIcon } from './icons';

export type BuildKind = 'road' | 'settlement' | 'city';
const RECIPES: Record<BuildKind | 'development', Resource[]> = {
  road: ['wood', 'brick'],
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

/** The four purchase buttons. Road, settlement, and city toggle a placement mode on the board. */
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
  mode: BuildKind | null;
  setMode: (mode: BuildKind | null) => void;
  send: (action: GameAction) => void;
}) {
  const toggle = (kind: BuildKind) => setMode(mode === kind ? null : kind);
  return (
    <>
      <BuildButton
        kind="road"
        remaining={self.roadsLeft}
        selected={mode === 'road'}
        disabled={blocked || !view.legal.roads.length}
        onClick={() => toggle('road')}
      />
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
        disabled={
          blocked ||
          view.phase !== 'build' ||
          !view.developmentRemaining ||
          !(['sheep', 'wheat', 'ore'] as const).every(r => view.hand[r] > 0)
        }
        onClick={() => send({ type: 'buy-development' })}
      />
    </>
  );
}
