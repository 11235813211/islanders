import { ArrowLeft, Eye, FlaskConical, Library, Redo2, Save, SlidersHorizontal, Undo2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardDesign, BoardLibrary, DesignKind } from '../../../shared/maps';
import { newDesign, stepNumber, updateTile } from '../../../shared/maps/edit';
import type { AccountSession } from '../../../shared/types';
import { publishLibrary, useBoardLibrary } from '../../hooks/useBoardLibrary';
import { useHistory } from '../../hooks/useHistory';
import { deleteBoard, saveBoard, saveLayout } from '../../lib/boardsApi';
import { MapPreview } from '../maps/MapPicker';
import BoardSettings from './BoardSettings';
import EditorCanvas, { type EditorSelection, type Tool } from './EditorCanvas';
import EditorLibrary from './EditorLibrary';
import Inspector, { KIND_LABELS, KIND_ORDER } from './Inspector';
import { freshId, TOOLS, typing } from './tools';
import './editor.css';

/**
 * Board editor for admins: a library of boards in categories on the left, the board on a canvas
 * in the middle, and settings for the board or the selected tile on the right.
 */
export default function BoardEditor({
  account,
  close,
  playtest,
}: {
  account: AccountSession | null;
  close: () => void;
  playtest: (mapId: string) => void;
}) {
  const { library: served, error: loadError } = useBoardLibrary();
  const [pending, setPending] = useState<BoardLibrary | null>(null);
  const library = pending ?? served;
  const history = useHistory<BoardDesign | null>(null);
  const design = history.value;
  const saved = useRef('');
  const [selection, select] = useState<EditorSelection>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [brush, setBrush] = useState<DesignKind>('gold');
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [panel, setPanel] = useState<'library' | 'inspector' | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = !!design && JSON.stringify(design) !== saved.current;
  const edit = useCallback(
    (change: (d: BoardDesign) => BoardDesign, group?: string) => history.set(d => (d ? change(d) : d), group),
    [history.set],
  );

  const load = (next: BoardDesign, savedAlready: boolean) => {
    history.reset(structuredClone(next));
    saved.current = savedAlready ? JSON.stringify(next) : '';
    select(null);
    setPanel(null);
  };
  // Open the first board once the library arrives.
  useEffect(() => {
    if (!design && served?.boards[0]) load(served.boards[0], true);
  });
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function run<T>(task: () => Promise<T>, done?: string): Promise<T | undefined> {
    setBusy(true);
    try {
      const result = await task();
      if (done) setMessage(done);
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That did not work. Try again.');
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  const replaceBoard = (lib: BoardLibrary, board: BoardDesign) => ({
    ...lib,
    boards: lib.boards.some(b => b.id === board.id)
      ? lib.boards.map(b => (b.id === board.id ? board : b))
      : [...lib.boards, board],
  });
  async function save(board = design): Promise<boolean> {
    if (!board || !library) return false;
    const result = await run(() => saveBoard(account, board), `Saved ${board.name}.`);
    if (!result) return false;
    publishLibrary(replaceBoard(library, result));
    if (board === design) saved.current = JSON.stringify(board);
    history.set(d => (d && d.id === result.id ? { ...d, updatedAt: result.updatedAt } : d));
    saved.current = JSON.stringify({ ...board, updatedAt: result.updatedAt });
    return true;
  }
  const leaveUnsaved = () => !dirty || window.confirm('Discard unsaved changes to this board?');
  function open(id: string) {
    const board = library?.boards.find(b => b.id === id);
    if (board && board.id !== design?.id && leaveUnsaved()) load(board, true);
  }
  async function create(kind: 'blank' | 'base', categoryId: string, from?: BoardDesign) {
    if (!library || !leaveUnsaved()) return;
    const name = from ? `${from.name} copy` : kind === 'blank' ? 'New board' : 'New base board';
    const board = from
      ? { ...structuredClone(from), id: freshId(library, name), name }
      : newDesign(kind, freshId(library, name), categoryId, name);
    load(board, false);
    if (account) await save(board);
  }
  async function remove(id: string) {
    const board = library?.boards.find(b => b.id === id);
    if (!library || !board || !window.confirm(`Delete ${board.name}? This cannot be undone.`)) return;
    if (await run(() => deleteBoard(account, id), `Deleted ${board.name}.`)) {
      const next = { ...library, boards: library.boards.filter(b => b.id !== id) };
      publishLibrary(next);
      if (design?.id === id) {
        history.reset(next.boards[0] ? structuredClone(next.boards[0]) : null);
        saved.current = next.boards[0] ? JSON.stringify(next.boards[0]) : '';
      }
    }
  }
  async function changeLayout(next: BoardLibrary) {
    setPending(next);
    const result = await run(() => saveLayout(account, next));
    setPending(null);
    if (result) publishLibrary(result);
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: shortcuts read the latest state on each render.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
        return;
      }
      if (typing(event.target)) return;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        history.redo();
        return;
      }
      if (mod || event.altKey) return;
      const found = TOOLS.find(t => t.key === event.key.toLowerCase());
      if (found) setTool(found.tool);
      if (event.key === 'Escape') select(null);
      if (selection?.kind === 'tile' && ['ArrowUp', 'ArrowDown', '+', '-', '='].includes(event.key)) {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' || event.key === '-' ? -1 : 1;
        edit(d =>
          updateTile(d, selection.q, selection.r, {
            number: stepNumber(d.tiles.find(t => t.q === selection.q && t.r === selection.r)?.number, delta),
          }),
        );
      }
      if (selection && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        if (selection.kind === 'tile')
          edit(d => ({ ...d, tiles: d.tiles.filter(t => t.q !== selection.q || t.r !== selection.r) }));
        else
          edit(d => ({
            ...d,
            harbors: d.harbors.filter(h => h.q !== selection.q || h.r !== selection.r || h.side !== selection.side),
          }));
        select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const active = TOOLS.find(t => t.tool === tool)!;
  return (
    <main className={`board-editor${panel ? ` show-${panel}` : ''}`}>
      <header className="editor-bar">
        <button type="button" className="text-button" aria-label="Home" onClick={() => leaveUnsaved() && close()}>
          <ArrowLeft size={18} />
          <span className="editor-label">Home</span>
        </button>
        <h1>Board editor</h1>
        <div className="editor-tools" role="toolbar" aria-label="Tools">
          {TOOLS.map(t => (
            <button
              key={t.tool}
              type="button"
              aria-pressed={tool === t.tool}
              title={`${t.hint} (${t.key.toUpperCase()})`}
              onClick={() => setTool(t.tool)}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
          <select aria-label="Brush terrain" value={brush} onChange={e => setBrush(e.target.value as DesignKind)}>
            {KIND_ORDER.map(kind => (
              <option key={kind} value={kind}>
                Brush: {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
        <div className="editor-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="Undo"
            disabled={!history.canUndo}
            onClick={history.undo}
          >
            <Undo2 size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Redo"
            disabled={!history.canRedo}
            onClick={history.redo}
          >
            <Redo2 size={18} />
          </button>
          <button
            type="button"
            className="button secondary"
            aria-label="Preview"
            disabled={!design}
            onClick={() => setPreview(true)}
          >
            <Eye size={17} />
            <span className="editor-label">Preview</span>
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={!design || busy || !account}
            title={account ? 'Save, then open a solo test room on this board' : 'Sign in to play test'}
            aria-label="Play test"
            onClick={async () => {
              if (design && (!dirty || (await save()))) playtest(design.id);
            }}
          >
            <FlaskConical size={17} />
            <span className="editor-label">Play test</span>
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!design || busy || !account || !dirty}
            title={account ? 'Save (Ctrl/⌘ S)' : 'Sign in to save boards'}
            aria-label={dirty ? 'Save' : 'Saved'}
            onClick={() => void save()}
          >
            <Save size={17} />
            <span className="editor-label">{dirty ? 'Save' : 'Saved'}</span>
          </button>
        </div>
        <div className="editor-panels">
          <button
            type="button"
            className="icon-button"
            aria-label="Show library"
            onClick={() => setPanel(p => (p === 'library' ? null : 'library'))}
          >
            <Library size={19} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Show settings"
            onClick={() => setPanel(p => (p === 'inspector' ? null : 'inspector'))}
          >
            <SlidersHorizontal size={19} />
          </button>
        </div>
      </header>
      {!account && <p className="editor-notice">Sign in to save boards. You can still draw and preview.</p>}
      {library ? (
        <EditorLibrary
          library={library}
          activeId={design?.id ?? null}
          open={open}
          create={(kind, categoryId) => void create(kind, categoryId)}
          duplicate={id => {
            const board = library.boards.find(b => b.id === id);
            if (board) void create('blank', board.categoryId, board);
          }}
          remove={id => void remove(id)}
          changeLayout={next => void changeLayout(next)}
        />
      ) : (
        <nav className="editor-library">
          <p className="muted">{loadError ?? 'Loading boards…'}</p>
        </nav>
      )}
      <section className="editor-stage">
        {design ? (
          <EditorCanvas
            design={design}
            selection={selection}
            select={select}
            tool={tool}
            brush={brush}
            edit={edit}
            fitKey={design.id}
          />
        ) : (
          <p className="muted editor-empty">Create a board from the library.</p>
        )}
        <p className="editor-hint">
          <strong>{active.label}:</strong> {active.hint}. Shift-drag land · Ctrl/⌘-drag{' '}
          {KIND_LABELS[brush].toLowerCase()} · Alt-drag delete · Click a number to raise it, Shift-click to lower ·
          Scroll to pan, Ctrl/⌘-scroll to zoom
        </p>
      </section>
      <aside className="editor-inspector" aria-label="Settings">
        {design && library && (
          <>
            <Inspector design={design} selection={selection} select={select} edit={edit} />
            <BoardSettings design={design} categories={library.categories} edit={edit} />
          </>
        )}
      </aside>
      {message && (
        <div className="toast toast-info" role="status">
          <span>{message}</span>
          <button type="button" className="icon-button" aria-label="Dismiss message" onClick={() => setMessage(null)}>
            <X />
          </button>
        </div>
      )}
      {preview && design && (
        <div className="map-picker" role="dialog" aria-modal="true" aria-label="Preview">
          <header className="map-picker-header">
            <h2>Preview: {design.name}</h2>
            <button type="button" className="icon-button" aria-label="Close preview" onClick={() => setPreview(false)}>
              <X />
            </button>
          </header>
          <MapPreview design={design} />
        </div>
      )}
    </main>
  );
}
