import { ArrowDown, ArrowUp, FilePlus2, Hexagon, Trash2 } from 'lucide-react';
import type { BoardCategory } from '../../../shared/maps';

/**
 * A category's heading. In the editor it is also where the category is renamed, recolored,
 * moved, deleted, and where new boards start.
 */
export default function CategoryHeader({
  category,
  count,
  editing,
  first,
  last,
  only,
  update,
  move,
  remove,
  create,
}: {
  category: BoardCategory;
  count: number;
  editing: boolean;
  first: boolean;
  last: boolean;
  only: boolean;
  update: (patch: Partial<BoardCategory>) => void;
  move: (by: -1 | 1) => void;
  remove: () => void;
  create: (kind: 'blank' | 'base') => void;
}) {
  if (!editing)
    return (
      <h3>
        <span className="category-dot" />
        {category.name}
      </h3>
    );
  return (
    <div className="category-editor">
      <input
        type="color"
        className="category-color"
        aria-label={`${category.name} color`}
        value={category.color}
        onChange={e => update({ color: e.target.value })}
      />
      <input
        className="category-name"
        aria-label="Category name"
        defaultValue={category.name}
        key={category.name}
        maxLength={32}
        onBlur={e => {
          const name = e.target.value.trim();
          if (name && name !== category.name) update({ name });
          else e.target.value = category.name;
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <button type="button" className="text-button" onClick={() => create('blank')}>
        <FilePlus2 size={16} />
        New blank board
      </button>
      <button type="button" className="text-button" onClick={() => create('base')}>
        <Hexagon size={16} />
        New base board
      </button>
      <span className="category-tools">
        <button
          type="button"
          className="icon-button"
          aria-label={`Move ${category.name} up`}
          disabled={first}
          onClick={() => move(-1)}
        >
          <ArrowUp size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Move ${category.name} down`}
          disabled={last}
          onClick={() => move(1)}
        >
          <ArrowDown size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Delete ${category.name}`}
          title={count ? 'Move or delete its boards first' : 'Delete category'}
          disabled={count > 0 || only}
          onClick={remove}
        >
          <Trash2 size={16} />
        </button>
      </span>
    </div>
  );
}
