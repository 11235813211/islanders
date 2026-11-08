import { ArrowDown, ArrowUp, Copy, FilePlus2, Hexagon, Plus, Trash2 } from 'lucide-react';
import { type CSSProperties, type DragEvent, useState } from 'react';
import type { BoardCategory, BoardLibrary } from '../../../shared/maps';
import MapThumbnail from '../maps/MapThumbnail';

const COLORS = ['#1f7fa6', '#c4572b', '#3b8442', '#8a5bb8', '#b07c12', '#4f7684', '#c23a6b', '#2f9e8f'];

/** A new category id that isn't taken. */
const categoryId = (library: BoardLibrary) => {
  for (let n = library.categories.length + 1; ; n++)
    if (!library.categories.some(c => c.id === `category-${n}`)) return `category-${n}`;
};

/** Move the board `id` to just before `beforeId` (or the end of `categoryId`), in that category. */
export function moveBoard(library: BoardLibrary, id: string, categoryId: string, beforeId?: string): BoardLibrary {
  const board = library.boards.find(b => b.id === id);
  if (!board || id === beforeId) return library;
  const rest = library.boards.filter(b => b.id !== id);
  const moved = { ...board, categoryId };
  let at = beforeId ? rest.findIndex(b => b.id === beforeId) : -1;
  if (at < 0) {
    const last = rest.map(b => b.categoryId).lastIndexOf(categoryId);
    at = last < 0 ? rest.length : last + 1;
  }
  return { ...library, boards: [...rest.slice(0, at), moved, ...rest.slice(at)] };
}

/**
 * The board library: categories (renamed, recolored, and reordered in place) and their boards,
 * which drag between categories. Layout changes save right away through `changeLayout`.
 */
export default function EditorLibrary({
  library,
  activeId,
  open,
  create,
  duplicate,
  remove,
  changeLayout,
}: {
  library: BoardLibrary;
  activeId: string | null;
  open: (id: string) => void;
  create: (kind: 'blank' | 'base', categoryId: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  changeLayout: (library: BoardLibrary) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const updateCategory = (id: string, patch: Partial<BoardCategory>) =>
    changeLayout({ ...library, categories: library.categories.map(c => (c.id === id ? { ...c, ...patch } : c)) });
  const shiftCategory = (index: number, by: -1 | 1) => {
    const categories = [...library.categories];
    const [moved] = categories.splice(index, 1);
    categories.splice(index + by, 0, moved!);
    changeLayout({ ...library, categories });
  };
  const drop = (event: DragEvent, categoryId: string, beforeId?: string) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/x-board') || dragging;
    setDragging(null);
    setTarget(null);
    if (id) changeLayout(moveBoard(library, id, categoryId, beforeId));
  };
  return (
    <nav className="editor-library" aria-label="Board library">
      {library.categories.map((category, index) => {
        const boards = library.boards.filter(b => b.categoryId === category.id);
        return (
          <section
            key={category.id}
            className={`library-category${target === category.id ? ' drop-target' : ''}`}
            style={{ '--category': category.color } as CSSProperties}
            onDragOver={event => {
              event.preventDefault();
              setTarget(category.id);
            }}
            onDragLeave={() => setTarget(null)}
            onDrop={event => drop(event, category.id)}
          >
            <header>
              <input
                type="color"
                className="category-color"
                aria-label={`${category.name} color`}
                value={category.color}
                list={`colors-${category.id}`}
                onChange={e => updateCategory(category.id, { color: e.target.value })}
              />
              <datalist id={`colors-${category.id}`}>
                {COLORS.map(c => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <input
                className="category-name"
                aria-label="Category name"
                defaultValue={category.name}
                key={category.name}
                maxLength={32}
                onBlur={e => {
                  const name = e.target.value.trim();
                  if (name && name !== category.name) updateCategory(category.id, { name });
                  else e.target.value = category.name;
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Move ${category.name} up`}
                disabled={index === 0}
                onClick={() => shiftCategory(index, -1)}
              >
                <ArrowUp size={15} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Move ${category.name} down`}
                disabled={index === library.categories.length - 1}
                onClick={() => shiftCategory(index, 1)}
              >
                <ArrowDown size={15} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Delete ${category.name}`}
                title={boards.length ? 'Move or delete its boards first' : 'Delete category'}
                disabled={boards.length > 0 || library.categories.length === 1}
                onClick={() =>
                  changeLayout({ ...library, categories: library.categories.filter(c => c.id !== category.id) })
                }
              >
                <Trash2 size={15} />
              </button>
            </header>
            <ul>
              {boards.map(board => (
                <li
                  key={board.id}
                  className={`library-board${board.id === activeId ? ' active' : ''}${dragging === board.id ? ' dragging' : ''}`}
                  draggable
                  onDragStart={event => {
                    event.dataTransfer.setData('text/x-board', board.id);
                    event.dataTransfer.effectAllowed = 'move';
                    setDragging(board.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => {
                    event.stopPropagation();
                    drop(event, category.id, board.id);
                  }}
                >
                  <button type="button" className="library-open" onClick={() => open(board.id)}>
                    <MapThumbnail tiles={board.tiles} />
                    <span>
                      <strong>{board.name}</strong>
                      <small>
                        {board.players.min === board.players.max
                          ? board.players.min
                          : `${board.players.min}–${board.players.max}`}{' '}
                        players
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Duplicate ${board.name}`}
                    onClick={() => duplicate(board.id)}
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Delete ${board.name}`}
                    onClick={() => remove(board.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="library-new">
              <button type="button" className="text-button" onClick={() => create('blank', category.id)}>
                <FilePlus2 size={15} />
                Blank
              </button>
              <button type="button" className="text-button" onClick={() => create('base', category.id)}>
                <Hexagon size={15} />
                Base
              </button>
            </div>
          </section>
        );
      })}
      <button
        type="button"
        className="button secondary full"
        onClick={() =>
          changeLayout({
            ...library,
            categories: [
              ...library.categories,
              {
                id: categoryId(library),
                name: 'New category',
                color: COLORS[library.categories.length % COLORS.length]!,
              },
            ],
          })
        }
      >
        <Plus size={17} />
        Add category
      </button>
    </nav>
  );
}
