import { AlertTriangle, ArrowLeft, Check, Copy, Eye, Map as MapIcon, Plus, Trash2, Users, X } from 'lucide-react';
import { type CSSProperties, type DragEvent, useEffect, useState } from 'react';
import { type BoardDesign, type BoardLibrary, designFor, thumbnailLayout } from '../../../shared/maps';
import { MAX_PLAYERS } from '../../../shared/settings';
import CategoryHeader from './CategoryHeader';
import MapDetail, { ExpansionTags } from './MapDetail';
import MapThumbnail from './MapThumbnail';
import { BASE_GAME, BASE_MAP_ID, baseCategoryId, moveBoard, playersLabel, playersMismatch } from './mapInfo';
import ProposeButton, { type Choose, type Proposing } from './ProposeButton';
import { SpecialTags } from './SpecialRules';
import './maps.css';

const COLORS = ['#1f7fa6', '#c4572b', '#3b8442', '#8a5bb8', '#b07c12', '#4f7684', '#c23a6b', '#2f9e8f'];

/** The browser's heading for who is looking and what they can do. */
function browserTitle(editing: boolean, choosing: boolean, proposing: boolean): string {
  if (editing) return 'Board editor';
  if (choosing) return 'Choose a map';
  return proposing ? 'Propose a map' : 'Maps';
}

/** Editor-only actions: the browser becomes the board library's manager. */
export interface LibraryActions {
  open: (id: string) => void;
  /** Edit the base game (asks first: every room that plays it changes). */
  editBase: () => void;
  create: (kind: 'blank' | 'base', categoryId: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  changeLayout: (library: BoardLibrary) => void;
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
  planned,
  currentId = null,
  currentLayout = null,
  choose,
  propose,
  close,
  closeLabel = 'Close maps',
  home,
  editing,
  initial,
}: {
  library: BoardLibrary | null;
  error?: string | null;
  /** The room's player count, for warnings and the default filter. */
  players: number;
  /** `players` is the number the host set, not the people seated. */
  planned?: boolean;
  currentId?: string | null;
  /** The layout of the current map the host picked, or null when the table's size picks it. */
  currentLayout?: { min: number; max: number } | null;
  /** The host uses a map. `layoutFor`: the layout made for this many players (maps with several layouts). */
  choose?: Choose;
  /** Seated people put maps forward (or take them back). */
  propose?: Proposing;
  close: () => void;
  closeLabel?: string;
  /** Shows a Home button that leaves this screen entirely (the editor's browser). */
  home?: () => void;
  editing?: LibraryActions;
  /** Open straight to this map (a lobby proposal), showing the layout for `layoutFor` players. */
  initial?: { design: BoardDesign; layoutFor: number | null };
}) {
  const [count, setCount] = useState<number | null>(editing ? null : Math.min(MAX_PLAYERS, Math.max(2, players)));
  const [open, setOpen] = useState<BoardDesign | null>(initial?.design ?? null);
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
  const view = (board: BoardDesign) => {
    if (!editing) setOpen(board);
    else if (board.id === BASE_MAP_ID) editing.editBase();
    else editing.open(board.id);
  };
  // The base game leads its category: the library's edited one, or the random standard island.
  const baseHome = library ? baseCategoryId(library) : undefined;
  const baseGame = library?.boards.find(b => b.id === BASE_MAP_ID) ?? BASE_GAME;
  const boardsIn = (categoryId: string) => [
    ...(categoryId === baseHome ? [baseGame] : []),
    ...(library?.boards.filter(b => b.categoryId === categoryId && b.id !== BASE_MAP_ID) ?? []),
  ];

  return (
    <div className="map-picker" role="dialog" aria-modal="true" aria-label={editing ? 'Boards' : 'Maps'}>
      <header className="map-picker-header">
        <h2>
          <MapIcon size={22} />
          {browserTitle(!!editing, !!choose, !!propose)}
        </h2>
        <div className="map-filter" role="radiogroup" aria-label="Players">
          <Users size={17} />
          {[null, ...PLAYER_COUNTS].map(n => (
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
        {home ? (
          <div className="map-picker-exit">
            {close !== home && (
              <button type="button" className="text-button" onClick={close}>
                {closeLabel}
              </button>
            )}
            <button type="button" className="button secondary" onClick={home}>
              <ArrowLeft size={17} />
              Home
            </button>
          </div>
        ) : (
          <button type="button" className="icon-button" aria-label={closeLabel} onClick={close}>
            <X />
          </button>
        )}
      </header>
      {open ? (
        <MapDetail
          design={open}
          players={players}
          planned={planned}
          layoutFor={open === initial?.design ? (initial.layoutFor ?? undefined) : undefined}
          current={open.id === currentId}
          currentLayout={currentLayout}
          choose={choose && (layoutFor => choose(open, layoutFor))}
          propose={propose}
          back={() => setOpen(null)}
        />
      ) : (
        <div className="map-picker-body">
          {!library && !error && <p className="muted">Loading maps…</p>}
          {error && <p className="inline-alert">{error}</p>}
          {library?.categories.map((category, index) => {
            const boards = boardsIn(category.id);
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
                        className={cardClass(board, currentId, misfit, dragging)}
                        draggable={!!editing && board.id !== BASE_MAP_ID}
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
                          <MapThumbnail
                            tiles={(count === null ? thumbnailLayout(board) : designFor(board, count)).tiles}
                          />
                          <span className="map-card-name">{board.name}</span>
                          <ExpansionTags design={board} />
                          <SpecialTags design={board} />
                          <span className="map-card-meta">
                            <span>{playersLabel(board)} players</span>
                            <span>{board.victoryPoints} points</span>
                            {!editing && playersMismatch(board, players) && (
                              <span className="map-card-warning" title={`Made for ${playersLabel(board)} players`}>
                                <AlertTriangle size={14} />
                              </span>
                            )}
                            {board.id === currentId && <Check size={15} aria-label="Current map" />}
                          </span>
                        </button>
                        <div className="map-card-actions">
                          {editing ? (
                            // The unedited base game is not in the library: nothing to copy or delete.
                            board !== BASE_GAME && (
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
                                  aria-label={board.id === BASE_MAP_ID ? 'Reset the base game' : `Delete ${board.name}`}
                                  data-tip={board.id === BASE_MAP_ID ? 'Back to the random standard island' : undefined}
                                  onClick={() => editing.remove(board.id)}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )
                          ) : (
                            <>
                              <button
                                type="button"
                                className="text-button map-card-view"
                                aria-label="View"
                                onClick={() => setOpen(board)}
                              >
                                <Eye size={16} />
                                <span>View</span>
                              </button>
                              {propose && <ProposeButton design={board} propose={propose} />}
                              {choose && (
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

/** Player counts the filter offers. */
const PLAYER_COUNTS = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2);

/** A card's classes: the room's map, made for another count, being dragged, or the base game. */
function cardClass(board: BoardDesign, currentId: string | null, misfit: boolean, dragging: string | null): string {
  const parts = ['map-card'];
  if (board.id === currentId) parts.push('current');
  if (misfit) parts.push('misfit');
  if (dragging === board.id) parts.push('dragging');
  if (board.id === BASE_MAP_ID) parts.push('base-game');
  return parts.join(' ');
}

/** A new category id that isn't taken. */
function freshCategoryId(library: BoardLibrary): string {
  for (let n = library.categories.length + 1; ; n++)
    if (!library.categories.some(c => c.id === `category-${n}`)) return `category-${n}`;
}
