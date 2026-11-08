import { DurableObject } from 'cloudflare:workers';
import {
  type BoardCategory,
  type BoardDesign,
  type BoardLibrary,
  DESIGN_LIMITS,
  DesignError,
  mergeLibrary,
  parseCategories,
  parseDesign,
  type StoredLibrary,
} from '../shared/maps';
import type { Env } from './env';
import { ProtocolError, record } from './protocol';

/** The library's table of contents. Each board is stored under its own key (`board:<id>`). */
interface LibraryIndex {
  categories: BoardCategory[];
  order: string[];
  knownBuiltins: string[];
}

const boardKey = (id: string) => `board:${id}`;

/** RPC results. Errors thrown across RPC lose their type, so failures come back as values (as in accounts.ts). */
export type LibraryResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

/** Run an edit; turn rule violations into a failed result. */
async function attempt<T>(edit: () => Promise<T>): Promise<LibraryResult<T>> {
  try {
    return { ok: true, value: await edit() };
  } catch (error) {
    if (error instanceof DesignError) return { ok: false, status: 400, error: error.message };
    if (error instanceof ProtocolError) return { ok: false, status: error.status, error: error.message };
    throw error;
  }
}

/**
 * Saved boards and categories for the map picker and editor: one instance for the whole site
 * (see libraryStub). Until an editor saves something, it serves the built-in boards.
 */
export class BoardLibraryStore extends DurableObject<Env> {
  private queue: Promise<unknown> = Promise.resolve();

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async stored(): Promise<StoredLibrary | undefined> {
    const index = await this.ctx.storage.get<LibraryIndex>('index');
    if (!index) return undefined;
    const boards = await this.ctx.storage.get<BoardDesign>(index.order.map(boardKey));
    return {
      categories: index.categories,
      boards: index.order.map(id => boards.get(boardKey(id))).filter((b): b is BoardDesign => !!b),
      knownBuiltins: index.knownBuiltins,
    };
  }

  /** Write the index plus any boards that changed or were never stored. */
  private async write(stored: StoredLibrary | undefined, next: StoredLibrary, changed: string[] = []) {
    const missing = next.boards.filter(b => changed.includes(b.id) || !stored?.boards.some(o => o.id === b.id));
    const index: LibraryIndex = {
      categories: next.categories,
      order: next.boards.map(b => b.id),
      knownBuiltins: next.knownBuiltins,
    };
    for (let i = 0; i < missing.length; i += 100)
      await this.ctx.storage.put(Object.fromEntries(missing.slice(i, i + 100).map(b => [boardKey(b.id), b])));
    await this.ctx.storage.put('index', index);
    const gone = (stored?.boards ?? []).filter(b => !next.boards.some(n => n.id === b.id)).map(b => boardKey(b.id));
    if (gone.length) await this.ctx.storage.delete(gone);
  }

  async library(): Promise<BoardLibrary> {
    return this.serial(async () => {
      const { categories, boards } = mergeLibrary(await this.stored());
      return { categories, boards };
    });
  }

  async board(id: string): Promise<BoardDesign | null> {
    return this.serial(async () => mergeLibrary(await this.stored()).boards.find(b => b.id === id) ?? null);
  }

  /** Create or replace one board, keeping its place in the list. */
  async saveBoard(raw: unknown): Promise<LibraryResult<BoardDesign>> {
    return this.serial(() =>
      attempt(async () => {
        const stored = await this.stored();
        const library = mergeLibrary(stored);
        const design = parseDesign(
          raw,
          library.categories.map(c => c.id),
        );
        design.updatedAt = Date.now();
        const at = library.boards.findIndex(b => b.id === design.id);
        if (at < 0 && library.boards.length >= DESIGN_LIMITS.boards)
          throw new ProtocolError(`The library holds at most ${DESIGN_LIMITS.boards} boards.`);
        const boards = [...library.boards];
        if (at < 0) boards.push(design);
        else boards[at] = design;
        await this.write(stored, { ...library, boards }, [design.id]);
        return design;
      }),
    );
  }

  async deleteBoard(id: string): Promise<LibraryResult<null>> {
    return this.serial(() =>
      attempt(async () => {
        const stored = await this.stored();
        const library = mergeLibrary(stored);
        if (!library.boards.some(b => b.id === id)) throw new ProtocolError('That board does not exist.', 404);
        await this.write(stored, { ...library, boards: library.boards.filter(b => b.id !== id) });
        return null;
      }),
    );
  }

  /** Replace the category list and the order (and category) of every board. */
  async saveLayout(raw: unknown): Promise<LibraryResult<BoardLibrary>> {
    return this.serial(() =>
      attempt(async () => {
        const stored = await this.stored();
        const library = mergeLibrary(stored);
        if (!record(raw) || !Array.isArray(raw.order)) throw new ProtocolError('Invalid layout.');
        const categories = parseCategories(raw.categories);
        const order = raw.order as { id?: unknown; categoryId?: unknown }[];
        const ids = order.map(entry => entry?.id);
        if (ids.length !== library.boards.length || !library.boards.every(b => ids.includes(b.id)))
          throw new ProtocolError('The layout must list every board once.');
        const boards = order.map(entry => {
          const board = library.boards.find(b => b.id === entry.id)!;
          if (!categories.some(c => c.id === entry.categoryId))
            throw new ProtocolError('Every board needs a category that exists.');
          return board.categoryId === entry.categoryId ? board : { ...board, categoryId: entry.categoryId as string };
        });
        const changed = boards.filter(b => !library.boards.includes(b)).map(b => b.id);
        await this.write(stored, { ...library, categories, boards }, changed);
        return { categories, boards };
      }),
    );
  }
}
