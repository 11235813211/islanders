import { AlertTriangle, ArrowLeft, Check, Copy, Eye, Map as MapIcon, Plus, Trash2, Users, X } from 'lucide-react';
import { type CSSProperties, type DragEvent, useEffect, useState } from 'react';
import type { BoardDesign, BoardLibrary } from '../../../shared/maps';
import CategoryHeader from './CategoryHeader';
import DesignView from './DesignView';
import MapThumbnail from './MapThumbnail';
import { mapRules, moveBoard, playerRange, playersMismatch } from './mapInfo';
import './maps.css';

const COLORS = ['#1f7fa6', '#c4572b', '#3b8442', '#8a5bb8', '#b07c12', '#4f7684', '#c23a6b', '#2f9e8f'];

/** Editor-only actions: the browser becomes the board library's manager. */
export interface LibraryActions {
  open: (id: string) => void;
  create: (kind: 'blank' | 'base', categoryId: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  changeLayout: (library: BoardLibrary) => void;
}

/** One map, large, with its rules. Read-only; the host can choose it from here. */
function MapDetail({
  design,
  players,
  canChoose,
  current,
  choose,
  back,
}: {
  design: BoardDesign;
  players: number;
  canChoose: boolean;
  current: boolean;
  choose: () => void;
  back: () => void;
}) {
  const land = design.tiles.filter(t => t.kind !== 'sea' && t.kind !== 'iceberg').length;
  return (
    <div className="map-detail">
      <DesignView design={design} />
      <aside className="map-info">
        <button type="button" className="text-button" onClick={back}>
          <ArrowLeft size={17} />
          All maps
        </button>
        <h3>{design.name}</h3>
        {design.description && <p>{design.description}</p>}
        <dl>
          <dt>Players</dt>
          <dd>{playerRange(design.players)}</dd>
          <dt>Points to win</dt>
          <dd>{design.victoryPoints}</dd>
          <dt>Land tiles</dt>
          <dd>{land}</dd>
          <dt>Harbors</dt>
          <dd>{design.harbors.length}</dd>
        </dl>
        {playersMismatch(design, players) && (
          <p className="map-warning" role="note">
            <AlertTriangle size={17} />
            Made for {playerRange(design.players)} players. This room has {players}.
          </p>
        )}
        <p className="map-note">Tiles, numbers, and harbors marked “?” are drawn at random when the game starts.</p>
        <ul className="map-rules">
          {mapRules(design).map(rule => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        {canChoose && (
          <button type="button" className="button primary full" disabled={current} onClick={choose}>
            <Check size={18} />
            {current ? 'This room’s map' : 'Use this map'}
          </button>
        )}
      </aside>
    </div>
  );
}

/**
 * Full-screen map browser by category. In the lobby (`pick`) every map can be viewed and the host
 * can use one; in the editor (`edit`) opening a map edits it, and categories and boards can be
 * rearranged. Maps made for another player count are grayed out, never hidden.
 */
export default function MapBrowser({
  library,
  error,
  players,
  currentId = null,
  canChoose = false,
  choose = () => {},
  close,
  closeLabel = 'Close maps',
  editing,
}: {
  library: BoardLibrary | null;
  error?: string | null;
  /** The room's player count, for warnings and the default filter. */
  players: number;
  currentId?: string | null;
  canChoose?: boolean;
  choose?: (design: BoardDesign) => void;
  close: () => void;
  closeLabel?: string;
  editing?: LibraryActions;
}) {
  const [count, setCount] = useState<number | null>(editing ? null : Math.min(4, Math.max(2, players)));
  const [open, setOpen] = useState<BoardDesign | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (open) setOpen(null);
      else close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const layout = (next: BoardLibrary) => editing?.changeLayout(next);
  const drop = (event: DragEvent, categoryId: string, beforeId?: string) => {
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer.getData('text/x-board') || dragging;
    setDragging(null);
    setTarget(null);
    if (id && library) layout(moveBoard(library, id, categoryId, beforeId));
  };
  const view = (board: BoardDesign) => (editing ? editing.open(board.id) : setOpen(board));

  return (
    <div className="map-picker" role="dialog" aria-modal="true" aria-label={editing ? 'Boards' : 'Maps'}>
      <header className="map-picker-header">
        <h2>
          <MapIcon size={22} />
          {editing ? 'Board editor' : canChoose ? 'Choose a map' : 'Maps'}
        </h2>
        <div className="map-filter" role="radiogroup" aria-label="Players">
          <Users size={17} />
          {[null, 2, 3, 4].map(n => (
            // biome-ignore lint/a11y/useSemanticElements: a segmented control of buttons.
            <button
              key={n ?? 'all'}
              type="button"
              role="radio"
              aria-checked={count === n}
              aria-label={n === null ? 'All maps' : `Maps for ${n} players`}
              onClick={() => setCount(n)}
            >
              {n ?? 'All'}
            </button>
          ))}
        </div>
        <button type="button" className="icon-button" aria-label={closeLabel} onClick={close}>
          <X />
        </button>
      </header>
      {open ? (
        <MapDetail
          design={open}
          players={players}
          canChoose={canChoose}
          current={open.id === currentId}
          choose={() => choose(open)}
          back={() => setOpen(null)}
        />
      ) : (
        <div className="map-picker-body">
          {!library && !error && <p className="muted">Loading maps…</p>}
          {error && <p className="inline-alert">{error}</p>}
          {library?.categories.map((category, index) => {
            const boards = library.boards.filter(b => b.categoryId === category.id);
            if (!boards.length && !editing) return null;
            return (
              <section
                key={category.id}
                className={`map-category${target === category.id ? ' drop-target' : ''}`}
                style={{ '--category': category.color } as CSSProperties}
                onDragOver={event => {
                  if (!editing) return;
                  event.preventDefault();
                  setTarget(category.id);
                }}
                onDragLeave={() => setTarget(null)}
                onDrop={event => editing && drop(event, category.id)}
              >
                <CategoryHeader
                  category={category}
                  count={boards.length}
                  editing={!!editing}
                  first={index === 0}
                  last={index === library.categories.length - 1}
                  only={library.categories.length === 1}
                  update={patch =>
                    layout({
                      ...library,
                      categories: library.categories.map(c => (c.id === category.id ? { ...c, ...patch } : c)),
                    })
                  }
                  move={by => {
                    const categories = [...library.categories];
                    const [moved] = categories.splice(index, 1);
                    categories.splice(index + by, 0, moved!);
                    layout({ ...library, categories });
                  }}
                  remove={() =>
                    layout({ ...library, categories: library.categories.filter(c => c.id !== category.id) })
                  }
                  create={kind => editing?.create(kind, category.id)}
                />
                <div className="map-grid">
                  {boards.map(board => {
                    const misfit = count !== null && playersMismatch(board, count);
                    return (
                      <article
                        key={board.id}
                        className={`map-card${board.id === currentId ? ' current' : ''}${misfit ? ' misfit' : ''}${dragging === board.id ? ' dragging' : ''}`}
                        draggable={!!editing}
                        onDragStart={event => {
                          event.dataTransfer.setData('text/x-board', board.id);
                          setDragging(board.id);
                        }}
                        onDragEnd={() => setDragging(null)}
                        onDragOver={event => editing && event.preventDefault()}
                        onDrop={event => editing && drop(event, category.id, board.id)}
                      >
                        <button
                          type="button"
                          className="map-card-open"
                          aria-label={`${editing ? 'Edit' : 'View'} ${board.name}`}
                          onClick={() => view(board)}
                        >
                          <MapThumbnail tiles={board.tiles} />
                          <span className="map-card-name">{board.name}</span>
                          <span className="map-card-meta">
                            <span>{playerRange(board.players)} players</span>
                            <span>{board.victoryPoints} points</span>
                            {!editing && playersMismatch(board, players) && (
                              <span
                                className="map-card-warning"
                                title={`Made for ${playerRange(board.players)} players`}
                              >
                                <AlertTriangle size={14} />
                              </span>
                            )}
                            {board.id === currentId && <Check size={15} aria-label="Current map" />}
                          </span>
                        </button>
                        <div className="map-card-actions">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`Duplicate ${board.name}`}
                                onClick={() => editing.duplicate(board.id)}
                              >
                                <Copy size={16} />
                              </button>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`Delete ${board.name}`}
                                onClick={() => editing.remove(board.id)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="text-button" onClick={() => setOpen(board)}>
                                <Eye size={16} />
                                View
                              </button>
                              {canChoose && (
                                <button
                                  type="button"
                                  className="button primary"
                                  aria-label={`Use ${board.name}`}
                                  disabled={board.id === currentId}
                                  onClick={() => choose(board)}
                                >
                                  <Check size={16} />
                                  Use
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                  {!boards.length && <p className="muted map-empty">Drag boards here, or start a new one.</p>}
                </div>
              </section>
            );
          })}
          {editing && library && (
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                layout({
                  ...library,
                  categories: [
                    ...library.categories,
                    {
                      id: freshCategoryId(library),
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
          )}
        </div>
      )}
    </div>
  );
}

/** A new category id that isn't taken. */
function freshCategoryId(library: BoardLibrary): string {
  for (let n = library.categories.length + 1; ; n++)
    if (!library.categories.some(c => c.id === `category-${n}`)) return `category-${n}`;
}
