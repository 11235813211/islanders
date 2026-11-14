import { Plus, Trash2 } from 'lucide-react';
import type { BoardDesign, PieceReward, SetupPiece } from '../../../shared/maps';
import { SPECIAL_LIMITS } from '../../../shared/maps/special';
import { nextReward, setRewards, setSetupPieces, setupOf } from '../../../shared/maps/special-edit';
import { VICTORY_POINT_RANGE } from '../../../shared/settings';
import CountStepper from './CountStepper';
import RouteSettings, { type RouteControls } from './RouteSettings';
import './special.css';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;

const PIECES: { piece: SetupPiece; label: string }[] = [
  { piece: 'settlement', label: 'Settlement' },
  { piece: 'city', label: 'City' },
];

/** Setup: how many rounds, and whether each round places a settlement or a city. */
function SetupRounds({ design, edit }: { design: BoardDesign; edit: Edit }) {
  const pieces = setupOf(design);
  const { min, max } = SPECIAL_LIMITS.setupRounds;
  const setRounds = (n: number) =>
    edit(d => {
      const now = setupOf(d);
      const next = Array.from({ length: n }, (_, i) => now[i] ?? 'settlement');
      return setSetupPieces(d, next);
    });
  return (
    <div className="special-block">
      <div className="special-line">
        <span className="special-name">Setup rounds</span>
        <CountStepper label="setup rounds" value={pieces.length} min={min} max={max} set={setRounds} />
      </div>
      {pieces.map((piece, round) => (
        <div key={round} className="special-line" role="radiogroup" aria-label={`Round ${round + 1} piece`}>
          <span className="special-name">Round {round + 1}</span>
          <span className="chip-row">
            {PIECES.map(p => (
              <button
                key={p.piece}
                type="button"
                role="radio"
                aria-checked={piece === p.piece}
                onClick={() =>
                  edit(d =>
                    setSetupPieces(
                      d,
                      setupOf(d).map((x, i) => (i === round ? p.piece : x)),
                    ),
                  )
                }
              >
                {p.label}
              </button>
            ))}
          </span>
        </div>
      ))}
      {pieces.length > 2 && (
        <p className="inspector-hint">
          Rounds go first to last, then last to first, then last to first, then first to last.
        </p>
      )}
    </div>
  );
}

/** One reward: the points it comes at, and the pieces it adds. */
function RewardRow({
  reward,
  set,
  remove,
}: {
  reward: PieceReward;
  set: (reward: PieceReward) => void;
  remove: () => void;
}) {
  const most = SPECIAL_LIMITS.rewardPieces;
  const kinds = [
    { key: 'settlements', label: 'Settlements', max: most },
    { key: 'cities', label: 'Cities', max: most },
    { key: 'roads', label: 'Roads', max: most * 3 },
  ] as const;
  return (
    <div className="reward-row">
      <div className="special-line">
        <span className="special-name">At</span>
        <CountStepper
          label="points"
          value={reward.points}
          min={1}
          max={VICTORY_POINT_RANGE.max}
          set={points => set({ ...reward, points })}
        />
        <span className="special-unit">points</span>
        <button
          type="button"
          className="icon-button"
          aria-label={`Remove the reward at ${reward.points} points`}
          onClick={remove}
        >
          <Trash2 size={16} />
        </button>
      </div>
      <div className="reward-pieces">
        {kinds.map(k => (
          <div key={k.key} className="reward-piece">
            <span>+ {k.label}</span>
            <CountStepper
              label={k.label.toLowerCase()}
              value={reward[k.key]}
              min={0}
              max={k.max}
              set={n => set({ ...reward, [k.key]: n })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pieces added to every player's supply at some points, so a board can play to many more points. */
function Rewards({ design, edit }: { design: BoardDesign; edit: Edit }) {
  const rewards = design.pieceRewards ?? [];
  const replace = (i: number, next: PieceReward | null) =>
    edit(
      d => {
        const list = d.pieceRewards ?? [];
        return setRewards(d, next ? list.map((r, j) => (j === i ? next : r)) : list.filter((_, j) => j !== i));
      },
      next ? `reward-${i}` : undefined,
    );
  return (
    <div className="special-block">
      <span className="special-name">Extra pieces</span>
      <p className="inspector-hint">Added to each player's supply the first time they reach the points.</p>
      {rewards.map((r, i) => (
        <RewardRow key={i} reward={r} set={next => replace(i, next)} remove={() => replace(i, null)} />
      ))}
      {rewards.length < SPECIAL_LIMITS.rewards && (
        <button
          type="button"
          className="button secondary special-add"
          onClick={() => edit(d => setRewards(d, [...(d.pieceRewards ?? []), nextReward(d)]))}
        >
          <Plus size={15} />
          Add extra pieces
        </button>
      )}
    </div>
  );
}

/**
 * The board's special rules: setup rounds and pieces, extra pieces at some points, and routes.
 * The map picker explains each to players (shared/maps/special.ts specialRules).
 */
export default function SpecialSettings({
  design,
  edit,
  routes,
}: {
  design: BoardDesign;
  edit: Edit;
  routes: RouteControls;
}) {
  return (
    <section className="inspector-section special-settings" aria-label="Special rules">
      <h3>Special rules</h3>
      <SetupRounds design={design} edit={edit} />
      <Rewards design={design} edit={edit} />
      <RouteSettings design={design} edit={edit} controls={routes} />
    </section>
  );
}
