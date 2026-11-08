import type { BoardCategory, BoardDesign } from '../../../shared/maps';
import { VICTORY_POINT_RANGE } from '../../../shared/settings';

type Edit = (change: (design: BoardDesign) => BoardDesign, group?: string) => void;

/** The board's name, category, players, and points to win, in one compact row above the canvas. */
export default function BoardFields({
  design,
  categories,
  edit,
}: {
  design: BoardDesign;
  categories: BoardCategory[];
  edit: Edit;
}) {
  const set = (patch: Partial<BoardDesign>, group?: string) => edit(d => ({ ...d, ...patch }), group);
  return (
    <div className="board-fields">
      <input
        className="board-name"
        aria-label="Board name"
        value={design.name}
        maxLength={40}
        onChange={e => set({ name: e.target.value }, 'name')}
      />
      <label>
        <span>Category</span>
        <select value={design.categoryId} onChange={e => set({ categoryId: e.target.value })}>
          {categories.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="board-field" role="group" aria-label="Players">
        <span>Players</span>
        {(['min', 'max'] as const).map(end => (
          <select
            key={end}
            aria-label={end === 'min' ? 'Fewest players' : 'Most players'}
            value={design.players[end]}
            onChange={e => {
              const n = Number(e.target.value);
              const players = { ...design.players, [end]: n };
              if (players.min > players.max) players[end === 'min' ? 'max' : 'min'] = n;
              set({ players });
            }}
          >
            {[2, 3, 4].map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        ))}
      </div>
      <label>
        <span>Points</span>
        <input
          type="number"
          aria-label="Points to win"
          min={VICTORY_POINT_RANGE.min}
          max={VICTORY_POINT_RANGE.max}
          value={design.victoryPoints}
          onChange={e => {
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= VICTORY_POINT_RANGE.min && n <= VICTORY_POINT_RANGE.max)
              set({ victoryPoints: n });
          }}
        />
      </label>
    </div>
  );
}
