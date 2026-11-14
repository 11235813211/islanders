// Board designs: types, validation, balanced generation, and the built-in maps.
export { BUILTIN_BOARDS, BUILTIN_CATEGORIES } from './builtin';
export { buildBoard } from './generate';
export { autoHarbors, coastEdges } from './harbors';
export { findBoard, isAdminOnlyCategory, mergeLibrary, publicLibrary, type StoredLibrary } from './library';
export { upgradeDesign } from './numbers';
export * from './special';
export * from './types';
export { DESIGN_LIMITS, DesignError, LINK_LETTERS, parseCategories, parseDesign } from './validate';
