import { Check } from 'lucide-react';
import { type CSSProperties, useEffect, useState } from 'react';
import { isPlayerColor, PLAYER_COLORS, playerVars } from '../../../shared/colors';
import { type GameAction, type GameView, PLAYER_COLOR_IDS, type PlayerColor } from '../../../shared/types';

const PREFERRED_KEY = 'islanders-preferred-color';

/** The color this person last picked, so new rooms start with it. */
function preferredColor(): PlayerColor | null {
  try {
    const value = localStorage.getItem(PREFERRED_KEY);
    return isPlayerColor(value) ? value : null;
  } catch {
    return null;
  }
}

function rememberColor(color: PlayerColor): void {
  try {
    localStorage.setItem(PREFERRED_KEY, color);
  } catch {
    /* Storage may be disabled. */
  }
}

/** Your color choices. A taken color shows its owner's initial; click it to ask for a swap. */
export default function ColorPicker({
  view,
  busy,
  send,
}: {
  view: GameView;
  busy: boolean;
  send: (action: GameAction) => void;
}) {
  const self = view.players.find(p => p.id === view.selfId);
  const [asking, setAsking] = useState<PlayerColor | null>(null);
  const takenBy = new Map(view.players.map(p => [p.color, p]));
  const selfColor = self?.color;

  // Start a new room in the last color picked, if it is free.
  useEffect(() => {
    const wanted = preferredColor();
    if (wanted && selfColor && wanted !== selfColor && !takenBy.has(wanted))
      send({ type: 'choose-color', color: wanted });
    // Only when first arriving in the lobby.
    // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per mount
  }, []);

  if (!self) return null;
  const pending = new Set(view.colorSwaps.filter(s => s.from === self.id).map(s => s.to));
  return (
    <div className="color-picker" role="radiogroup" aria-label="Your color">
      {PLAYER_COLOR_IDS.map(color => {
        const owner = takenBy.get(color);
        const mine = owner?.id === self.id;
        const taken = !!owner && !mine;
        return (
          <div className="color-slot" key={color}>
            <button
              type="button"
              role="radio"
              aria-checked={mine}
              aria-label={`${PLAYER_COLORS[color].label}${taken ? ` (taken by ${owner.name})` : ''}`}
              title={taken ? `Taken by ${owner.name}` : PLAYER_COLORS[color].label}
              className={`color-swatch${taken ? ' taken' : ''}`}
              style={playerVars(color) as CSSProperties}
              disabled={busy}
              onClick={() => {
                if (mine) return;
                if (taken) return setAsking(asking === color ? null : color);
                rememberColor(color);
                send({ type: 'choose-color', color });
              }}
            >
              {mine ? <Check size={16} /> : taken ? owner.name.slice(0, 1).toUpperCase() : null}
            </button>
            {asking === color && owner && taken && (
              <div className="color-ask" role="dialog">
                {pending.has(owner.id) ? (
                  <span>Waiting for {owner.name}</span>
                ) : (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      send({ type: 'ask-color-swap', playerId: owner.id });
                      setAsking(null);
                    }}
                  >
                    Ask {owner.name} to swap
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Banner at the top of the page when someone asks to swap colors with you. */
export function ColorSwapNotice({
  view,
  busy,
  send,
}: {
  view: GameView;
  busy: boolean;
  send: (action: GameAction) => void;
}) {
  const request = view.colorSwaps.find(s => s.to === view.selfId);
  const asker = view.players.find(p => p.id === request?.from);
  if (!request || !asker) return null;
  const answer = (accept: boolean) => send({ type: 'answer-color-swap', playerId: asker.id, accept });
  return (
    <div className="color-swap-notice" role="alert">
      <span>
        {asker.name} wants your color ({PLAYER_COLORS[view.players.find(p => p.id === view.selfId)!.color].label}) for{' '}
        {PLAYER_COLORS[asker.color].label}.
      </span>
      <button type="button" className="button primary" disabled={busy} onClick={() => answer(true)}>
        Swap
      </button>
      <button type="button" className="button secondary" disabled={busy} onClick={() => answer(false)}>
        No
      </button>
    </div>
  );
}
