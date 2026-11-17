import { PackagePlus, Plus, Trash2 } from 'lucide-react';
import { POINT_REWARDS } from '../../../shared/default-settings';
import { type PieceReward, rewardShips, SPECIAL_LIMITS } from '../../../shared/maps';
import { VICTORY_POINT_RANGE } from '../../../shared/settings';
import type { GameSettings, GameView, PlayerColor } from '../../../shared/types';
import CountStepper from '../editor/CountStepper';
import PieceIcon from '../PieceIcon';
import './room-rewards.css';

const PIECES = [
  {
    key: 'settlements',
    many: 'Settlements',
    label: 'Settlement',
    icon: 'settlement',
    max: SPECIAL_LIMITS.rewardPieces,
  },
  { key: 'cities', many: 'Cities', label: 'City', icon: 'city', max: SPECIAL_LIMITS.rewardPieces },
  { key: 'roads', many: 'Roads', label: 'Road', icon: 'road', max: SPECIAL_LIMITS.rewardPieces * 3 },
  { key: 'ships', many: 'Ships', label: 'Ship', icon: 'ship', max: SPECIAL_LIMITS.rewardPieces * 3 },
] as const;
type Piece = (typeof PIECES)[number];

/** The pieces this room's rewards can add: ships only with Seafarers. */
const piecesFor = (sea: boolean): readonly Piece[] => PIECES.filter(p => sea || p.key !== 'ships');
/** How many of `piece` a reward adds (older rewards give as many ships as roads). */
const countOf = (reward: PieceReward, piece: Piece) =>
  piece.key === 'ships' ? rewardShips(reward) : reward[piece.key];

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
  const sea = view.seafaring;
  const pieces = piecesFor(sea);
  // Icons in the viewer's own seat color (red for spectators).
  const color = view.players.find(p => p.id === view.selfId)?.color;
  const added = {
    points: last ? last + POINT_REWARDS.every : POINT_REWARDS.first,
    ...(sea ? POINT_REWARDS.seaPieces : POINT_REWARDS.pieces),
  };
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
              pieces={pieces}
              color={color}
              disabled={busy}
              set={next => replace(i, next)}
              remove={() => replace(i, null)}
            />
          ))
        : rewards.map((r, i) => <RewardLine key={i} reward={r} pieces={pieces} color={color} />)}
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

/** One reward as others read it: the points, then each piece's icon and count. */
function RewardLine({ reward, pieces, color }: { reward: PieceReward; pieces: readonly Piece[]; color?: PlayerColor }) {
  const given = pieces.filter(p => countOf(reward, p) > 0);
  return (
    <p className="room-reward-line">
      <span>At {reward.points} points:</span>
      {given.map(p => (
        <span key={p.key} className="room-reward-count" title={p.label}>
          <PieceIcon kind={p.icon} color={color} size={22} />+{countOf(reward, p)}
        </span>
      ))}
      {!given.length && <span>nothing</span>}
    </p>
  );
}

/** One reward for the host: the points it comes at, and how many of each piece. */
function RewardEditor({
  reward,
  pieces,
  color,
  disabled,
  set,
  remove,
}: {
  reward: PieceReward;
  pieces: readonly Piece[];
  color?: PlayerColor;
  disabled: boolean;
  set: (reward: PieceReward) => void;
  remove: () => void;
}) {
  return (
    <fieldset className="room-reward" disabled={disabled}>
      <div className="room-reward-head">
        <span>At</span>
        <span className="room-reward-points">
          <CountStepper
            label="points"
            value={reward.points}
            min={1}
            max={VICTORY_POINT_RANGE.max}
            set={points => set({ ...reward, points })}
          />
        </span>
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
        {pieces.map(p => (
          <div key={p.key} className="room-reward-piece">
            <span>
              {p.label}
              <PieceIcon kind={p.icon} color={color} size={20} />
            </span>
            <CountStepper
              label={`${p.many.toLowerCase()} at ${reward.points} points`}
              value={countOf(reward, p)}
              min={0}
              max={p.max}
              set={n => set({ ...reward, ships: rewardShips(reward), [p.key]: n })}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
