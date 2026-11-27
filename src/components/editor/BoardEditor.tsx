import { ChevronLeft, ChevronRight, Eye, FlaskConical, LayoutGrid, Lock, Redo2, Save, Undo2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardDesign, BoardLibrary, DesignKind } from '../../../shared/maps';
import { BASE_BOARD_ID, baseGameDesign, newDesign, paint, stepNumber, updateTile } from '../../../shared/maps/edit';
import type { RouteTarget } from '../../../shared/maps/special-edit';
import type { AccountSession } from '../../../shared/types';
import { publishLibrary, useBoardLibrary } from '../../hooks/useBoardLibrary';
import { useBoardLock } from '../../hooks/useBoardLock';
import { useHistory } from '../../hooks/useHistory';
import { deleteBoard, saveBoard, saveLayout } from '../../lib/boardsApi';
import MapBrowser from '../maps/MapBrowser';
import MapPreview from '../maps/MapPreview';
import { baseCategoryId } from '../maps/mapInfo';
import BoardFields, { BoardName } from './BoardFields';
import BoardSettings from './BoardSettings';
import type { CandyTrainControls } from './CandyTrainTools';
import EditorCanvas, { type EditorSelection, type Tool } from './EditorCanvas';
import EditorHelp from './EditorHelp';
import EditorToolbar from './EditorToolbar';
import type { Refill } from './FillBar';
import Inspector from './Inspector';
import LinkRules from './LinkRules';
import NumberSettings from './NumberSettings';
import SpecialSettings from './SpecialSettings';
import { freshId, KIND_LABELS, TOOLS, typing } from './tools';
import VersionTabs from './VersionTabs';
import { addVersion, editVersion, mergeShown, removeVersion, showVersion } from './versions';
import './editor.css';

/**
 * Board editor for admins. It opens on the board browser (the same one the lobby uses), where
 * boards and categories are arranged; opening a board shows it on a canvas, with the selected
 * tile and the random fill on the right.
 */
export default function BoardEditor({
  account,
  close,
  playtest,
  leaveCheck,
}: {
  account: AccountSession | null;
  close: () => void;
  playtest: (mapId: string) => void;
  /** Set to a check the site header runs before leaving (false keeps the editor open). */
  leaveCheck: { current: (() => boolean) | null };
}) {
  const { library: served, error: loadError, reload } = useBoardLibrary();
  const [browsing, setBrowsing] = useState(true);
  /** The last fill pressed: pressing it again draws again from the same starting design. */
  const lastFill = useRef<{ key: string; base: BoardDesign; result: BoardDesign } | null>(null);
  const [pending, setPending] = useState<BoardLibrary | null>(null);
  const library = pending ?? served;
  const history = useHistory<BoardDesign | null>(null);
  const design = history.value;
  const saved = useRef('');
  /** False for a new blank or base board until its first save: one left unchanged is never added. */
  const [stored, setStored] = useState(true);
  const [selection, select] = useState<EditorSelection>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [trainRoute, setTrainRoute] = useState(0);
  const [trainPaused, setTrainPaused] = useState(false);
  const train: CandyTrainControls = {
    route: trainRoute,
    select: setTrainRoute,
    paused: trainPaused,
    pause: () => setTrainPaused(p => !p),
  };
  const [brush, setBrush] = useState<DesignKind>('gold');
  const [linkLetter, setLinkLetter] = useState<string | null>('A');
  const [routeTarget, setRouteTarget] = useState<RouteTarget>({ route: 0, zone: 'start' });
  /** Which version (by player count) is being edited: null for the main layout. */
  const [version, setVersionState] = useState<number | null>(null);
  const shown = useMemo(() => design && showVersion(design, version), [design, version]);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [panel, setPanel] = useState<'inspector' | null>(null);
  /** Desktop: the settings panel tucked away to give the canvas the full width. */
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = !!design && JSON.stringify(design) !== saved.current;
  // While another editor has this board open, it is read-only here. When they leave, load what they saved.
  const lockedBy = useBoardLock(account, design?.id ?? null, async () => {
    const fresh = await reload();
    const board = fresh?.boards.find(b => b.id === design?.id);
    if (board) load(board, true);
    setMessage('The board is free. You can edit it now.');
  });
  const readOnly = !!lockedBy;
  const edit = useCallback(
    (change: (d: BoardDesign) => BoardDesign, group?: string) => {
      if (!readOnly) history.set(d => (d ? editVersion(d, version, change) : d), group);
    },
    [history.set, readOnly, version],
  );

  const load = (next: BoardDesign, savedAlready: boolean) => {
    history.reset(structuredClone(next));
    saved.current = savedAlready ? JSON.stringify(next) : '';
    setStored(true);
    lastFill.current = null;
    setVersionState(null);
    setTrainRoute(0);
    select(null);
    setPanel(null);
    setBrowsing(false);
  };
  const refill: Refill = (key, fill) => {
    if (!design || !shown || readOnly) return;
    const last = lastFill.current;
    const again = last && last.key === key && JSON.stringify(last.result) === JSON.stringify(shown);
    const base = again ? last.base : shown;
    const result = fill(base, Math.random);
    lastFill.current = { key, base, result };
    history.set(d => (d ? mergeShown(d, version, result) : d));
  };
  const setVersion = (next: number | null) => {
    setVersionState(next);
    setTrainRoute(0);
    lastFill.current = null;
    select(null);
  };
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
    if (!board || !library || readOnly) return false;
    const result = await run(() => saveBoard(account, board), `Saved ${board.name}.`);
    if (!result) return false;
    publishLibrary(replaceBoard(library, result));
    if (board === design) saved.current = JSON.stringify(board);
    history.set(d => (d && d.id === result.id ? { ...d, updatedAt: result.updatedAt } : d));
    saved.current = JSON.stringify({ ...board, updatedAt: result.updatedAt });
    if (board.id === design?.id) setStored(true);
    return true;
  }
  const leaveUnsaved = () => !dirty || window.confirm('Discard unsaved changes to this board?');
  const goHome = () => {
    if (leaveUnsaved()) close();
  };
  // The site header's Home button asks here first, so unsaved changes aren't lost.
  leaveCheck.current = leaveUnsaved;
  function open(id: string) {
    const board = library?.boards.find(b => b.id === id);
    if (!board) return;
    if (board.id === design?.id) setBrowsing(false);
    else if (leaveUnsaved()) load(board, true);
  }
  /** The base game is what rooms play unless they pick a map, so editing it asks first. */
  function editBase() {
    if (!library) return;
    const edited = library.boards.some(b => b.id === BASE_BOARD_ID);
    if (
      !window.confirm(
        'Edit the base game? Every room plays it unless another map is picked, so once saved your changes apply to all new games on the base game. Delete it later to go back to the random standard island.',
      )
    )
      return;
    if (edited) return open(BASE_BOARD_ID);
    if (!leaveUnsaved()) return;
    load(baseGameDesign(baseCategoryId(library) ?? library.categories[0]?.id ?? ''), true);
    setStored(false);
  }
  async function create(kind: 'blank' | 'base', categoryId: string, from?: BoardDesign) {
    if (!library || !leaveUnsaved()) return;
    const name = from ? `${from.name} copy` : kind === 'blank' ? 'New board' : 'New base board';
    if (from) {
      const copy = { ...structuredClone(from), id: freshId(library, name), name };
      load(copy, false);
      if (account) await save(copy);
      return;
    }
    // A new blank or base board counts as saved, so leaving it unchanged discards it without a question.
    // Its id gets a random tail: unsaved, it is not in the library to keep another editor's new board from taking the same id.
    const id = freshId(library, `${name} ${Math.random().toString(36).slice(2, 6)}`);
    load(newDesign(kind, id, categoryId, name), true);
    setStored(false);
  }
  async function remove(id: string) {
    const board = library?.boards.find(b => b.id === id);
    const question =
      id === BASE_BOARD_ID
        ? 'Reset the base game? Rooms go back to the random standard island. Your edits cannot be recovered.'
        : `Delete ${board?.name}? This cannot be undone.`;
    if (!library || !board || !window.confirm(question)) return;
    if (await run(() => deleteBoard(account, id), `Deleted ${board.name}.`)) {
      const next = { ...library, boards: library.boards.filter(b => b.id !== id) };
      publishLibrary(next);
      if (design?.id === id) {
        history.reset(null);
        saved.current = '';
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
        // An unchanged new board is not added to the library.
        if (dirty || stored) void save();
        return;
      }
      if (typing(event.target) || browsing) return;
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
        if (selection.kind === 'tile') edit(d => paint(d, [selection], 'erase'));
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
  const backToBoard = () => setBrowsing(false);
  if (browsing || !design)
    return (
      <>
        <MapBrowser
          library={library}
          error={loadError}
          players={4}
          close={design ? backToBoard : goHome}
          closeLabel={design ? 'Back to the board' : 'Close board editor'}
          home={goHome}
          editing={{
            open,
            editBase,
            create: (kind, categoryId) => void create(kind, categoryId),
            duplicate: id => {
              const board = library?.boards.find(b => b.id === id);
              if (board) void create('blank', board.categoryId, board);
            },
            remove: id => void remove(id),
            changeLayout: next => void changeLayout(next),
          }}
        />
        {!account && <p className="editor-notice floating">Sign in to save boards.</p>}
        {message && <Toast message={message} dismiss={() => setMessage(null)} />}
      </>
    );
  return (
    <main
      className={`board-editor${tool === 'train' ? ' train-editing' : ''}${panel ? ` show-${panel}` : ''}${collapsed ? ' inspector-collapsed' : ''}`}
    >
      <header className="editor-bar">
        <div className="editor-bar-top">
          <button type="button" className="text-button" aria-label="All boards" onClick={() => setBrowsing(true)}>
            <LayoutGrid size={18} />
            <span className="editor-label">All boards</span>
          </button>
          {shown && <BoardName design={shown} edit={edit} />}
          <VersionTabs
            design={design}
            version={version}
            setVersion={setVersion}
            add={() => {
              history.set(d => (d && shown ? addVersion(d, shown) : d));
              setVersion(design.versions?.length ?? 0);
            }}
            remove={i => {
              history.set(d => (d ? removeVersion(d, i) : d));
              setVersion(null);
            }}
            setThumbnail={players => edit(d => ({ ...d, thumbnail: players }))}
          />
          <div className="editor-actions">
            <EditorHelp />
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
              title="Draw a sample game board from this design"
              onClick={() => setPreview(true)}
            >
              <Eye size={17} />
              <span className="editor-label">Preview</span>
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy || !account}
              title={account ? 'Save, then open a solo test room on this board' : 'Sign in to play test'}
              aria-label="Play test"
              onClick={async () => {
                if ((!dirty && stored) || (await save())) playtest(design.id);
              }}
            >
              <FlaskConical size={17} />
              <span className="editor-label">Play test</span>
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy || !account || !dirty || readOnly}
              title={saveTitle(!!account, dirty || stored)}
              aria-label={saveLabel(dirty, stored)}
              onClick={() => void save()}
            >
              <Save size={17} />
              <span className="editor-label">{saveLabel(dirty, stored)}</span>
            </button>
          </div>
        </div>
        {library && shown && <BoardFields design={shown} categories={library.categories} edit={edit} />}
        <EditorToolbar
          design={shown!}
          tool={tool}
          setTool={setTool}
          brush={brush}
          setBrush={setBrush}
          linkLetter={linkLetter}
          setLinkLetter={setLinkLetter}
          train={train}
          routeTarget={routeTarget}
          setRouteTarget={setRouteTarget}
          edit={edit}
          refill={refill}
          togglePanel={() => setPanel(p => (p === 'inspector' ? null : 'inspector'))}
        />
      </header>
      {!account && <p className="editor-notice">Sign in to save boards. You can still draw and preview.</p>}
      {lockedBy && (
        <p className="editor-notice" role="status">
          <Lock size={15} /> {lockedBy} You can look, but not change it, until they leave.
        </p>
      )}
      <section className="editor-stage">
        <EditorCanvas
          design={shown!}
          selection={selection}
          select={select}
          tool={tool}
          brush={brush}
          linkLetter={linkLetter}
          train={train}
          routeTarget={routeTarget}
          edit={edit}
          fitKey={`${design.id}:${version ?? ''}`}
        />
        <button
          type="button"
          className="inspector-toggle"
          aria-label={collapsed ? 'Show settings panel' : 'Hide settings panel'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(c => !c)}
        >
          {collapsed ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
        <p className="editor-hint">
          <strong>{active.label}:</strong> {active.hint}. Space-drag sea · Shift-drag land · Ctrl/⌘-drag{' '}
          {KIND_LABELS[brush].toLowerCase()} · Alt-drag delete · Click a number to raise it, Shift-click to lower
        </p>
      </section>
      <aside className="editor-inspector" aria-label="Settings">
        <Inspector design={shown!} selection={selection} select={select} edit={edit} />
        <BoardSettings design={shown!} edit={edit} selection={selection} />
        <NumberSettings design={shown!} edit={edit} selection={selection} />
        <LinkRules design={shown!} edit={edit} />
        <SpecialSettings
          design={shown!}
          edit={edit}
          routes={{
            target: routeTarget,
            paint: target => {
              setRouteTarget(target);
              setTool('route');
            },
          }}
        />
      </aside>
      {message && <Toast message={message} dismiss={() => setMessage(null)} />}
      {preview && (
        <div className="map-picker" role="dialog" aria-modal="true" aria-label="Preview">
          <header className="map-picker-header">
            <h2>Sample draw: {design.name}</h2>
            <button type="button" className="icon-button" aria-label="Close preview" onClick={() => setPreview(false)}>
              <X />
            </button>
          </header>
          <MapPreview design={shown!} />
        </div>
      )}
    </main>
  );
}

/** The save button's word: a new board left unchanged is not saved at all. */
function saveLabel(dirty: boolean, stored: boolean): string {
  if (dirty) return 'Save';
  return stored ? 'Saved' : 'Not saved';
}

/** The save button's tooltip. */
function saveTitle(signedIn: boolean, changed: boolean): string {
  if (!signedIn) return 'Sign in to save boards';
  return changed ? 'Save (Ctrl/⌘ S)' : 'Change the board to save it. Unchanged new boards are not kept.';
}

function Toast({ message, dismiss }: { message: string; dismiss: () => void }) {
  return (
    <div className="toast toast-info" role="status">
      <span>{message}</span>
      <button type="button" className="icon-button" aria-label="Dismiss message" onClick={dismiss}>
        <X />
      </button>
    </div>
  );
}
