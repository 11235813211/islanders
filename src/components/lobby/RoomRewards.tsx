import { PackagePlus, Plus, Trash2 } from 'lucide-react';
import { POINT_REWARDS } from '../../../shared/default-settings';
import { type PieceReward, rewardText, SPECIAL_LIMITS } from '../../../shared/maps';
import { VICTORY_POINT_RANGE } from '../../../shared/settings';
import type { GameSettings, GameView } from '../../../shared/types';
import CountStepper from '../editor/CountStepper';
import './room-rewards.css';

const PIECES = [
  { key: 'settlements', label: 'Settlements', max: SPECIAL_LIMITS.rewardPieces },
  { key: 'cities', label: 'Cities', max: SPECIAL_LIMITS.rewardPieces },
  { key: 'roads', label: 'Roads', max: SPECIAL_LIMITS.rewardPieces * 3 },
] as const;

/** Shown when the map has no extra pieces of its own and the room has some, or plays long enough for them. */
export function showsRoomRewards(view: GameView): boolean {
  if (view.board.rules?.rewards?.length) return false;
  return (
    view.settings.pieceRewards.length > 0 || view.settings.victoryPoints >= POINT_REWARDS.first + POINT_REWARDS.ahead
  );
}

/**
 * Extra pieces for long games: filled in when the host raises points to win (see POINT_REWARDS),
 * then editable by the host. Others read them as one line each.
 */
export default function RoomRewards({
  view,
  host,
  busy,
  change,
}: {
  view: GameView;
  host: boolean;
  busy: boolean;
  change: (next: Partial<GameSettings>) => void;
}) {
  if (!showsRoomRewards(view)) return null;
  const rewards = view.settings.pieceRewards;
  const set = (next: PieceReward[]) => change({ pieceRewards: next });
  const replace = (i: number, next: PieceReward | null) =>
    set(next ? rewards.map((r, j) => (j === i ? next : r)) : rewards.filter((_, j) => j !== i));
  const last = Math.max(0, ...rewards.map(r => r.points));
  const added = { points: last ? last + POINT_REWARDS.every : POINT_REWARDS.first, ...POINT_REWARDS.pieces };
  return (
    <div className="room-rewards">
      <span className="setting-label">
        <PackagePlus size={20} />
        <span>
          <strong>Extra pieces</strong>
          <small>Each player gets these the first time they reach the points.</small>
        </span>
      </span>
      {!rewards.length && <p className="room-rewards-none">None</p>}
      {host
        ? rewards.map((r, i) => (
            <RewardEditor
              key={i}
              reward={r}
              disabled={busy}
              set={next => replace(i, next)}
              remove={() => replace(i, null)}
            />
          ))
        : rewards.map((r, i) => (
            <p key={i} className="room-reward-line">
              At {r.points} points: {rewardText(r) || 'nothing'}
            </p>
          ))}
      {host && rewards.length < SPECIAL_LIMITS.rewards && (
        <button
          type="button"
          className="button secondary room-reward-add"
          disabled={busy}
          onClick={() => set([...rewards, added])}
        >
          <Plus size={16} />
          Add extra pieces
        </button>
      )}
    </div>
  );
}

/** One reward for the host: the points it comes at, and how many of each piece. */
function RewardEditor({
  reward,
  disabled,
  set,
  remove,
}: {
  reward: PieceReward;
  disabled: boolean;
  set: (reward: PieceReward) => void;
  remove: () => void;
}) {
  return (
    <fieldset className="room-reward" disabled={disabled}>
      <div className="room-reward-head">
        <span>At</span>
        <CountStepper
          label="points"
          value={reward.points}
          min={1}
          max={VICTORY_POINT_RANGE.max}
          set={points => set({ ...reward, points })}
        />
        <span>points</span>
        <button
          type="button"
          className="icon-button"
          aria-label={`Remove the extra pieces at ${reward.points} points`}
          onClick={remove}
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div className="room-reward-pieces">
        {PIECES.map(p => (
          <div key={p.key} className="room-reward-piece">
            <span>{p.label}</span>
            <CountStepper
              label={`${p.label.toLowerCase()} at ${reward.points} points`}
              value={reward[p.key]}
              min={0}
              max={p.max}
              set={n => set({ ...reward, [p.key]: n })}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
