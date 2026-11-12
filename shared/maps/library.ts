import { BUILTIN_BOARDS, BUILTIN_CATEGORIES } from './builtin';
import type { BoardDesign, BoardLibrary } from './types';

/** What the board library stores once an editor changes anything. */
export interface StoredLibrary extends BoardLibrary {
  /** Built-in board ids this library has already taken in (so deleting one sticks). */
  knownBuiltins: string[];
}

/**
 * The library players see: the stored one, plus any built-in boards added to the game since it
 * was saved. With nothing stored, the built-ins.
 */
export function mergeLibrary(stored: StoredLibrary | undefined): StoredLibrary {
  if (!stored)
    return {
      categories: structuredClone(BUILTIN_CATEGORIES),
      boards: structuredClone(BUILTIN_BOARDS),
      knownBuiltins: BUILTIN_BOARDS.map(b => b.id),
    };
  const categories = [...stored.categories];
  const boards = [...stored.boards];
  const fresh = BUILTIN_BOARDS.filter(b => !stored.knownBuiltins.includes(b.id) && !boards.some(o => o.id === b.id));
  for (const board of fresh) {
    if (!categories.some(c => c.id === board.categoryId)) {
      const builtin = BUILTIN_CATEGORIES.find(c => c.id === board.categoryId);
      if (builtin) categories.push(builtin);
    }
    boards.push(structuredClone(board));
  }
  return { categories, boards, knownBuiltins: [...new Set([...stored.knownBuiltins, ...fresh.map(b => b.id)])] };
}

/** A board by id from the merged library. */
export function findBoard(library: BoardLibrary, id: string): BoardDesign | undefined {
  return library.boards.find(b => b.id === id);
}

/** Categories named "AI Training" hold edge-case boards made for bot training, playable only by admins. */
export function isAdminOnlyCategory(category: { name: string }): boolean {
  return /ai training/i.test(category.name);
}

/** The library as non-admins see it: without admin-only categories and their boards. */
export function publicLibrary(library: BoardLibrary): BoardLibrary {
  const hidden = new Set(library.categories.filter(isAdminOnlyCategory).map(c => c.id));
  return {
    categories: library.categories.filter(c => !hidden.has(c.id)),
    boards: library.boards.filter(b => !hidden.has(b.categoryId)),
  };
}
